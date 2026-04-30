/**
 * Trial & Subscription Lifecycle Service
 *
 * Lifecycle states:
 *   trialing  → trial_end > now()              API + autofill: ON
 *   trialing  → trial_end < now() (grace)      API + autofill: ON  (grace_period_hours window)
 *   hibernating                                 data: READ-ONLY, API + autofill: OFF
 *   active    (paid)                            API + autofill: ON
 *   past_due                                    API + autofill: ON  (short leniency)
 *   cancelled                                   data: READ-ONLY, API + autofill: OFF
 *   unpaid                                      data: READ-ONLY, API + autofill: OFF
 *
 * Trial lengths (stored in subscription_plans.trial_days):
 *   solo   → 15 days
 *   agency → 30 days, employee cap = 9 (owner is seat 1, so max_users during trial = 10)
 */

const { query, getClient } = require('../config/database');
const logger = require('../utils/logger');

const TRIAL_DAYS = { solo: 15, agency: 30 };
// Agency trial: owner + up to 9 employees
const AGENCY_TRIAL_EMPLOYEE_CAP = 9;
const GRACE_PERIOD_HOURS = 24;

// ─── Access computation ────────────────────────────────────────────────────────

/**
 * Derives the live access flags from a subscription row.
 * Returns { apiAccess, autofillAccess, dataReadOnly, accessStatus, reason }
 *
 * accessStatus: 'full' | 'grace' | 'hibernated' | 'cancelled'
 */
function computeAccess(sub) {
  if (!sub) {
    return { apiAccess: false, autofillAccess: false, dataReadOnly: true, accessStatus: 'no_subscription', reason: 'No subscription found' };
  }

  const now = new Date();

  switch (sub.status) {
    case 'active':
      return { apiAccess: true, autofillAccess: true, dataReadOnly: false, accessStatus: 'full', reason: null };

    case 'trialing': {
      const trialEnd = new Date(sub.trial_end);
      if (now <= trialEnd) {
        // Trial still active
        return { apiAccess: true, autofillAccess: true, dataReadOnly: false, accessStatus: 'full', reason: null };
      }
      // Trial expired — check grace period
      const graceEnd = new Date(trialEnd.getTime() + sub.grace_period_hours * 60 * 60 * 1000);
      if (now <= graceEnd) {
        return {
          apiAccess: true, autofillAccess: true, dataReadOnly: false,
          accessStatus: 'grace',
          reason: `Trial expired. Grace period ends ${graceEnd.toISOString()}`,
        };
      }
      // Grace period also over — should have been hibernated by cron; treat as hibernated
      return {
        apiAccess: false, autofillAccess: false, dataReadOnly: true,
        accessStatus: 'hibernated',
        reason: 'Trial expired. Subscribe to re-enable API and autofill access.',
      };
    }

    case 'hibernating':
      return {
        apiAccess: false, autofillAccess: false, dataReadOnly: true,
        accessStatus: 'hibernated',
        reason: 'Account is hibernated. Your data is safe. Subscribe to restore full access.',
      };

    case 'past_due':
      // Short leniency window — still allow access but flag it
      return {
        apiAccess: true, autofillAccess: true, dataReadOnly: false,
        accessStatus: 'past_due',
        reason: 'Payment is past due. Please update your payment method to avoid interruption.',
      };

    case 'cancelled':
    case 'unpaid':
      return {
        apiAccess: false, autofillAccess: false, dataReadOnly: true,
        accessStatus: 'locked',
        reason: 'Subscription is inactive. Subscribe to restore access.',
      };

    default:
      return { apiAccess: false, autofillAccess: false, dataReadOnly: true, accessStatus: 'unknown', reason: 'Unknown subscription state' };
  }
}

// ─── Trial initialisation ─────────────────────────────────────────────────────

/**
 * Called during tenant registration (inside the same DB transaction).
 * Creates a 'trialing' subscription row using the plan's default trial length.
 *
 * @param {object} client  - pg PoolClient (shared transaction)
 * @param {string} tenantId
 * @param {'solo'|'agency'} plan
 * @returns {object} subscription row
 */
async function initTrial(client, tenantId, plan) {
  const trialDays = TRIAL_DAYS[plan] ?? 15;
  const trialEnd = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  // Fetch the first matching plan row (uses lowest-price plan of the type)
  const planResult = await client.query(
    `SELECT id FROM subscription_plans WHERE plan_type = $1 ORDER BY price_cents ASC LIMIT 1`,
    [plan],
  );
  if (!planResult.rows.length) throw new Error(`No subscription plan found for type: ${plan}`);
  const planId = planResult.rows[0].id;

  const { rows } = await client.query(
    `INSERT INTO subscriptions
       (tenant_id, plan_id, status, trial_days, trial_started_at, trial_end,
        grace_period_hours, api_access, autofill_access, data_read_only)
     VALUES ($1, $2, 'trialing', $3, NOW(), $4, $5, TRUE, TRUE, FALSE)
     RETURNING *`,
    [tenantId, planId, trialDays, trialEnd, GRACE_PERIOD_HOURS],
  );
  const sub = rows[0];

  // Set employee cap on tenants row for agency plans
  const trialEmployeeCap = plan === 'agency' ? AGENCY_TRIAL_EMPLOYEE_CAP : null;
  await client.query(
    `UPDATE tenants SET trial_employee_cap = $1 WHERE id = $2`,
    [trialEmployeeCap, tenantId],
  );

  // Log event
  await client.query(
    `INSERT INTO subscription_events (tenant_id, subscription_id, event_type, old_status, new_status, metadata)
     VALUES ($1, $2, 'trial_started', NULL, 'trialing', $3)`,
    [tenantId, sub.id, JSON.stringify({ trialDays, trialEnd })],
  );

  logger.info(`Trial started for tenant ${tenantId} (plan: ${plan}, ends: ${trialEnd.toISOString()})`);
  return sub;
}

