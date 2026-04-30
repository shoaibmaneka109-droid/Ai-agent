const { query, withTransaction } = require('../../config/database');
const { getTrialEndDate, getTrialMemberLimit, trialDaysRemaining } = require('../../config/trial');
const logger = require('../../shared/utils/logger');

/**
 * Fetch the full subscription context for an organization.
 * This is the single source of truth called by middlewares and the dashboard.
 */
const getSubscriptionStatus = async (organizationId) => {
  const result = await query(
    `SELECT id, type, plan, subscription_status, trial_starts_at, trial_ends_at,
            hibernated_at, trial_member_limit, is_active
     FROM organizations
     WHERE id = $1`,
    [organizationId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Organization not found');
    err.statusCode = 404;
    throw err;
  }

  const org = result.rows[0];
  const now = new Date();
  const daysLeft = trialDaysRemaining(org.trial_ends_at);

  return {
    organizationId: org.id,
    status: org.subscription_status,
    plan: org.plan,
    orgType: org.type,
    trialStartsAt: org.trial_starts_at,
    trialEndsAt: org.trial_ends_at,
    hibernatedAt: org.hibernated_at,
    trialMemberLimit: org.trial_member_limit,
    daysRemaining: org.subscription_status === 'trialing' ? daysLeft : null,
    isTrialExpired:
      org.subscription_status === 'trialing' &&
      org.trial_ends_at &&
      new Date(org.trial_ends_at) < now,
    isHibernating: org.subscription_status === 'hibernating',
    isCancelled: org.subscription_status === 'cancelled',
    hasFullAccess:
      org.subscription_status === 'trialing' ||
      org.subscription_status === 'active',
  };
};

/**
 * Transition an organization from 'trialing' to 'hibernating'.
 * Records an event in subscription_events.
 * Safe to call multiple times — idempotent.
 */
const hibernateOrganization = async (organizationId, reason = 'trial_expired') => {
  return withTransaction(async (client) => {
    const orgResult = await client.query(
      `SELECT subscription_status FROM organizations WHERE id = $1 FOR UPDATE`,
      [organizationId]
    );

    if (orgResult.rows.length === 0) return null;

    const current = orgResult.rows[0].subscription_status;
    if (current === 'hibernating' || current === 'cancelled') return null; // already done

    await client.query(
      `UPDATE organizations
       SET subscription_status = 'hibernating',
           hibernated_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [organizationId]
    );

    await client.query(
      `INSERT INTO subscription_events
         (organization_id, event_type, from_status, to_status, metadata)
       VALUES ($1, $2, $3, 'hibernating', $4)`,
      [
        organizationId,
        reason,
        current,
        JSON.stringify({ reason, automated: true }),
      ]
    );

    logger.info('Organization hibernated', { organizationId, reason });
    return 'hibernating';
  });
};

/**
 * Reactivate an organization after a successful payment.
 * Creates a new subscription record and transitions status to 'active'.
 */
const reactivateOrganization = async (organizationId, { plan, periodEndDate, externalId }) => {
  return withTransaction(async (client) => {
    const orgResult = await client.query(
      `SELECT subscription_status, plan FROM organizations WHERE id = $1 FOR UPDATE`,
      [organizationId]
    );
    if (orgResult.rows.length === 0) {
      const err = new Error('Organization not found');
      err.statusCode = 404;
      throw err;
    }

    const currentStatus = orgResult.rows[0].subscription_status;
    const newPlan = plan || orgResult.rows[0].plan;

    // Create subscription record
    const subResult = await client.query(
      `INSERT INTO subscriptions
         (organization_id, plan, status, external_id, current_period_end)
       VALUES ($1, $2, 'active', $3, $4)
       RETURNING id`,
      [organizationId, newPlan, externalId || null, periodEndDate]
    );

    // Update organization
    await client.query(
      `UPDATE organizations
       SET subscription_status = 'active',
           plan = $1,
           hibernated_at = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [newPlan, organizationId]
    );

    await client.query(
      `INSERT INTO subscription_events
         (organization_id, subscription_id, event_type, from_status, to_status, metadata)
       VALUES ($1, $2, 'reactivated', $3, 'active', $4)`,
      [
        organizationId,
        subResult.rows[0].id,
        currentStatus,
        JSON.stringify({ plan: newPlan, externalId }),
      ]
    );

    logger.info('Organization reactivated', { organizationId, plan: newPlan });
    return { status: 'active', plan: newPlan };
  });
};

/**
 * Cancel a subscription explicitly (owner action).
 * Org moves to 'cancelled'; data is preserved (hibernated).
 */
const cancelSubscription = async (organizationId, reason = 'owner_requested') => {
  return withTransaction(async (client) => {
    const orgResult = await client.query(
      `SELECT subscription_status FROM organizations WHERE id = $1 FOR UPDATE`,
      [organizationId]
    );
    if (orgResult.rows.length === 0) return null;

    const current = orgResult.rows[0].subscription_status;

    await client.query(
      `UPDATE organizations
       SET subscription_status = 'cancelled',
           hibernated_at = COALESCE(hibernated_at, NOW()),
           updated_at = NOW()
       WHERE id = $1`,
      [organizationId]
    );

    await client.query(
      `UPDATE subscriptions
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE organization_id = $1 AND status = 'active'`,
      [organizationId]
    );

    await client.query(
      `INSERT INTO subscription_events
         (organization_id, event_type, from_status, to_status, metadata)
       VALUES ($1, 'cancelled', $2, 'cancelled', $3)`,
      [organizationId, current, JSON.stringify({ reason })]
    );

    return 'cancelled';
  });
};

/**
 * Sweep all trialing organizations whose trial has expired and hibernate them.
 * Called by the scheduler / cron job.
 * Returns the number of orgs hibernated in this sweep.
 */
const sweepExpiredTrials = async () => {
  const expired = await query(
    `SELECT id FROM organizations
     WHERE subscription_status = 'trialing'
       AND trial_ends_at IS NOT NULL
       AND trial_ends_at < NOW()`,
  );

  let count = 0;
  for (const row of expired.rows) {
    try {
      await hibernateOrganization(row.id, 'trial_expired');
      count++;
    } catch (err) {
      logger.error('Failed to hibernate org during sweep', {
        organizationId: row.id,
        error: err.message,
      });
    }
  }

  if (count > 0) {
    logger.info(`Trial sweep: hibernated ${count} organization(s)`);
  }

  return count;
};

/**
 * List subscription events for an org (for audit display).
 */
const listSubscriptionEvents = async (organizationId, limit = 20) => {
  const result = await query(
    `SELECT id, event_type, from_status, to_status, metadata, created_at
     FROM subscription_events
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [organizationId, limit]
  );
  return result.rows;
};

module.exports = {
  getSubscriptionStatus,
  hibernateOrganization,
  reactivateOrganization,
  cancelSubscription,
  sweepExpiredTrials,
  listSubscriptionEvents,
};
