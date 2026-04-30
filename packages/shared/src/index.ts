export type UserType = "solo" | "agency";

export type CredentialProvider = "stripe" | "airwallex" | "wise";

export type CredentialKind = "api_secret" | "webhook_secret";

export type OrgMemberRole = "owner" | "admin" | "super_admin" | "sub_admin" | "member";

export type OrganizationKind = "solo_workspace" | "agency";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  kind: OrganizationKind;
  billingEmail: string | null;
  trialEndsAt: string;
  subscriptionEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export * from "./billing.js";
export * from "./connectionTest.js";
