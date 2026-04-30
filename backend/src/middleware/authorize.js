const { forbidden } = require('../utils/apiResponse');

/**
 * Role-based access control middleware factory.
 * Usage: router.delete('/...', authenticate, authorize('owner', 'admin'), handler)
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return forbidden(res, 'Authentication required');
    }
    if (!allowedRoles.includes(req.user.role)) {
      return forbidden(res, `Requires one of roles: ${allowedRoles.join(', ')}`);
    }
    next();
  };
}

module.exports = authorize;
