/**
 * Subscription Service
 *
 * Handles:
 *   1. Trial expiration checks & automatic status transitions
 *   2. Subscription activation (payment success webhook)
 *   3. Subscription cancellation / reactivation
 *   4. Seat-limit enforcement during trial
 *   5. Expiration sweep (cron-ready)
 */
const { v4: uuidv4 }         = require('uuid');
const { query, withTransaction } = require('../../db/pool');
const { buildTrialParams, isHibernated } = require('../../utils/subscription');
const logger                  = require('../../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

async function getSubscriptionStatus(orgId) {
  const result = await query(
    `SELECT id, name, slug, type, plan, is_active,
            subscription_status, trial_ends_at, subscription_ends_at,
            max_seats, subscribed_at, payment_provider,
            payment_customer_id, payment_subscription_id
     FROM   organizations
     WHERE  id = $1`,
    [orgId],
  );
  if (!result.rows.length) {
    const err = new Error('Organization not found');
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Trial expiration check (called on every authenticated request for the org)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * If the org is still 'trialing' but trial_ends_at has passed,
 * atomically transition it to 'expired' and log the event.
 *
 * Returns the (potentially updated) subscription_status string.
 */
async function checkAndExpireTrial(orgId) {
  const result = await query(
    `SELECT subscription_status, trial_ends_at
     FROM   organizations
     WHERE  id = $1`,
    [orgId],
  );

  if (!result.rows.length) return null;

  const { subscription_status, trial_ends_at } = result.rows[0];

  if (subscription_status !== 'trialing') return subscription_status;

  if (trial_ends_at && new Date(trial_ends_at) <= new Date()) {
    await expireTrial(orgId);
    return 'expired';
  }

  return subscription_status;
}

async function expireTrial(orgId) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE organizations
       SET subscription_status = 'expired', updated_at = NOW()
       WHERE id = $1 AND subscription_status = 'trialing'`,
      [orgId],
    );
    await client.query(
      `INSERT INTO subscription_events
         (id, organization_id, event_type, payload)
       VALUES ($1, $2, 'trial.expired', '{}')`,
      [uuidv4(), orgId],
    );
  });
  logger.info('Trial expired', { orgId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Activation (payment success)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Activate a paid subscription. Called by payment webhook handler.
 * - Sets status → 'active'
 * - Removes seat caps (sets max_seats to NULL = unlimited)
 * - Records subscription provider IDs
 */
async function activateSubscription(orgId, {
  plan,
  subscriptionEndsAt,
  paymentProvider,
  paymentCustomerId,
  paymentSubscriptionId,
  providerEventId,
}) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE organizations
       SET subscription_status      = 'active',
           plan                     = $2,
           subscription_ends_at     = $3,
           max_seats                = NULL,
           subscribed_at            = COALESCE(subscribed_at, NOW()),
           payment_provider         = $4,
           payment_customer_id      = $5,
           payment_subscription_id  = $6,
           updated_at               = NOW()
       WHERE id = $1`,
      [orgId, plan, subscriptionEndsAt, paymentProvider, paymentCustomerId, paymentSubscriptionId],
    );
    await client.query(
      `INSERT INTO subscription_events
         (id, organization_id, event_type, provider, provider_event_id, payload)
       VALUES ($1, $2, 'subscription.activated', $3, $4, $5)`,
      [uuidv4(), orgId, paymentProvider, providerEventId,
       JSON.stringify({ plan, subscriptionEndsAt })],
    );
  });
  logger.info('Subscription activated', { orgId, plan });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancellation / Reactivation
// ─────────────────────────────────────────────────────────────────────────────

