export const USER_TYPES = ["solo", "agency"] as const;
export type UserType = (typeof USER_TYPES)[number];
export type OrganizationType = UserType;

export const ORGANIZATION_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "expired", "canceled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PAYMENT_PROVIDERS = ["stripe", "airwallex"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
export type IntegrationProvider = PaymentProvider;

export const API_KEY_ENVIRONMENTS = ["test", "live"] as const;
export type ApiKeyEnvironment = (typeof API_KEY_ENVIRONMENTS)[number];

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  type: UserType;
}

export interface Organization {
  id: string;
  tenantId: string;
  type: OrganizationType;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantContext {
  tenantId: string;
  organizationId: string;
  organizationSlug: string;
  role: OrganizationRole;
}

export interface AuthSession {
  accessToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
  tenant: {
    id: string;
    slug: string;
    accountType: UserType;
    subscriptionStatus: SubscriptionStatus;
    trialEndsAt: string | null;
  };
  organization: {
    id: string;
    slug: string;
    role: OrganizationRole;
  };
}

export interface ApiKeySummary {
  id: string;
  provider: PaymentProvider;
  label: string;
  environment: ApiKeyEnvironment;
  keyPreview: string;
  createdAt: string;
  lastRotatedAt: string | null;
}
