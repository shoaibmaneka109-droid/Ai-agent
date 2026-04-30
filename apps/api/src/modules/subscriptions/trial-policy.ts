import type { OrganizationRole, SubscriptionStatus, UserType } from "@securepay/shared";

export const SOLO_TRIAL_DAYS = 15;
export const AGENCY_TRIAL_DAYS = 30;
export const AGENCY_TRIAL_EMPLOYEE_LIMIT = 9;

export type TrialPolicy = {
  trialDays: number;
  employeeLimit: number | null;
};

export const getTrialPolicy = (accountType: UserType): TrialPolicy => {
  if (accountType === "agency") {
    return {
      trialDays: AGENCY_TRIAL_DAYS,
      employeeLimit: AGENCY_TRIAL_EMPLOYEE_LIMIT
    };
  }

  return {
    trialDays: SOLO_TRIAL_DAYS,
    employeeLimit: null
  };
};

export const calculateTrialEndsAt = (accountType: UserType, startsAt = new Date()): Date => {
  const trialEndsAt = new Date(startsAt);
  trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + getTrialPolicy(accountType).trialDays);
  return trialEndsAt;
};

export const isEmployeeRole = (role: OrganizationRole): boolean =>
  role === "admin" || role === "member";

export const isSubscriptionActive = (status: SubscriptionStatus): boolean =>
  status === "trialing" || status === "active";

export const isTrialExpired = (trialEndsAt: Date | string, now = new Date()): boolean =>
  new Date(trialEndsAt).getTime() <= now.getTime();

export type SubscriptionAccessInput = {
  subscription_status: SubscriptionStatus;
  trial_ends_at: Date | string | null;
  subscription_current_period_ends_at: Date | string | null;
};

export type SubscriptionAccess = {
  status: SubscriptionStatus;
  hibernated: boolean;
  apiEnabled: boolean;
  autofillEnabled: boolean;
  readOnly: boolean;
  reason: "active_subscription" | "active_trial" | "trial_expired" | "subscription_inactive";
};

export const evaluateSubscriptionAccess = (
  tenant: SubscriptionAccessInput,
  now = new Date()
): SubscriptionAccess => {
  if (tenant.subscription_status === "active") {
    const periodEnd = tenant.subscription_current_period_ends_at;

    if (!periodEnd || new Date(periodEnd).getTime() > now.getTime()) {
      return {
        status: tenant.subscription_status,
        hibernated: false,
        apiEnabled: true,
        autofillEnabled: true,
        readOnly: false,
        reason: "active_subscription"
      };
    }
  }

  if (
    tenant.subscription_status === "trialing" &&
    tenant.trial_ends_at &&
    !isTrialExpired(tenant.trial_ends_at, now)
  ) {
    return {
      status: tenant.subscription_status,
      hibernated: false,
      apiEnabled: true,
      autofillEnabled: true,
      readOnly: false,
      reason: "active_trial"
    };
  }

  return {
    status: tenant.subscription_status,
    hibernated: true,
    apiEnabled: false,
    autofillEnabled: false,
    readOnly: true,
    reason: tenant.subscription_status === "trialing" ? "trial_expired" : "subscription_inactive"
  };
};