async function cancelSubscription(orgId, reason = '') {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE organizations
       SET subscription_status = 'cancelled', updated_at = NOW()
       WHERE id = $1`,
      [orgId],
    );
    await client.query(
      `INSERT INTO subscription_events
         (id, organization_id, event_type, payload)
       VALUES ($1, $2, 'subscription.cancelled', $3)`,
      [uuidv4(), orgId, JSON.stringify({ reason })],
    );
  });
  logger.info('Subscription cancelled', { orgId });
}

async function reactivateSubscription(orgId, { subscriptionEndsAt, paymentSubscriptionId }) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE organizations
       SET subscription_status     = 'active',
           subscription_ends_at    = $2,
           payment_subscription_id = $3,
           max_seats               = NULL,
           updated_at              = NOW()
       WHERE id = $1`,
      [orgId, subscriptionEndsAt, paymentSubscriptionId],
    );
    await client.query(
      `INSERT INTO subscription_events
         (id, organization_id, event_type, payload)
       VALUES ($1, $2, 'subscription.reactivated', '{}')`,
      [uuidv4(), orgId],
    );
  });
  logger.info('Subscription reactivated', { orgId });
}

// ─────────────────────────────────────────────────────────────────────────────
// Seat-limit helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current active member count for the org (owner included).
 */
async function getActiveSeatCount(orgId) {
  const result = await query(
    'SELECT COUNT(*) FROM users WHERE organization_id = $1 AND is_active = true',
    [orgId],
  );
  return parseInt(result.rows[0].count, 10);
}

/**
 * Enforce seat limits during trial. Throws 402 if the limit would be exceeded.
 * `max_seats = NULL` means unlimited (paid plan).
 */
async function assertSeatAvailable(orgId) {
  const org = await query(
    'SELECT subscription_status, max_seats, type FROM organizations WHERE id = $1',
    [orgId],
  );
  if (!org.rows.length) return;

  const { subscription_status, max_seats, type } = org.rows[0];

  // Paid plans (max_seats = NULL) → unlimited
  if (max_seats === null) return;

  const current = await getActiveSeatCount(orgId);

  if (current >= max_seats) {
    const statusMsg = subscription_status === 'trialing'
      ? `Your ${type} trial allows a maximum of ${max_seats} seat${max_seats === 1 ? '' : 's'}. Upgrade to add more members.`
      : `Seat limit reached (${max_seats}). Please upgrade your plan.`;

    const err = new Error(statusMsg);
    err.statusCode = 402;
    err.code       = 'SEAT_LIMIT_REACHED';
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Background sweep (cron / scheduler)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expire all trialing organizations whose trial window has closed.
 * Safe to call repeatedly (idempotent WHERE clause).
 * Returns the number of orgs transitioned.
 */
async function sweepExpiredTrials() {
  const result = await query(
    `UPDATE organizations
     SET subscription_status = 'expired', updated_at = NOW()
     WHERE subscription_status = 'trialing'
       AND trial_ends_at <= NOW()
     RETURNING id`,
  );

  const expired = result.rows;
  if (expired.length) {
    // Batch-insert audit events
    const values = expired
      .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, 'trial.expired', '{}')`)
      .join(', ');
    const params = expired.flatMap((r) => [uuidv4(), r.id]);
    await query(
      `INSERT INTO subscription_events (id, organization_id, event_type, payload) VALUES ${values}`,
      params,
    );
    logger.info(`Expired ${expired.length} trial(s)`, { ids: expired.map((r) => r.id) });
  }

  return expired.length;
}

/**
 * Expire active subscriptions whose subscription_ends_at has passed.
 */
async function sweepExpiredSubscriptions() {
  const result = await query(
    `UPDATE organizations
     SET subscription_status = 'expired', updated_at = NOW()
     WHERE subscription_status IN ('active', 'past_due')
       AND subscription_ends_at IS NOT NULL
       AND subscription_ends_at <= NOW()
     RETURNING id`,
  );

  const expired = result.rows;
  if (expired.length) {
    const values = expired
      .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, 'subscription.expired', '{}')`)
      .join(', ');
    const params = expired.flatMap((r) => [uuidv4(), r.id]);
    await query(
      `INSERT INTO subscription_events (id, organization_id, event_type, payload) VALUES ${values}`,
      params,
    );
    logger.info(`Expired ${expired.length} subscription(s)`, { ids: expired.map((r) => r.id) });
  }

  return expired.length;
}

module.exports = {
  getSubscriptionStatus,
  checkAndExpireTrial,
  expireTrial,
  activateSubscription,
  cancelSubscription,
  reactivateSubscription,
  getActiveSeatCount,
  assertSeatAvailable,
  sweepExpiredTrials,
  sweepExpiredSubscriptions,
};
