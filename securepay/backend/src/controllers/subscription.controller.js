const trialService = require('../services/trial.service');
const { query } = require('../config/database');
const { success, error } = require('../utils/apiResponse');

/**
 * GET /api/v1/subscription/status
 * Returns full subscription and access state for the authenticated tenant.
 * This is the endpoint the frontend polls to decide which UI to show.
 */
async function getStatus(req, res, next) {
  try {
    const { subscription, access } = await trialService.getSubscriptionStatus(req.tenant.id);

    // Tenant-level limits
    const { rows: tenantRows } = await query(
      `SELECT trial_employee_cap, current_employee_count, max_users, max_api_keys
       FROM tenants WHERE id = $1`,
      [req.tenant.id],
    );
    const tenantMeta = tenantRows[0] || {};

    return success(res, {
      subscription,
      access,
      limits: {
        trialEmployeeCap: tenantMeta.trial_employee_cap,
        currentEmployeeCount: tenantMeta.current_employee_count,
        maxUsers: tenantMeta.max_users,
        maxApiKeys: tenantMeta.max_api_keys,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/subscription/events
 * Returns the subscription event history (audit trail).
 */
async function getEvents(req, res, next) {
  try {
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
    const events = await trialService.getSubscriptionEvents(req.tenant.id, limit);
    return success(res, events);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/subscription/reactivate
 * Manually reactivates a hibernated/locked subscription (for use during
 * payment webhook processing or manual admin override).
 *
 * In production this would be triggered by a Stripe webhook, not directly.
 * The endpoint is here to allow direct integration testing and admin tools.
 *
 * Requires owner role.
 */
async function reactivate(req, res, next) {
  try {
    const billingInfo = {
      periodStart: req.body.periodStart,
      periodEnd: req.body.periodEnd,
      stripeSubscriptionId: req.body.stripeSubscriptionId,
      stripePriceId: req.body.stripePriceId,
    };
    const result = await trialService.reactivateSubscription(req.tenant.id, billingInfo);
    return success(res, result, 'Subscription reactivated successfully');
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/subscription/check-access
 * Lightweight endpoint: returns just the access flags.
 * The frontend calls this on mount to determine which features to enable.
 */
async function checkAccess(req, res, next) {
  try {
    const { access } = await trialService.getSubscriptionStatus(req.tenant.id);
    return success(res, access);
  } catch (err) {
    next(err);
  }
}

module.exports = { getStatus, getEvents, reactivate, checkAccess };
