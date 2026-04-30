import type { OrgBillingState } from "@securepay/shared";
import type { AuthContext } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      auth?: AuthContext;
      orgBilling?: OrgBillingState;
      orgMemberRole?: "owner" | "admin" | "member";
    }
  }
}

export {};
