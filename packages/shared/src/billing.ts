export const TRIAL_DAYS_SOLO = 15;
export const TRIAL_DAYS_AGENCY = 30;
/** During agency trial (before paid): at most 9 users with role `member` (employees). */
export const AGENCY_TRIAL_MAX_EMPLOYEES = 9;

export type SubscriptionAccessMode = "full" | "hibernation";

export interface OrgBillingState {
  organizationId: string;
  organizationKind: "solo_workspace" | "agency";
  trialEndsAt: Date;
  subscriptionEndsAt: Date | null;
  now: Date;
  isTrialActive: boolean;
  isPaidActive: boolean;
  /** True when user may use API keys, auto-fill, and other paid integrations. */
  integrationsUnlocked: boolean;
  /** When false, UI/read-only access is still allowed after login. */
  accessMode: SubscriptionAccessMode;
}

export function computeOrgBillingState(input: {
  organizationId: string;
  organizationKind: "solo_workspace" | "agency";
  trialEndsAt: Date;
  subscriptionEndsAt: Date | null;
  now?: Date;
}): OrgBillingState {
  const now = input.now ?? new Date();
  const isTrialActive = now < input.trialEndsAt;
  const paidEnd = input.subscriptionEndsAt;
  const isPaidActive = paidEnd != null && now < paidEnd;
  const integrationsUnlocked = isTrialActive || isPaidActive;
  const accessMode: SubscriptionAccessMode = integrationsUnlocked ? "full" : "hibernation";
  return {
    organizationId: input.organizationId,
    organizationKind: input.organizationKind,
    trialEndsAt: input.trialEndsAt,
    subscriptionEndsAt: input.subscriptionEndsAt,
    now,
    isTrialActive,
    isPaidActive,
    integrationsUnlocked,
    accessMode,
  };
}
