export type UserType = "solo" | "agency";

export type CredentialProvider = "stripe" | "airwallex";

export type OrgMemberRole = "owner" | "admin" | "member";

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
