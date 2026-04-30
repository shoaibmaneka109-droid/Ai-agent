const { query } = require('../config/database');
const { badRequest, forbidden, notFound } = require('../utils/apiResponse');
const { computeAccess } = require('../services/trial.service');

/**
 * Tenant resolution middleware.
 *
 * Resolves the tenant from either:
 *   1. req.user.tenantId (set by authenticate middleware, preferred)
 *   2. X-Tenant-ID header (for public-facing endpoints before auth)
 *   3. ?tenant= query param (fallback)
 *
 * Attaches:
 *   req.tenant  = { id, slug, name, plan, status, maxUsers, maxApiKeys,
 *                   trialEmployeeCap, currentEmployeeCount, settings }
 *   req.access  = { apiAccess, autofillAccess, dataReadOnly, accessStatus, reason }
 *
 * NOTE: suspended/cancelled tenants are blocked at this layer (cannot log in).
 * Hibernated tenants ARE allowed through so users can view their data — the
 * subscription middleware gates individual features.
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
    // Single query joining tenant + subscription for full state
    const { rows } = await query(
      `SELECT
         t.id, t.slug, t.name, t.plan, t.status,
         t.max_users, t.max_api_keys, t.settings,
         t.trial_employee_cap, t.current_employee_count,
         s.id                        AS subscription_id,
         s.status                    AS subscription_status,
         s.trial_days,
         s.trial_started_at,
         s.trial_end,
         s.trial_expired_at,
         s.hibernation_started_at,
         s.grace_period_hours,
         s.api_access,
         s.autofill_access,
         s.data_read_only,
         s.current_period_end,
         s.cancelled_at
       FROM tenants t
       LEFT JOIN subscriptions s ON s.tenant_id = t.id
       WHERE t.id = $1`,
      [tenantId],
    );

    if (!rows.length) return notFound(res, 'Tenant not found');
    const t = rows[0];

    // Hard-block suspended or cancelled tenants entirely
    if (t.status === 'suspended') return forbidden(res, 'Tenant account is suspended');
    if (t.status === 'cancelled') return forbidden(res, 'Tenant account has been cancelled');

    // Build a subscription-like object for computeAccess
    const subRow = t.subscription_id
      ? {
          status: t.subscription_status,
          trial_end: t.trial_end,
          grace_period_hours: t.grace_period_hours ?? 24,
          api_access: t.api_access,
          autofill_access: t.autofill_access,
          data_read_only: t.data_read_only,
        }
      : null;

    req.tenant = {
      id: t.id,
      slug: t.slug,
      name: t.name,
      plan: t.plan,
      status: t.status,
      maxUsers: t.max_users,
      maxApiKeys: t.max_api_keys,
      settings: t.settings,
      trialEmployeeCap: t.trial_employee_cap,
      currentEmployeeCount: t.current_employee_count,
      // Subscription summary (used by downstream middleware)
      subscription: subRow
        ? {
            id: t.subscription_id,
            status: t.subscription_status,
            trialEnd: t.trial_end,
            trialExpiredAt: t.trial_expired_at,
            hibernationStartedAt: t.hibernation_started_at,
            gracePeriodHours: t.grace_period_hours,
            currentPeriodEnd: t.current_period_end,
          }
        : null,
    };

    // Pre-compute access flags so downstream middleware doesn't need another DB hit
    req.access = computeAccess(subRow);

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
