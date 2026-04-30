const jwt = require('jsonwebtoken');
const config = require('../../config');
const { sendUnauthorized } = require('../utils/apiResponse');
const { query } = require('../../config/database');

/**
 * Verify the Bearer JWT and attach `req.user` and `req.organizationId`.
 * Also validates that the user still exists and is active.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendUnauthorized(res, 'No token provided');
  }

  const token = authHeader.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendUnauthorized(res, 'Token expired');
    }
    return sendUnauthorized(res, 'Invalid token');
  }

  try {
    const result = await query(
      `SELECT u.id, u.email, u.role, u.is_active, u.organization_id,
              o.slug AS org_slug, o.plan, o.type AS org_type,
              o.is_active AS org_active,
              o.subscription_status, o.trial_ends_at, o.trial_member_limit
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = $1`,
      [payload.sub]
    );

    if (result.rows.length === 0) {
      return sendUnauthorized(res, 'User not found');
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return sendUnauthorized(res, 'Account deactivated');
    }

    if (!user.org_active) {
      return sendUnauthorized(res, 'Organization suspended');
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organization_id,
      orgSlug: user.org_slug,
      orgType: user.org_type,
      plan: user.plan,
      subscriptionStatus: user.subscription_status,
    };

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = authenticate;
