const { verifyAccessToken } = require("../auth/jwt");
const { pool } = require("../db/pool");

async function loadUserContext(userId, tenantId = null) {
  const result = await pool.query(
    `
      SELECT
        u.id AS user_id,
        u.email,
        u.first_name,
        u.last_name,
        u.is_platform_admin,
        tm.id AS membership_id,
        tm.role,
        tm.tenant_id,
        t.slug AS tenant_slug,
        t.display_name AS tenant_display_name,
        t.tenant_type
      FROM users u
      LEFT JOIN tenant_memberships tm
        ON tm.user_id = u.id
      LEFT JOIN tenants t
        ON t.id = tm.tenant_id
      WHERE u.id = $1
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
    [userId, tenantId],
  );

  return result.rows[0] || null;
}

async function requireAuthenticatedUser(req, res, next) {
  try {
    const authorization = req.headers.authorization || "";
    const [scheme, token] = authorization.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        error: "Authorization bearer token is required.",
      });
    }

    const payload = verifyAccessToken(token);
    const userContext = await loadUserContext(payload.sub, req.context?.tenantId || null);

    if (!userContext) {
      return res.status(401).json({
        error: "Authenticated user could not be resolved.",
      });
    }

    req.auth = {
      userId: userContext.user_id,
      user: {
        id: userContext.user_id,
        email: userContext.email,
        firstName: userContext.first_name,
        lastName: userContext.last_name,
        isPlatformAdmin: userContext.is_platform_admin,
      },
      membership: userContext.membership_id
        ? {
            id: userContext.membership_id,
            role: userContext.role,
            tenantId: userContext.tenant_id,
            tenantSlug: userContext.tenant_slug,
            tenantDisplayName: userContext.tenant_display_name,
            tenantType: userContext.tenant_type,
          }
        : null,
    };

    if (!req.context) {
      req.context = {};
    }

    if (userContext.tenant_id) {
      req.context.tenantId = userContext.tenant_id;
    }

    return next();
  } catch (error) {
    return res.status(401).json({
      error: error.message || "Invalid access token.",
    });
  }
}

function requireTenantMembership(req, res, next) {
  if (!req.auth?.membership?.tenantId) {
    return res.status(403).json({
      error: "This action requires an active tenant membership.",
    });
  }

  return next();
}

function requireRoles(allowedRoles) {
  return (req, res, next) => {
    if (!req.auth?.membership?.role || !allowedRoles.includes(req.auth.membership.role)) {
      return res.status(403).json({
        error: "You do not have permission to perform this action.",
      });
    }

    return next();
  };
}

module.exports = {
  requireAuthenticatedUser,
  requireTenantMembership,
  requireRoles,
  loadUserContext,
};
