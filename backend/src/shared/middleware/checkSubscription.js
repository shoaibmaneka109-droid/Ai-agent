const { query } = require('../../config/database');
const { hibernateOrganization } = require('../../modules/subscriptions/subscriptions.service');
const { trialDaysRemaining } = require('../../config/trial');
const logger = require('../utils/logger');

/**
 * checkSubscription
 *
 * Attaches a rich `req.subscription` object to every authenticated request.
 * Must be used AFTER `authenticate` (which sets req.user).
 *
 * Responsibilities:
 *  1. Load subscription columns from the organizations row.
 *  2. If the org is still 'trialing' but trial_ends_at has passed →
 *     atomically transition to 'hibernating' (lazy expiry check).
 *  3. Expose `req.subscription` for use by featureLock and route handlers.
 *
 * This does NOT block any requests by itself — that is featureLock's job.
 * Keeping the two concerns separate lets read-only endpoints pass through
 * while write/feature endpoints can selectively require full access.
 */
const checkSubscription = async (req, res, next) => {
  if (!req.user) return next(); // unauthenticated; nothing to do

  try {
    const result = await query(
      `SELECT subscription_status, trial_starts_at, trial_ends_at,
              hibernated_at, trial_member_limit, plan, type
       FROM organizations
       WHERE id = $1`,
      [req.user.organizationId]
    );

    if (result.rows.length === 0) return next();

    const org = result.rows[0];
    const now = new Date();

    let currentStatus = org.subscription_status;

    // ── Lazy trial expiry ──────────────────────────────────────────────────
    // If the trial window closed but we haven't run the background sweep yet,
    // hibernate the org right now on the first authenticated request.
    if (
      currentStatus === 'trialing' &&
      org.trial_ends_at &&
      new Date(org.trial_ends_at) < now
    ) {
      logger.info('Lazy trial expiry detected, hibernating org', {
        organizationId: req.user.organizationId,
      });
      await hibernateOrganization(req.user.organizationId, 'trial_expired');
      currentStatus = 'hibernating';
    }

    const daysLeft =
      currentStatus === 'trialing'
        ? trialDaysRemaining(org.trial_ends_at)
        : null;

    req.subscription = {
      status: currentStatus,
      plan: org.plan,
      orgType: org.type,
      trialEndsAt: org.trial_ends_at,
      hibernatedAt: org.hibernated_at,
      trialMemberLimit: org.trial_member_limit,
      daysRemaining: daysLeft,
      // Convenience booleans used by featureLock
      isActive: currentStatus === 'active',
      isTrialing: currentStatus === 'trialing',
      isHibernating: currentStatus === 'hibernating',
      isCancelled: currentStatus === 'cancelled',
      hasFullAccess: currentStatus === 'trialing' || currentStatus === 'active',
    };

    next();
  } catch (err) {
    // Non-fatal: log the error but don't block the request
    logger.error('checkSubscription middleware error', {
      error: err.message,
      organizationId: req.user?.organizationId,
    });
    next(err);
  }
};

module.exports = checkSubscription;
