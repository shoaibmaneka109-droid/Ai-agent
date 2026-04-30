const { sendForbidden } = require('../utils/apiResponse');

/**
 * Role-based access control middleware factory.
 *
 * Usage:
 *   router.delete('/users/:id', authenticate, authorize(['owner', 'admin']), handler)
 */
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendForbidden(res, 'Authentication required');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendForbidden(
        res,
        `Access denied. Required role: ${allowedRoles.join(' or ')}`
      );
    }

    next();
  };
};

/**
 * Ensure the request targets the authenticated user's own organization.
 * Prevents cross-tenant data access.
 */
const tenantGuard = (req, res, next) => {
  const orgId = req.params.organizationId || req.body.organizationId;

  if (orgId && orgId !== req.user.organizationId) {
    return sendForbidden(res, 'Cross-tenant access is not permitted');
  }

  next();
};

module.exports = { authorize, tenantGuard };
