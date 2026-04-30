/**
 * Subscription & Trial Service
 *
 * Business rules:
 *  - Solo plan:   15-day free trial, 1 member max during trial
 *  - Agency plan: 30-day free trial, up to 9 employees (10 seats total incl. owner) during trial
 *
 * Subscription statuses:
 *  trialing    → within trial window; all features enabled
 *  active      → paid subscription current; all features enabled
 *  hibernating → trial or subscription expired; READ-ONLY mode
 *                (login ✓, view data ✓, API/autofill LOCKED)
 *  cancelled   → permanently terminated by owner/admin
 *
 * Data Hibernation:
 *  When status = 'hibernating', the subscription guard blocks any mutating
 *  or outbound-API operations (payment processing, API key usage, provider
 *  calls) but allows the user to log in and browse their historical data.
 */

const { query, transaction } = require('../config/database');
const logger = require('./logger');

// ── Plan configuration ────────────────────────────────────────────────────────

const PLAN_TRIAL_CONFIG = {
  solo: {
    trialDays: 15,
    trialMemberLimit: 1,   // owner only
  },
  agency: {
    trialDays: 30,
    trialMemberLimit: 10,  // owner + up to 9 employees
  },
};

// ── Core status helpers ───────────────────────────────────────────────────────

/**
 * Returns a rich subscription context object for the given organization.
 * This is the single source of truth — called from auth middleware and
 * the subscription controller.
 */
const getSubscriptionContext = async (orgId) => {
  const { rows } = await query(
    `SELECT
       id, plan_type, subscription_status,
       trial_duration_days, trial_ends_at, trial_member_limit,
       subscription_started_at, subscription_ends_at,
       hibernated_at, last_activated_at, created_at
     FROM organizations
     WHERE id = $1`,
    [orgId]
  );

  if (rows.length === 0) throw new Error(`Organization ${orgId} not found`);
  const org = rows[0];

  const now = new Date();
  const trialEndsAt = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const subscriptionEndsAt = org.subscription_ends_at ? new Date(org.subscription_ends_at) : null;

  const trialDaysRemaining = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24)))
    : 0;

  const subscriptionDaysRemaining = subscriptionEndsAt
    ? Math.max(0, Math.ceil((subscriptionEndsAt - now) / (1000 * 60 * 60 * 24)))
    : 0;

  const isTrialExpired = org.subscription_status === 'trialing' && trialEndsAt && trialEndsAt <= now;
  const isSubscriptionExpired = org.subscription_status === 'active' && subscriptionEndsAt && subscriptionEndsAt <= now;
  const isHibernating = org.subscription_status === 'hibernating';
  const isCancelled = org.subscription_status === 'cancelled';

  const featuresLocked = isHibernating || isCancelled;
  const canAddMembers = !featuresLocked && (
    org.subscription_status === 'active' ||
    (org.subscription_status === 'trialing' && trialDaysRemaining > 0)
  );

  return {
    orgId: org.id,
    planType: org.plan_type,
    status: org.subscription_status,
    trialDurationDays: org.trial_duration_days,
    trialEndsAt: org.trial_ends_at,
    trialDaysRemaining,
    trialMemberLimit: org.trial_member_limit,
    subscriptionStartedAt: org.subscription_started_at,
    subscriptionEndsAt: org.subscription_ends_at,
    subscriptionDaysRemaining,
    hibernatedAt: org.hibernated_at,
    lastActivatedAt: org.last_activated_at,
    // Computed flags
    isTrialExpired,
    isSubscriptionExpired,
    isHibernating,
    isCancelled,
    featuresLocked,
    canAddMembers,
  };
};

// ── Transition: enter hibernation ─────────────────────────────────────────────

/**
 * Atomically moves an org from 'trialing' or 'active' → 'hibernating'.
 * Idempotent: safe to call on an already-hibernating org.
 */
const enterHibernation = async (orgId, triggeredBy = null, note = null) => {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `SELECT subscription_status FROM organizations WHERE id = $1 FOR UPDATE`,
      [orgId]
    );
    if (rows.length === 0) throw new Error(`Organization ${orgId} not found`);

    const current = rows[0].subscription_status;
    if (current === 'hibernating') return { alreadyHibernating: true };
    if (current === 'cancelled') return { alreadyCancelled: true };

    await client.query(
      `UPDATE organizations
       SET subscription_status = 'hibernating', hibernated_at = NOW()
       WHERE id = $1`,
      [orgId]
    );

    await client.query(
      `INSERT INTO subscription_events
         (organization_id, event_type, from_status, to_status, triggered_by, note)
       VALUES ($1, 'hibernation_entered', $2, 'hibernating', $3, $4)`,
      [orgId, current, triggeredBy, note || `Transitioned from ${current} due to expiration`]
    );

    logger.info('Organization entered hibernation', { orgId, fromStatus: current });
    return { transitioned: true, fromStatus: current };
  });
};

