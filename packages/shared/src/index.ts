export type UserType = "solo" | "agency";

export type CredentialProvider = "stripe" | "airwallex";

export type OrgMemberRole = "owner" | "admin" | "member";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  billingEmail: string | null;
  createdAt: string;
  updatedAt: string;
}
