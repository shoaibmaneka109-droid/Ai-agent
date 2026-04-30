import type { OrgBillingState } from "@securepay/shared";
import type { AuthContext } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      auth?: AuthContext;
      orgBilling?: OrgBillingState;
      orgMemberRole?: "owner" | "admin" | "super_admin" | "sub_admin" | "member";
      /** Effective flags: owner/admin always all true; sub_admin from DB; member all false */
      orgMemberPermissions?: {
        manageEmployees: boolean;
        viewCardsHideKeys: boolean;
        cardAdminFundTransfer: boolean;
      };
      /** True when employee card fill is blocked (session freeze, master freeze, or org emergency lockdown) */
      orgCardFillBlocked?: boolean;
      /** Agency employees: admin-set window for simulated authorized payments */
      orgPaymentsAuthorizedUntil?: Date | null;
    }
  }
}

export {};