// ── Transition: activate subscription ────────────────────────────────────────

/**
 * Activates (or reactivates) a subscription after payment.
 * Sets subscription_ends_at = NOW() + durationDays.
 */
const activateSubscription = async (orgId, durationDays = 30, triggeredBy = null, note = null) => {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `SELECT subscription_status FROM organizations WHERE id = $1 FOR UPDATE`,
      [orgId]
    );
    if (rows.length === 0) throw new Error(`Organization ${orgId} not found`);

    const current = rows[0].subscription_status;
    const eventType = current === 'hibernating' ? 'subscription_reactivated' : 'subscription_activated';

    const { rows: [updated] } = await client.query(
      `UPDATE organizations
       SET subscription_status = 'active',
           subscription_started_at = COALESCE(subscription_started_at, NOW()),
           subscription_ends_at    = NOW() + ($2 || ' days')::INTERVAL,
           last_activated_at       = NOW(),
           hibernated_at           = NULL
       WHERE id = $1
       RETURNING subscription_ends_at`,
      [orgId, durationDays]
    );

    await client.query(
      `INSERT INTO subscription_events
         (organization_id, event_type, from_status, to_status, triggered_by, note)
       VALUES ($1, $2, $3, 'active', $4, $5)`,
      [orgId, eventType, current, triggeredBy, note]
    );

    logger.info('Subscription activated', { orgId, durationDays, eventType });
    return { subscriptionEndsAt: updated.subscription_ends_at };
  });
};

// ── Transition: cancel ────────────────────────────────────────────────────────

const cancelSubscription = async (orgId, triggeredBy = null, note = null) => {
  return transaction(async (client) => {
    const { rows } = await client.query(
      `SELECT subscription_status FROM organizations WHERE id = $1 FOR UPDATE`,
      [orgId]
    );
    if (rows.length === 0) throw new Error(`Organization ${orgId} not found`);

    const current = rows[0].subscription_status;

    await client.query(
      `UPDATE organizations
       SET subscription_status = 'cancelled'
       WHERE id = $1`,
      [orgId]
    );

    await client.query(
      `INSERT INTO subscription_events
         (organization_id, event_type, from_status, to_status, triggered_by, note)
       VALUES ($1, 'subscription_cancelled', $2, 'cancelled', $3, $4)`,
      [orgId, current, triggeredBy, note]
    );

    logger.info('Subscription cancelled', { orgId });
    return { cancelled: true };
  });
};

// ── Expiration sweep ──────────────────────────────────────────────────────────

/**
 * Evaluates a single org and hibernates it if its trial or subscription
 * has expired. Called lazily on each request (via middleware) and can also
 * be run as a scheduled job.
 *
 * Returns the (potentially updated) subscription status string.
 */
const checkAndExpireIfNeeded = async (orgId) => {
  const ctx = await getSubscriptionContext(orgId);

  if (ctx.isTrialExpired || ctx.isSubscriptionExpired) {
    await enterHibernation(orgId, null, 'Automated expiration check');
    return 'hibernating';
  }

  return ctx.status;
};

// ── Agency trial member-limit enforcement ─────────────────────────────────────

/**
 * Checks whether the org can accept another member, respecting the
 * trial seat limit for agency plans.
 * Returns { allowed: boolean, reason?: string }
 */
const canAddMemberCheck = async (orgId) => {
  const ctx = await getSubscriptionContext(orgId);

  if (ctx.featuresLocked) {
    return { allowed: false, reason: 'Subscription expired. Please reactivate to add members.' };
  }

  if (ctx.status === 'trialing' && ctx.trialMemberLimit > 0) {
    const { rows } = await query(
      `SELECT COUNT(*) FROM users WHERE organization_id = $1 AND is_active = TRUE`,
      [orgId]
    );
    const currentCount = parseInt(rows[0].count, 10);
    if (currentCount >= ctx.trialMemberLimit) {
      return {
        allowed: false,
        reason: `Trial plan allows up to ${ctx.trialMemberLimit} active members. Upgrade to add more.`,
      };
    }
  }

  return { allowed: true };
};

module.exports = {
  PLAN_TRIAL_CONFIG,
  getSubscriptionContext,
  enterHibernation,
  activateSubscription,
  cancelSubscription,
  checkAndExpireIfNeeded,
  canAddMemberCheck,
};
