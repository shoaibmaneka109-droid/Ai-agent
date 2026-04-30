/**
 * checkSubscription middleware
 *
 * Must run AFTER `authenticate` (requires req.tenant.id).
 *
 * Responsibilities:
 *   1. Lazily trigger trial expiration if trial_ends_at has passed.
 *   2. Re-attach the up-to-date subscription snapshot to req.tenant.subscription.
 *   3. Enforce Data Hibernation:
 *        - Hibernated orgs can always READ (GET) their own data → passes through.
 *        - Hibernated orgs cannot perform any WRITE, API-execution, or
 *          auto-fill action → 402 Payment Required.
 *
 * Usage options
 * ─────────────
 *   checkSubscription                   — allows GETs through, blocks writes on hibernation
 *   checkSubscription.requireActive     — blocks ALL methods when hibernated (strict gates)
 *   checkSubscription.readOnly          — explicitly marks route as read-only (same as default)
 *
 * The middleware also attaches req.tenant.subscription so downstream handlers
 * can make fine-grained decisions without hitting the DB again.
 */
const { query }                   = require('../db/pool');
const { checkAndExpireTrial }     = require('../modules/subscriptions/subscriptions.service');
const { buildSubscriptionSnapshot, isHibernated } = require('../utils/subscription');

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// ── Shared: load + possibly expire, then attach snapshot ─────────────────────

async function loadSubscription(req) {
  // Run expiration check (no-op if already expired / active / cancelled)
  await checkAndExpireTrial(req.tenant.id);

  const result = await query(
    `SELECT subscription_status, trial_ends_at, subscription_ends_at,
            max_seats, type
     FROM   organizations
     WHERE  id = $1`,
    [req.tenant.id],
  );

  const org = result.rows[0] || {};
  const snapshot = buildSubscriptionSnapshot(org);
  req.tenant.subscription = snapshot;
  return snapshot;
}

// ── Default: reads always pass, writes blocked when hibernated ────────────────

async function checkSubscription(req, res, next) {
  try {
    const snapshot = await loadSubscription(req);

    if (isHibernated(snapshot.status) && !READ_METHODS.has(req.method)) {
      return res.status(402).json({
        success: false,
        error: {
          message: 'Your subscription has expired. Renew to regain full access.',
          code:    'SUBSCRIPTION_HIBERNATED',
          subscription: snapshot,
        },
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

// ── Strict: ALL methods blocked when hibernated (use for API-execution routes) ─

checkSubscription.requireActive = async function requireActive(req, res, next) {
  try {
    const snapshot = await loadSubscription(req);

    if (isHibernated(snapshot.status)) {
      return res.status(402).json({
        success: false,
        error: {
          message: 'This feature requires an active subscription. Renew to continue.',
          code:    'SUBSCRIPTION_HIBERNATED',
          subscription: snapshot,
        },
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};

// ── Read-only: explicitly mark that writes are forbidden (same as default but
//    self-documenting at the route level) ─────────────────────────────────────
checkSubscription.readOnly = checkSubscription;

module.exports = checkSubscription;