// ─── Subscription status fetch (with live access computation) ─────────────────

async function getSubscriptionStatus(tenantId) {
  const { rows } = await query(
    `SELECT s.*, sp.name AS plan_name, sp.plan_type, sp.price_cents, sp.currency, sp.interval,
            sp.trial_days AS plan_trial_days, sp.features
     FROM subscriptions s
     JOIN subscription_plans sp ON sp.id = s.plan_id
     WHERE s.tenant_id = $1`,
    [tenantId],
  );

  if (!rows.length) {
    return { subscription: null, access: computeAccess(null) };
  }

  const sub = rows[0];
  const access = computeAccess(sub);

  // Days remaining in trial
  let trialDaysRemaining = null;
  if (sub.status === 'trialing' && sub.trial_end) {
    trialDaysRemaining = Math.max(0, Math.ceil((new Date(sub.trial_end) - new Date()) / 86400000));
  }

  return {
    subscription: {
      id: sub.id,
      status: sub.status,
      planName: sub.plan_name,
      planType: sub.plan_type,
      trialDays: sub.trial_days,
      trialStartedAt: sub.trial_started_at,
      trialEnd: sub.trial_end,
      trialDaysRemaining,
      trialExpiredAt: sub.trial_expired_at,
      hibernationStartedAt: sub.hibernation_started_at,
      currentPeriodEnd: sub.current_period_end,
      cancelledAt: sub.cancelled_at,
      features: sub.features,
      priceCents: sub.price_cents,
      currency: sub.currency,
      interval: sub.interval,
    },
    access,
  };
}

// ─── Expiry check (called by cron job) ────────────────────────────────────────

/**
 * Scans all 'trialing' subscriptions whose trial_end + grace period has passed
 * and transitions them to 'hibernating'. Updates access flags atomically.
 *
 * Returns the count of tenants that were hibernated.
 */
