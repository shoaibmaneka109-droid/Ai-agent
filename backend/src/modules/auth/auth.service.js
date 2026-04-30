const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const { query, withTransaction } = require('../../config/database');
const { getTrialEndDate, getTrialMemberLimit } = require('../../config/trial');

const generateTokens = (userId, organizationId, role) => {
  const accessToken = jwt.sign(
    { sub: userId, organizationId, role, type: 'access' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  const refreshToken = jwt.sign(
    { sub: userId, organizationId, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  return { accessToken, refreshToken };
};

const register = async ({ email, password, firstName, lastName, orgName, orgType, plan = 'free' }) => {
  return withTransaction(async (client) => {
    // Validate org type
    const validTypes = ['solo', 'agency'];
    if (!validTypes.includes(orgType)) {
      const err = new Error(`Invalid organization type. Must be one of: ${validTypes.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    // Check email uniqueness
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      const err = new Error('An account with this email already exists');
      err.statusCode = 409;
      throw err;
    }

    // Create organization
    const orgSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 63);

    const uniqueSlug = `${orgSlug}-${uuidv4().slice(0, 8)}`;

    // Calculate trial window and member seat cap based on org type
    const trialStartsAt = new Date();
    const trialEndsAt = getTrialEndDate(orgType, trialStartsAt);
    const trialMemberLimit = getTrialMemberLimit(orgType);

    const orgResult = await client.query(
      `INSERT INTO organizations
         (name, slug, type, plan, subscription_status,
          trial_starts_at, trial_ends_at, trial_member_limit)
       VALUES ($1, $2, $3, $4, 'trialing', $5, $6, $7)
       RETURNING id, name, slug, type, plan,
                 subscription_status, trial_starts_at, trial_ends_at, trial_member_limit`,
      [orgName, uniqueSlug, orgType, plan, trialStartsAt, trialEndsAt, trialMemberLimit]
    );
    const org = orgResult.rows[0];

    // Record the trial_started event
    await client.query(
      `INSERT INTO subscription_events
         (organization_id, event_type, from_status, to_status, metadata)
       VALUES ($1, 'trial_started', NULL, 'trialing', $2)`,
      [
        org.id,
        JSON.stringify({
          orgType,
          trialDays: orgType === 'agency' ? 30 : 15,
          memberLimit: trialMemberLimit,
        }),
      ]
    );

    // Hash password and create owner user
    const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);
    const userResult = await client.query(
      `INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, 'owner')
       RETURNING id, email, first_name, last_name, role`,
      [org.id, email.toLowerCase(), passwordHash, firstName, lastName]
    );
    const user = userResult.rows[0];

    const tokens = generateTokens(user.id, org.id, user.role);

    // Persist refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [user.id, await bcrypt.hash(tokens.refreshToken, 8), expiresAt]
    );

    return { user, org, tokens };
  });
};

const login = async ({ email, password }) => {
  const result = await query(
    `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.role, u.is_active,
            u.organization_id,
            o.name AS org_name, o.slug AS org_slug, o.plan, o.type AS org_type,
            o.is_active AS org_active,
            o.subscription_status, o.trial_ends_at, o.hibernated_at, o.trial_member_limit
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE u.email = $1`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const user = result.rows[0];

  if (!user.is_active) {
    const err = new Error('Account deactivated. Please contact support.');
    err.statusCode = 401;
    throw err;
  }

  if (!user.org_active) {
    const err = new Error('Your organization has been suspended.');
    err.statusCode = 401;
    throw err;
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);
  if (!passwordValid) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  // Update last login timestamp
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const tokens = generateTokens(user.id, user.organization_id, user.role);

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, await bcrypt.hash(tokens.refreshToken, 8), expiresAt]
  );

  const { trialDaysRemaining } = require('../../config/trial');
  const daysLeft = user.subscription_status === 'trialing'
    ? trialDaysRemaining(user.trial_ends_at)
    : null;

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    },
    org: {
      id: user.organization_id,
      name: user.org_name,
      slug: user.org_slug,
      type: user.org_type,
      plan: user.plan,
      subscriptionStatus: user.subscription_status,
      trialEndsAt: user.trial_ends_at,
      hibernatedAt: user.hibernated_at,
      trialMemberLimit: user.trial_member_limit,
      daysRemaining: daysLeft,
      hasFullAccess:
        user.subscription_status === 'trialing' ||
        user.subscription_status === 'active',
    },
    tokens,
  };
};

const refreshAccessToken = async (refreshToken) => {
  const jwt_module = require('jsonwebtoken');
  let payload;
  try {
    payload = jwt_module.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    throw err;
  }

  if (payload.type !== 'refresh') {
    const err = new Error('Invalid token type');
    err.statusCode = 401;
    throw err;
  }

  // Verify token exists in DB and is not expired
  const result = await query(
    `SELECT rt.id, rt.token_hash, u.role, u.organization_id, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.user_id = $1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()`,
    [payload.sub]
  );

  let matchedRow = null;
  for (const row of result.rows) {
    const bcrypt = require('bcryptjs');
    const matches = await bcrypt.compare(refreshToken, row.token_hash);
    if (matches) { matchedRow = row; break; }
  }

  if (!matchedRow || !matchedRow.is_active) {
    const err = new Error('Refresh token not found or revoked');
    err.statusCode = 401;
    throw err;
  }

  const tokens = generateTokens(payload.sub, matchedRow.organization_id, matchedRow.role);

  // Rotate: revoke old, store new
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [matchedRow.id]);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const bcrypt = require('bcryptjs');
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [payload.sub, await bcrypt.hash(tokens.refreshToken, 8), expiresAt]
  );

  return tokens;
};

const logout = async (userId) => {
  await query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
};

module.exports = { register, login, refreshAccessToken, logout };
