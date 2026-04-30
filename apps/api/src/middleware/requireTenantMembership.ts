import type { Request, Response, NextFunction } from "express";
import { getPool } from "../lib/db/pool.js";
import { getOrganizationBillingState } from "../lib/billing/orgBilling.js";

/**
 * Resolves tenant from `X-Organization-Id`, verifies membership, attaches billing state.
 */
export async function requireTenantMembership(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const routeOrgId = (req.params as { orgId?: string }).orgId;
  const headerOrgId = req.header("x-organization-id");
  const orgId = routeOrgId ?? headerOrgId;
  if (!orgId) {
    res.status(400).json({ error: "Missing organization id (X-Organization-Id or route param)" });
    return;
  }
  if (routeOrgId && headerOrgId && routeOrgId !== headerOrgId) {
    res.status(400).json({ error: "X-Organization-Id does not match route organization" });
    return;
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query<{
      role: string;
      card_frozen_at: Date | null;
      payments_authorized_until: Date | null;
      can_manage_employees: boolean;
      can_view_cards_hide_keys: boolean;
      can_card_admin_fund_transfer: boolean;
    }>(
      `SELECT m.role, vc.card_frozen_at, m.payments_authorized_until,
              m.can_manage_employees, m.can_view_cards_hide_keys, m.can_card_admin_fund_transfer
       FROM organization_members m
       LEFT JOIN organization_virtual_cards vc ON vc.id = m.virtual_card_id
       WHERE m.organization_id = $1 AND m.user_id = $2`,
      [orgId, req.auth.userId]
    );
    if (!rows[0]) {
      res.status(403).json({ error: "Not a member of this organization" });
      return;
    }
    const role = rows[0].role as "owner" | "admin" | "sub_admin" | "member";
    req.tenantId = orgId;
    req.orgMemberRole = role;
    req.orgCardFrozenAt = rows[0].card_frozen_at;
    req.orgPaymentsAuthorizedUntil = rows[0].payments_authorized_until;
    if (role === "owner" || role === "admin") {
      req.orgMemberPermissions = {
        manageEmployees: true,
        viewCardsHideKeys: true,
        cardAdminFundTransfer: true,
      };
    } else if (role === "sub_admin") {
      req.orgMemberPermissions = {
        manageEmployees: rows[0].can_manage_employees,
        viewCardsHideKeys: rows[0].can_view_cards_hide_keys,
        cardAdminFundTransfer: rows[0].can_card_admin_fund_transfer,
      };
    } else {
      req.orgMemberPermissions = {
        manageEmployees: false,
        viewCardsHideKeys: false,
        cardAdminFundTransfer: false,
      };
    }
    const billing = await getOrganizationBillingState(orgId);
    if (!billing) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }
    req.orgBilling = billing;
    next();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("DATABASE_URL")) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    next(e);
  }
}
