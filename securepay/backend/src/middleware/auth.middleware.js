const jwt = require('jsonwebtoken');
const jwtConfig = require('../config/jwt');
const { query } = require('../config/database');
const { unauthorized, forbidden } = require('../utils/apiResponse');

/**
 * Verifies the JWT access token from the Authorization header.
 * Attaches req.user = { id, tenantId, role, email } on success.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, 'Missing or malformed Authorization header');
  }

  const token = authHeader.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, jwtConfig.accessToken.secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return unauthorized(res, 'Access token expired');
    }
    return unauthorized(res, 'Invalid access token');
  }

  try {
    const { rows } = await query(
      `SELECT u.id, u.tenant_id, u.role, u.email, u.status, u.first_name, u.last_name
       FROM users u
       WHERE u.id = $1 AND u.tenant_id = $2`,
      [payload.sub, payload.tenantId],
    );

    if (!rows.length) return unauthorized(res, 'User not found');
    const user = rows[0];

    if (user.status !== 'active') return forbidden(res, 'Account is not active');

    req.user = {
      id: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Role-based authorization guard.
 * Usage: authorize('owner', 'admin')
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return unauthorized(res);
    if (!allowedRoles.includes(req.user.role)) {
      return forbidden(res, 'Insufficient permissions');
    }
    next();
  };
}

module.exports = { authenticate, authorize };
