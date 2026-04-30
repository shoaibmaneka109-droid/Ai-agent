/**
 * Subscription & Trial Utility
 *
 * Single source of truth for all subscription-related business rules:
 *   - Trial lengths per org type
 *   - Max employee seats during trial
 *   - Which statuses count as "active" vs "hibernated"
 *   - Expiration detection + status transitions
 */

// ── Constants ────────────────────────────────────────────────────────────────

const TRIAL_DAYS = {
  solo:   15,
  agency: 30,
};

/** Max employees an agency org can add during its trial (owner not counted). */
const TRIAL_MAX_SEATS = {
  solo:   1,    // owner only
  agency: 9,    // owner + up to 9 employees
};

/**
 * Statuses that still allow full platform access.
 * Everything else → Data Hibernation mode.
 */
const ACTIVE_STATUSES = new Set(['trialing', 'active', 'past_due']);

/**
 * Statuses that put the org into Data Hibernation:
 *   - user can log in and VIEW data
 *   - API execution and auto-fill features are locked
 */
const HIBERNATED_STATUSES = new Set(['expired', 'cancelled', 'suspended']);

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the number of days remaining in a trial (0 if expired).
 */
function trialDaysRemaining(trialEndsAt) {
  if (!trialEndsAt) return 0;
  const msLeft = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
}

/**
 * True when the organization is in Data Hibernation.
 */
function isHibernated(subscriptionStatus) {
  return HIBERNATED_STATUSES.has(subscriptionStatus);
}

/**
 * True when the organization has full platform access.
 */
function isFullyActive(subscriptionStatus) {
  return ACTIVE_STATUSES.has(subscriptionStatus);
}

/**
 * Derive the correct subscription_status for a NEW organization at registration.
 * Returns { status, trialEndsAt, maxSeats }
 */
function buildTrialParams(orgType) {
  const days    = TRIAL_DAYS[orgType]    ?? TRIAL_DAYS.solo;
  const seats   = TRIAL_MAX_SEATS[orgType] ?? TRIAL_MAX_SEATS.solo;
  const trialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return {
    status:       'trialing',
    trialEndsAt,
    maxSeats:     seats,
    trialDays:    days,
  };
}

/**
 * Returns a subscription snapshot object suitable for attaching to
 * req.tenant and embedding in JWT/login responses.
 *
 * `org` is a row from the organizations table.
 */
function buildSubscriptionSnapshot(org) {
  const status        = org.subscription_status;
  const daysRemaining = trialDaysRemaining(org.trial_ends_at);

  return {
    status,
    isHibernated:   isHibernated(status),
    isActive:       isFullyActive(status),
    trialEndsAt:    org.trial_ends_at,
    trialDaysRemaining: status === 'trialing' ? daysRemaining : null,
    subscriptionEndsAt: org.subscription_ends_at,
    maxSeats:       org.max_seats,
  };
}

module.exports = {
  TRIAL_DAYS,
  TRIAL_MAX_SEATS,
  ACTIVE_STATUSES,
  HIBERNATED_STATUSES,
  trialDaysRemaining,
  isHibernated,
  isFullyActive,
  buildTrialParams,
  buildSubscriptionSnapshot,
};
