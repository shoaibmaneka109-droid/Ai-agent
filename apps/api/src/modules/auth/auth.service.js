const crypto = require("crypto");

const { pool } = require("../../shared/db/pool");
const { hashPassword, verifyPassword } = require("../../shared/auth/password");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getTokenExpiryFromNow,
} = require("../../shared/auth/jwt");
const {
  computeSubscriptionStatus,
  buildTrialSubscriptionInput,
  assertSeatLimitForMembershipCount,
} = require("../subscriptions/subscriptions.service");
const { HttpError } = require("../../shared/http/errors");

const DEFAULT_MEMBER_ROLE = "member";
const DEFAULT_OWNER_ROLE = "owner";
const DEFAULT_ADMIN_ROLE = "admin";

async function withTransaction(task) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await task(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function normalizeTenantType(tenantType) {
  const normalized = String(tenantType || "").trim().toLowerCase();

  if (!["solo", "agency"].includes(normalized)) {
      throw new HttpError(400, "tenantType must be either solo or agency.");
  }

  return normalized;
}

function normalizeRole(role, tenantType) {
  if (role) {
    const normalized = String(role).trim().toLowerCase();

    if (!["owner", "admin", "member", "billing"].includes(normalized)) {
      throw new HttpError(400, "role must be owner, admin, member, or billing.");
    }

    return normalized;
  }

  return tenantType === "agency" ? DEFAULT_ADMIN_ROLE : DEFAULT_OWNER_ROLE;
}

function buildTenantSlug(displayName) {
  return String(displayName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildSessionResponse(user, membership, subscription) {
  const subscriptionStatus = computeSubscriptionStatus(subscription);

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isPlatformAdmin: user.is_platform_admin,
    },
    tenant: membership
      ? {
          id: membership.tenant_id,
          slug: membership.tenant_slug,
          displayName: membership.tenant_display_name,
          tenantType: membership.tenant_type,
          role: membership.role,
          employeeSeatLimitDuringTrial:
            membership.tenant_type === "agency" ? 9 : 0,
          totalMembershipLimitDuringTrial:
            membership.tenant_type === "agency" ? 10 : 1,
        }
      : null,
    subscription: subscriptionStatus,
    permissions: {
      canUseApi: subscriptionStatus.capabilities.apiEnabled,
      canUseAutofill: subscriptionStatus.capabilities.autofillEnabled,
      canViewData: subscriptionStatus.capabilities.dataViewEnabled,
      isReadOnly: subscriptionStatus.hibernation,
    },
  };
}

async function createRefreshSession(client, userId) {
  const refreshTokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken({
    sub: userId,
    jti: refreshTokenId,
    type: "refresh",
  });

  const refreshTokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  await client.query(
    `
      INSERT INTO auth_refresh_sessions (
        id,
        user_id,
        refresh_token_hash,
        expires_at
      )
      VALUES ($1, $2, $3, NOW() + ($4 || ' seconds')::interval)
    `,
    [refreshTokenId, userId, refreshTokenHash, getTokenExpiryFromNow().refreshTokenTtl],
  );

  return refreshToken;
}

async function issueAuthTokens(client, userId) {
  const membership = await getPrimaryMembership(client, userId, null);
  const subscription = membership
    ? await getActiveSubscription(client, membership.tenant_id)
    : null;
  const subscriptionStatus = computeSubscriptionStatus(subscription);
  const accessToken = signAccessToken({
    sub: userId,
    email: membership?.email || undefined,
    tenantId: membership?.tenant_id || null,
    role: membership?.role || null,
    tenantType: membership?.tenant_type || null,
    subscriptionState: subscriptionStatus.status,
    hibernationState: subscriptionStatus.hibernation ? "hibernated" : "active",
    featuresLocked: subscriptionStatus.featuresLocked,
    canAccessData: subscriptionStatus.capabilities.dataViewEnabled,
    type: "access",
  });
  const refreshToken = await createRefreshSession(client, userId);

  return { accessToken, refreshToken, membership, subscription };
}

async function getPrimaryMembership(client, userId, requestedTenantId = null) {
  const result = await client.query(
    `
      SELECT
        tm.id,
        tm.role,
        tm.tenant_id,
        t.slug AS tenant_slug,
        t.display_name AS tenant_display_name,
        t.tenant_type,
        t.owner_user_id
      FROM tenant_memberships tm
      INNER JOIN tenants t ON t.id = tm.tenant_id
      WHERE tm.user_id = $1
        AND ($2::uuid IS NULL OR tm.tenant_id = $2::uuid)
      ORDER BY
        CASE tm.role
          WHEN 'owner' THEN 1
          WHEN 'admin' THEN 2
          WHEN 'billing' THEN 3
          ELSE 4
        END,
        tm.created_at ASC
      LIMIT 1
    `,
    [userId, requestedTenantId],
  );

  return result.rows[0] || null;
}

async function getActiveSubscription(client, tenantId) {
  const result = await client.query(
    `
      SELECT *
      FROM tenant_subscriptions
      WHERE tenant_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [tenantId],
  );

  return result.rows[0] || null;
}

async function registerUser(payload) {
  const {
    email,
    password,
    firstName = null,
    lastName = null,
    displayName,
    tenantType,
    tenantSlug,
  } = payload || {};

  if (!email || !password || !displayName || !tenantType) {
      throw new HttpError(
      400,
      "email, password, displayName, and tenantType are required.",
    );
  }

  const normalizedTenantType = normalizeTenantType(tenantType);

  return withTransaction(async (client) => {
    const existingUser = await client.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [String(email).trim().toLowerCase()],
    );

    if (existingUser.rowCount > 0) {
      throw new HttpError(409, "An account with this email already exists.");
    }

    const userId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const passwordHash = hashPassword(password);
    const resolvedTenantSlug =
      tenantSlug || `${buildTenantSlug(displayName)}-${tenantId.slice(0, 8)}`;

    const userResult = await client.query(
      `
        INSERT INTO users (id, email, password_hash, first_name, last_name)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [userId, String(email).trim().toLowerCase(), passwordHash, firstName, lastName],
    );

    await client.query(
      `
        INSERT INTO tenants (id, slug, tenant_type, display_name, owner_user_id)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [tenantId, resolvedTenantSlug, normalizedTenantType, displayName, userId],
    );

    await client.query(
      `
        INSERT INTO tenant_memberships (tenant_id, user_id, role)
        VALUES ($1, $2, $3)
      `,
      [tenantId, userId, normalizedTenantType === "agency" ? DEFAULT_ADMIN_ROLE : DEFAULT_OWNER_ROLE],
    );

    const trialInput = buildTrialSubscriptionInput({
      tenantId,
      tenantType: normalizedTenantType,
    });

    const subscriptionResult = await client.query(
      `
        INSERT INTO tenant_subscriptions (
          tenant_id,
          plan_name,
          status,
          lifecycle_state,
          is_trial,
          trial_started_at,
          trial_ends_at,
          current_period_ends_at,
          hibernates_at,
          seat_limit,
          feature_lock_state
        )
        VALUES (
          $1, $2, $3, $4, TRUE, NOW(), $5, $5, $5, $6, $7
        )
        RETURNING *
      `,
      [
        trialInput.tenantId,
        trialInput.planName,
        trialInput.status,
        trialInput.lifecycleState,
        trialInput.trialEndsAt,
        trialInput.seatLimit,
        trialInput.featureLockState,
      ],
    );

    const tokens = await issueAuthTokens(client, userId);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      session: buildSessionResponse(
        userResult.rows[0],
        tokens.membership,
        tokens.subscription || subscriptionResult.rows[0],
      ),
    };
  });
}

async function loginUser(payload) {
  const { email, password, tenantId = null } = payload || {};

  if (!email || !password) {
    throw new HttpError(400, "email and password are required.");
  }

  return withTransaction(async (client) => {
    const userResult = await client.query(
      "SELECT * FROM users WHERE email = $1 LIMIT 1",
      [String(email).trim().toLowerCase()],
    );

    if (userResult.rowCount === 0) {
      throw new HttpError(401, "Invalid email or password.");
    }

    const user = userResult.rows[0];
    const passwordIsValid = verifyPassword(password, user.password_hash);

    if (!passwordIsValid) {
      throw new HttpError(401, "Invalid email or password.");
    }

    await client.query(
      "UPDATE users SET last_login_at = NOW() WHERE id = $1",
      [user.id],
    );

    const membership = await getPrimaryMembership(client, user.id, tenantId);
    const subscription = membership
      ? await getActiveSubscription(client, membership.tenant_id)
      : null;
    const subscriptionStatus = computeSubscriptionStatus(subscription);
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      tenantId: membership?.tenant_id || null,
      role: membership?.role || null,
      tenantType: membership?.tenant_type || null,
      subscriptionState: subscriptionStatus.status,
      hibernationState: subscriptionStatus.hibernation ? "hibernated" : "active",
      featuresLocked: subscriptionStatus.featuresLocked,
      canAccessData: subscriptionStatus.capabilities.dataViewEnabled,
      type: "access",
    });
    const refreshToken = await createRefreshSession(client, user.id);

    return {
      accessToken,
      refreshToken,
      session: buildSessionResponse(user, membership, subscription),
    };
  });
}

async function refreshUserSession(payload) {
  const { refreshToken } = payload || {};

  if (!refreshToken) {
    throw new HttpError(400, "refreshToken is required.");
  }

  const decoded = verifyRefreshToken(refreshToken);
  const refreshTokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  return withTransaction(async (client) => {
    const sessionResult = await client.query(
      `
        SELECT *
        FROM auth_refresh_sessions
        WHERE id = $1
          AND user_id = $2
          AND refresh_token_hash = $3
          AND revoked_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `,
      [decoded.jti, decoded.sub, refreshTokenHash],
    );

    if (sessionResult.rowCount === 0) {
      throw new HttpError(401, "Refresh token is invalid or expired.");
    }

    await client.query(
      "UPDATE auth_refresh_sessions SET revoked_at = NOW() WHERE id = $1",
      [decoded.jti],
    );

    const userResult = await client.query(
      "SELECT * FROM users WHERE id = $1 LIMIT 1",
      [decoded.sub],
    );
    const membership = await getPrimaryMembership(client, decoded.sub, null);
    const subscription = membership
      ? await getActiveSubscription(client, membership.tenant_id)
      : null;
    const subscriptionStatus = computeSubscriptionStatus(subscription);
    const accessToken = signAccessToken({
      sub: decoded.sub,
      email: userResult.rows[0].email,
      tenantId: membership?.tenant_id || null,
      role: membership?.role || null,
      tenantType: membership?.tenant_type || null,
      subscriptionState: subscriptionStatus.status,
      hibernationState: subscriptionStatus.hibernation ? "hibernated" : "active",
      featuresLocked: subscriptionStatus.featuresLocked,
      canAccessData: subscriptionStatus.capabilities.dataViewEnabled,
      type: "access",
    });
    const nextRefreshToken = await createRefreshSession(client, decoded.sub);

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      session: buildSessionResponse(
        userResult.rows[0],
        membership,
        subscription,
      ),
    };
  });
}

async function getSessionForUser(userId, tenantId = null) {
  const client = await pool.connect();

  try {
    const userResult = await client.query(
      "SELECT * FROM users WHERE id = $1 LIMIT 1",
      [userId],
    );

    if (userResult.rowCount === 0) {
      throw new HttpError(404, "User not found.");
    }

    const membership = await getPrimaryMembership(client, userId, tenantId);
    const subscription = membership
      ? await getActiveSubscription(client, membership.tenant_id)
      : null;

    return buildSessionResponse(userResult.rows[0], membership, subscription);
  } finally {
    client.release();
  }
}

async function addEmployeeToTenant({ actorUserId, tenantId, email, role }) {
  if (!actorUserId || !tenantId || !email) {
    throw new HttpError(400, "actorUserId, tenantId, and email are required.");
  }

  return withTransaction(async (client) => {
    const actorMembershipResult = await client.query(
      `
        SELECT tm.*, t.tenant_type
        FROM tenant_memberships tm
        INNER JOIN tenants t ON t.id = tm.tenant_id
        WHERE tm.tenant_id = $1 AND tm.user_id = $2
        LIMIT 1
      `,
      [tenantId, actorUserId],
    );

    if (actorMembershipResult.rowCount === 0) {
      throw new HttpError(403, "Actor is not a member of this tenant.");
    }

    const actorMembership = actorMembershipResult.rows[0];

    if (!["owner", "admin"].includes(actorMembership.role)) {
      throw new HttpError(403, "Only tenant owners or admins can add employees.");
    }

    if (actorMembership.tenant_type !== "agency") {
      throw new HttpError(400, "Employee invites only apply to agency tenants.");
    }

    const subscription = await getActiveSubscription(client, tenantId);
    const membershipCountResult = await client.query(
      "SELECT COUNT(*)::int AS count FROM tenant_memberships WHERE tenant_id = $1",
      [tenantId],
    );
    const currentMembershipCount = membershipCountResult.rows[0].count;

    assertSeatLimitForMembershipCount(subscription, currentMembershipCount + 1);

    const userResult = await client.query(
      "SELECT id, email FROM users WHERE email = $1 LIMIT 1",
      [String(email).trim().toLowerCase()],
    );

    if (userResult.rowCount === 0) {
      throw new HttpError(
        404,
        "Employee user does not exist yet. Create the user before adding membership.",
      );
    }

    const employeeRole = normalizeRole(role, "agency");

    try {
      const membershipInsert = await client.query(
        `
          INSERT INTO tenant_memberships (tenant_id, user_id, role, invited_by_user_id)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `,
        [tenantId, userResult.rows[0].id, employeeRole, actorUserId],
      );

      return {
        membership: membershipInsert.rows[0],
        seatUsage: {
          current: currentMembershipCount + 1,
          employeeLimit: computeSubscriptionStatus(subscription).seatLimit,
          totalMembershipLimit: computeSubscriptionStatus(subscription).seatLimit + 1,
        },
      };
    } catch (error) {
      if (error.code === "23505") {
        throw new HttpError(409, "User is already a member of this tenant.");
      }

      throw error;
    }
  });
}

module.exports = {
  registerUser,
  loginUser,
  refreshUserSession,
  getSessionForUser,
  addEmployeeToTenant,
};
