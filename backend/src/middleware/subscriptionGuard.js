/**
 * Subscription Guard Middleware
 *
 * Two distinct modes:
 *
 * 1. requireActiveSubscription  → Full gate. Blocks the request entirely if the
 *    org is hibernating or cancelled. Returns HTTP 402 with a structured error
 *    that the frontend maps to the "payment wall" UI. Used on mutating routes
 *    and any endpoint that invokes an external provider (Stripe/Airwallex).
 *
 * 2. requireNotCancelled → Softer gate. Allows hibernating orgs through so
 *    they can READ their historical data (Data Hibernation guarantee), but
 *    blocks permanently-cancelled accounts.
 *
 * Both middlewares call checkAndExpireIfNeeded() lazily on every request,
 * so there is no need for a separate cron job for the trial-expiry check
 * (though one can be added for high-volume deployments).
 *
 * The subscription context is attached to req.subscription by the
 * authenticate middleware (auth.js), so these guards are cheap — they
 * just inspect already-loaded state rather than issuing extra DB queries.
 */

const { checkAndExpireIfNeeded } = require('../services/subscription');
const logger = require('../services/logger');

// ── 402 response shape ────────────────────────────────────────────────────────

const makeLockedResponse = (status, daysExpiredAgo) => ({
  error: 'subscription_locked',
  code: 'SUBSCRIPTION_REQUIRED',
  subscriptionStatus: status,
  message:
    status === 'cancelled'
      ? 'Your subscription has been cancelled. Please contact support.'
      : `Your ${daysExpiredAgo === 0 ? 'trial/subscription expired today' : `trial/subscription expired ${daysExpiredAgo} day${daysExpiredAgo === 1 ? '' : 's'} ago`}. Reactivate to unlock all features.`,
  reactivationUrl: '/settings/billing',
});

const daysSince = (dateStr) => {
  if (!dateStr) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)));
};

// ── Lazy expiration check ─────────────────────────────────────────────────────

/**
 * Runs the expiration check and refreshes req.subscription.status in-place.
 * This makes every subsequent middleware in the chain see the current state.
 */
const runExpirationCheck = async (req) => {
  if (!req.subscription || !req.orgId) return;

  const { status, isTrialExpired, isSubscriptionExpired } = req.subscription;
  if ((status === 'trialing' && isTrialExpired) || (status === 'active' && isSubscriptionExpired)) {
    const newStatus = await checkAndExpireIfNeeded(req.orgId);
    req.subscription.status = newStatus;
    req.subscription.featuresLocked = newStatus === 'hibernating' || newStatus === 'cancelled';
    req.subscription.isHibernating = newStatus === 'hibernating';
    logger.info('Lazy expiration: org hibernated', { orgId: req.orgId });
  }
};

// ── Guard 1: requireActiveSubscription ───────────────────────────────────────

/**
 * Blocks requests when features are locked (hibernating or cancelled).
 * Use on: POST /payments, POST /api-keys, PUT /api-keys/:id/rotate,
 *         provider-calling routes, autofill endpoints.
 */
const requireActiveSubscription = async (req, res, next) => {
  try {
    await runExpirationCheck(req);

    if (!req.subscription) {
      return res.status(500).json({ error: 'Subscription context missing' });
    }

    const { status, featuresLocked, hibernatedAt } = req.subscription;

    if (featuresLocked) {
      return res.status(402).json(makeLockedResponse(status, daysSince(hibernatedAt)));
    }

    next();
  } catch (err) {
    next(err);
  }
};

// ── Guard 2: requireNotCancelled ─────────────────────────────────────────────

/**
 * Only blocks permanently-cancelled accounts.
 * Hibernating accounts can still READ their data.
 * Use on: GET routes for payments, api-keys (list/detail, but not decrypt).
 */
const requireNotCancelled = async (req, res, next) => {
  try {
    await runExpirationCheck(req);

    const { status } = req.subscription || {};
    if (status === 'cancelled') {
      return res.status(402).json(makeLockedResponse('cancelled', 0));
    }

    next();
  } catch (err) {
    next(err);
  }
};

// ── Guard 3: trialMemberLimitGuard ───────────────────────────────────────────

/**
 * Prevents adding members beyond the trial seat cap.
 * Use on: POST /users (invite), POST /invitations.
 * Reads the pre-computed subscription context and checks current seat count.
 */
const trialMemberLimitGuard = async (req, res, next) => {
  try {
    await runExpirationCheck(req);

    const sub = req.subscription;
    if (!sub) return next();

    if (sub.featuresLocked) {
      return res.status(402).json(makeLockedResponse(sub.status, daysSince(sub.hibernatedAt)));
    }

    if (sub.status === 'trialing' && sub.trialMemberLimit > 0) {
      const { query: dbQuery } = require('../config/database');
      const { rows } = await dbQuery(
        `SELECT COUNT(*) FROM users WHERE organization_id = $1 AND is_active = TRUE`,
        [req.orgId]
      );
      const count = parseInt(rows[0].count, 10);

      if (count >= sub.trialMemberLimit) {
        return res.status(403).json({
          error: 'trial_member_limit_reached',
          code: 'TRIAL_MEMBER_LIMIT',
          message: `Your trial allows up to ${sub.trialMemberLimit} active members. Upgrade your plan to add more.`,
          currentCount: count,
          limit: sub.trialMemberLimit,
        });
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requireActiveSubscription, requireNotCancelled, trialMemberLimitGuard };
