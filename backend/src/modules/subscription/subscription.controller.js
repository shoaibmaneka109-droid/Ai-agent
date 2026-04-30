const { query } = require('../../config/database');
const {
  getSubscriptionContext,
  activateSubscription,
  cancelSubscription,
  enterHibernation,
} = require('../../services/subscription');
const logger = require('../../services/logger');

/**
 * GET /subscription
 * Returns the full subscription context for the current org.
 */
const getStatus = async (req, res, next) => {
  try {
    const ctx = await getSubscriptionContext(req.orgId);
    res.json(ctx);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /subscription/events
 * Returns the immutable subscription event ledger for auditing.
 */
const getEvents = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT se.id, se.event_type, se.from_status, se.to_status,
              se.note, se.metadata, se.created_at,
              u.full_name AS triggered_by_name, u.email AS triggered_by_email
       FROM subscription_events se
       LEFT JOIN users u ON u.id = se.triggered_by
       WHERE se.organization_id = $1
       ORDER BY se.created_at DESC
       LIMIT 50`,
      [req.orgId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /subscription/activate
 * Simulates payment confirmation and activates/reactivates subscription.
 *
 * In production this endpoint would be called by a Stripe/Airwallex webhook
 * after a successful charge, NOT exposed to the end user directly.
 * Here we expose it for demo/testing purposes behind owner role.
 *
 * Body: { durationDays?: number, note?: string }
 */
const activate = async (req, res, next) => {
  const { durationDays = 30, note } = req.body;
  try {
    const result = await activateSubscription(
      req.orgId,
      durationDays,
      req.user.id,
      note || 'Activated via API'
    );
    logger.info('Subscription activated via API', { orgId: req.orgId, userId: req.user.id, durationDays });
    const ctx = await getSubscriptionContext(req.orgId);
    res.json({ message: 'Subscription activated', subscriptionEndsAt: result.subscriptionEndsAt, subscription: ctx });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /subscription/cancel
 * Permanently cancels the subscription.
 */
const cancel = async (req, res, next) => {
  const { note } = req.body;
  try {
    await cancelSubscription(req.orgId, req.user.id, note);
    const ctx = await getSubscriptionContext(req.orgId);
    res.json({ message: 'Subscription cancelled', subscription: ctx });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /subscription/simulate-expire
 * DEV/TEST ONLY: immediately hibernates the org to test the Data Hibernation flow.
 * Blocked in production.
 */
const simulateExpire = async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }
  try {
    // Fast-forward trial_ends_at to the past so checkAndExpire fires
    await query(
      `UPDATE organizations
       SET trial_ends_at = NOW() - INTERVAL '1 minute',
           subscription_ends_at = CASE
             WHEN subscription_ends_at IS NOT NULL
             THEN NOW() - INTERVAL '1 minute'
             ELSE NULL
           END
       WHERE id = $1`,
      [req.orgId]
    );

    await enterHibernation(req.orgId, req.user.id, 'Simulated via API (test mode)');
    const ctx = await getSubscriptionContext(req.orgId);
    res.json({ message: 'Subscription hibernated (test)', subscription: ctx });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStatus, getEvents, activate, cancel, simulateExpire };
