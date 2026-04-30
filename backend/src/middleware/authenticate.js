const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db/pool');
const { unauthorized } = require('../utils/apiResponse');

/**
 * Verifies the Bearer JWT, loads the user + tenant context,
 * and attaches them to `req.user` and `req.tenant`.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, 'Missing or malformed Authorization header');
  }

  const token = authHeader.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return unauthorized(res, 'Invalid or expired token');
  }

  const userResult = await query(
    `SELECT u.id, u.email, u.role, u.organization_id, u.is_active,
            o.slug AS org_slug, o.plan AS org_plan, o.is_active AS org_active
     FROM   users u
     JOIN   organizations o ON o.id = u.organization_id
     WHERE  u.id = $1`,
    [payload.sub],
  );

  if (!userResult.rows.length) {
    return unauthorized(res, 'User not found');
  }

  const user = userResult.rows[0];

  if (!user.is_active) {
    return unauthorized(res, 'Account is disabled');
  }

  if (!user.org_active) {
    return unauthorized(res, 'Organization is suspended');
  }

  req.user   = user;
  req.tenant = { id: user.organization_id, slug: user.org_slug, plan: user.org_plan };
  next();
}

module.exports = authenticate;
