import type { OrgBillingState } from "@securepay/shared";
import type { AuthContext } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      auth?: AuthContext;
      orgBilling?: OrgBillingState;
      orgMemberRole?: "owner" | "admin" | "sub_admin" | "member";
      /** Effective flags: owner/admin always all true; sub_admin from DB; member all false */
      orgMemberPermissions?: {
        manageEmployees: boolean;
        viewCardsHideKeys: boolean;
        cardAdminFundTransfer: boolean;
      };
      /** Present when member has a virtual card; set when card is frozen */
      orgCardFrozenAt?: Date | null;
      /** Agency employees: admin-set window for simulated authorized payments */
      orgPaymentsAuthorizedUntil?: Date | null;
    }
  }
}

export {};
