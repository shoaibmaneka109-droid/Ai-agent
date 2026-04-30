const { HttpError } = require("../../shared/http/errors");

const SOLO_TRIAL_DAYS = 15;
const AGENCY_TRIAL_DAYS = 30;
const AGENCY_TRIAL_EMPLOYEE_LIMIT = 9;

function addDays(date, days) {
  const nextValue = new Date(date);
  nextValue.setUTCDate(nextValue.getUTCDate() + days);
  return nextValue;
}

function normalizeDate(value) {
  return value ? new Date(value) : null;
}

function getTrialDays(tenantType) {
  return tenantType === "agency" ? AGENCY_TRIAL_DAYS : SOLO_TRIAL_DAYS;
}

function getTrialSeatLimit(tenantType) {
  return tenantType === "agency" ? AGENCY_TRIAL_EMPLOYEE_LIMIT : 1;
}

function buildTrialSubscriptionInput({ tenantId, tenantType, now = new Date() }) {
  const trialEndsAt = addDays(now, getTrialDays(tenantType));

  return {
    tenantId,
    planName: tenantType === "agency" ? "agency-trial" : "solo-trial",
    status: "trialing",
    lifecycleState: "trial_active",
    trialEndsAt,
    seatLimit: getTrialSeatLimit(tenantType),
    featureLockState: "unlocked",
  };
}

function computeSubscriptionStatus(record, now = new Date()) {
  if (!record) {
    return {
      status: "inactive",
      lifecycleState: "hibernated",
      isTrial: false,
      isExpired: true,
      trialExpired: true,
      paymentRequired: true,
      hibernation: true,
      isHibernated: true,
      seatLimit: 0,
      featuresLocked: true,
      capabilities: {
        apiEnabled: false,
        autofillEnabled: false,
        dataViewEnabled: true,
      },
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      hibernatesAt: null,
    };
  }

  const trialEndsAt = normalizeDate(record.trial_ends_at || record.trialEndsAt);
  const currentPeriodEndsAt = normalizeDate(
    record.current_period_ends_at || record.currentPeriodEndsAt,
  );
  const hibernatesAt = normalizeDate(record.hibernates_at || record.hibernatesAt);
  const trialExpired = Boolean(
    record.is_trial && trialEndsAt && trialEndsAt.getTime() < now.getTime(),
  );
  const paidExpired = Boolean(
    !record.is_trial &&
      currentPeriodEndsAt &&
      currentPeriodEndsAt.getTime() < now.getTime(),
  );
  const rawStatus = record.status || "inactive";
  const hibernation = rawStatus === "hibernated" || trialExpired || paidExpired;

  return {
    status: hibernation ? "hibernated" : rawStatus,
    lifecycleState:
      record.lifecycle_state ||
      (hibernation ? "hibernated" : rawStatus === "trialing" ? "trial_active" : "active"),
    isTrial: Boolean(record.is_trial),
    isExpired: trialExpired || paidExpired,
    trialExpired,
    paymentRequired: hibernation,
    hibernation,
    isHibernated: hibernation,
    seatLimit: Number(record.seat_limit || 0),
    featuresLocked: hibernation,
    capabilities: {
      apiEnabled: !hibernation,
      autofillEnabled: !hibernation,
      dataViewEnabled: true,
    },
    trialEndsAt,
    currentPeriodEndsAt,
    hibernatesAt: hibernatesAt || trialEndsAt || currentPeriodEndsAt,
  };
}

function assertSeatLimitForMembershipCount(subscriptionRecord, nextMembershipCount) {
  const subscription = computeSubscriptionStatus(subscriptionRecord);
  const seatLimit = subscription.seatLimit;

  if (!subscription.isTrial || seatLimit <= 0) {
    return;
  }

  // Agency trial allows 1 admin + 9 employees => 10 total memberships.
  if (nextMembershipCount > seatLimit + 1) {
    throw new HttpError(
      403,
      `Agency trial seat limit reached. Up to ${seatLimit} employees can be added during the trial period.`,
    );
  }
}

module.exports = {
  SOLO_TRIAL_DAYS,
  AGENCY_TRIAL_DAYS,
  AGENCY_TRIAL_EMPLOYEE_LIMIT,
  buildTrialSubscriptionInput,
  computeSubscriptionStatus,
  assertSeatLimitForMembershipCount,
  getTrialDays,
  getTrialSeatLimit,
};
