const { query } = require('../config/database');
const { badRequest, forbidden, notFound } = require('../utils/apiResponse');

/**
 * Tenant resolution middleware.
 *
 * Resolves the tenant from either:
 *   1. req.user.tenantId (set by authenticate middleware, preferred)
 *   2. X-Tenant-ID header (for public-facing endpoints before auth)
 *   3. ?tenant= query param (fallback)
 *
 * Attaches req.tenant = { id, slug, name, plan, status, maxUsers, maxApiKeys }
 */
async function resolveTenant(req, res, next) {
  const tenantId =
    req.user?.tenantId ||
    req.headers['x-tenant-id'] ||
    req.query.tenant;

  if (!tenantId) {
    return badRequest(res, 'Tenant context is required');
  }

  try {
    const { rows } = await query(
      `SELECT id, slug, name, plan, status, max_users, max_api_keys, settings
       FROM tenants WHERE id = $1`,
      [tenantId],
    );

    if (!rows.length) return notFound(res, 'Tenant not found');
    const t = rows[0];

    if (t.status === 'suspended') return forbidden(res, 'Tenant account is suspended');
    if (t.status === 'cancelled') return forbidden(res, 'Tenant account has been cancelled');

    req.tenant = {
      id: t.id,
      slug: t.slug,
      name: t.name,
      plan: t.plan,
      status: t.status,
      maxUsers: t.max_users,
      maxApiKeys: t.max_api_keys,
      settings: t.settings,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Ensures the authenticated user belongs to the resolved tenant.
 * Must be used after both authenticate and resolveTenant.
 */
function enforceTenantScope(req, res, next) {
  if (!req.user || !req.tenant) {
    return forbidden(res, 'Tenant scope could not be verified');
  }
  if (req.user.tenantId !== req.tenant.id) {
    return forbidden(res, 'Access denied: cross-tenant operation');
  }
  next();
}

module.exports = { resolveTenant, enforceTenantScope };