async function runExpiryCheck() {
  const client = await getClient();
  let hibernated = 0;

  try {
    await client.query('BEGIN');

    // Find subscriptions: trialing AND (trial_end + grace) < NOW()
    const { rows: expired } = await client.query(
      `SELECT s.id, s.tenant_id, s.trial_end, s.grace_period_hours
       FROM subscriptions s
       WHERE s.status = 'trialing'
         AND s.trial_end + (s.grace_period_hours * INTERVAL '1 hour') < NOW()
       FOR UPDATE SKIP LOCKED`,
    );

    for (const sub of expired) {
      // Transition to hibernating
      await client.query(
        `UPDATE subscriptions
         SET status = 'hibernating',
             trial_expired_at = trial_end,
             hibernation_started_at = NOW(),
             api_access = FALSE,
             autofill_access = FALSE,
             data_read_only = TRUE
         WHERE id = $1`,
        [sub.id],
      );

      await client.query(
        `INSERT INTO subscription_events
           (tenant_id, subscription_id, event_type, old_status, new_status, metadata)
         VALUES ($1, $2, 'trial_expired', 'trialing', 'hibernating', $3)`,
        [sub.tenant_id, sub.id, JSON.stringify({ trialEnd: sub.trial_end })],
      );

      logger.info(`Tenant ${sub.tenant_id} trial expired → hibernating`);
      hibernated++;
    }

    // Also handle 'past_due' subscriptions older than 7 days → lock them
    const { rows: pastDue } = await client.query(
      `SELECT s.id, s.tenant_id
       FROM subscriptions s
       WHERE s.status = 'past_due'
         AND s.updated_at < NOW() - INTERVAL '7 days'
       FOR UPDATE SKIP LOCKED`,
    );

    for (const sub of pastDue) {
      await client.query(
        `UPDATE subscriptions
         SET status = 'unpaid',
             api_access = FALSE,
             autofill_access = FALSE,
             data_read_only = TRUE
         WHERE id = $1`,
        [sub.id],
      );

      await client.query(
        `INSERT INTO subscription_events
           (tenant_id, subscription_id, event_type, old_status, new_status, metadata)
         VALUES ($1, $2, 'payment_failed_lock', 'past_due', 'unpaid', '{}')`,
        [sub.tenant_id, sub.id],
      );

      logger.warn(`Tenant ${sub.tenant_id} past_due 7+ days → unpaid/locked`);
    }

    await client.query('COMMIT');
    if (hibernated > 0) logger.info(`Expiry check: hibernated ${hibernated} tenant(s)`);
    return hibernated;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('runExpiryCheck failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// ─── Reactivation (after payment) ────────────────────────────────────────────

/**
 * Called when a successful payment webhook is received.
 * Transitions hibernating/unpaid → active and restores access flags.
 *
 * @param {string} tenantId
 * @param {object} billingInfo  - { periodStart, periodEnd, stripeSubscriptionId, stripePriceId }
 */
async function reactivateSubscription(tenantId, billingInfo = {}) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, status FROM subscriptions WHERE tenant_id = $1 FOR UPDATE`,
      [tenantId],
    );
    if (!rows.length) throw Object.assign(new Error('No subscription found'), { statusCode: 404 });

    const sub = rows[0];
    const oldStatus = sub.status;

    await client.query(
      `UPDATE subscriptions
       SET status = 'active',
           api_access = TRUE,
           autofill_access = TRUE,
           data_read_only = FALSE,
           trial_expired_at = COALESCE(trial_expired_at, NOW()),
           hibernation_started_at = NULL,
           cancel_at_period_end = FALSE,
           current_period_start = $2,
           current_period_end = $3,
           stripe_subscription_id = COALESCE($4, stripe_subscription_id),
           stripe_price_id = COALESCE($5, stripe_price_id),
           -- Remove trial_employee_cap — they are now paid
           cancelled_at = NULL
       WHERE id = $1`,
      [
        sub.id,
        billingInfo.periodStart || new Date(),
        billingInfo.periodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingInfo.stripeSubscriptionId || null,
        billingInfo.stripePriceId || null,
      ],
    );

    // Remove trial employee cap on the tenant now that they're paying
    await client.query(
      `UPDATE tenants SET trial_employee_cap = NULL WHERE id = $1`,
      [tenantId],
    );

    await client.query(
      `INSERT INTO subscription_events
         (tenant_id, subscription_id, event_type, old_status, new_status, metadata)
       VALUES ($1, $2, 'reactivated', $3, 'active', $4)`,
      [tenantId, sub.id, oldStatus, JSON.stringify(billingInfo)],
    );

    await client.query('COMMIT');
    logger.info(`Tenant ${tenantId} subscription reactivated (was: ${oldStatus})`);
    return { success: true, previousStatus: oldStatus };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Team limit check ─────────────────────────────────────────────────────────

/**
 * Verifies that adding a new employee won't exceed the trial cap.
 * Returns { allowed: bool, reason: string|null, cap: number|null, current: number }
 */
async function checkTeamLimit(tenantId) {
  const { rows } = await query(
    `SELECT t.trial_employee_cap, t.current_employee_count, t.plan,
            s.status AS subscription_status
     FROM tenants t
     LEFT JOIN subscriptions s ON s.tenant_id = t.id
     WHERE t.id = $1`,
    [tenantId],
  );

  if (!rows.length) throw Object.assign(new Error('Tenant not found'), { statusCode: 404 });

  const { trial_employee_cap, current_employee_count, plan, subscription_status } = rows[0];

  // Solo plan never allows additional users
  if (plan === 'solo') {
    return { allowed: false, reason: 'Solo plan does not support team members. Upgrade to Agency.', cap: 0, current: 0 };
  }

  // Paid agency — no cap
  if (trial_employee_cap === null || subscription_status === 'active') {
    return { allowed: true, reason: null, cap: null, current: current_employee_count };
  }

  // Agency trial: cap = AGENCY_TRIAL_EMPLOYEE_CAP
  if (current_employee_count >= trial_employee_cap) {
    return {
      allowed: false,
      reason: `Agency trial allows up to ${trial_employee_cap} employees. Upgrade to add more.`,
      cap: trial_employee_cap,
      current: current_employee_count,
    };
  }

  return { allowed: true, reason: null, cap: trial_employee_cap, current: current_employee_count };
}

/**
 * Atomically increments tenant employee count.
 */
async function incrementEmployeeCount(tenantId) {
  await query(
    `UPDATE tenants SET current_employee_count = current_employee_count + 1 WHERE id = $1`,
    [tenantId],
  );
}

/**
 * Atomically decrements tenant employee count (on removal).
 */
async function decrementEmployeeCount(tenantId) {
  await query(
    `UPDATE tenants SET current_employee_count = GREATEST(0, current_employee_count - 1) WHERE id = $1`,
    [tenantId],
  );
}

// ─── Subscription event history ───────────────────────────────────────────────

async function getSubscriptionEvents(tenantId, limit = 50) {
  const { rows } = await query(
    `SELECT id, event_type, old_status, new_status, metadata, triggered_by, created_at
     FROM subscription_events
     WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [tenantId, limit],
  );
  return rows;
}

module.exports = {
  TRIAL_DAYS,
  AGENCY_TRIAL_EMPLOYEE_CAP,
  computeAccess,
  initTrial,
  getSubscriptionStatus,
  runExpiryCheck,
  reactivateSubscription,
  checkTeamLimit,
  incrementEmployeeCount,
  decrementEmployeeCount,
  getSubscriptionEvents,
};
