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
    const { rows } = await pool.query<{ role: string }>(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [orgId, req.auth.userId]
    );
    if (!rows[0]) {
      res.status(403).json({ error: "Not a member of this organization" });
      return;
    }
    req.tenantId = orgId;
    req.orgMemberRole = rows[0].role as "owner" | "admin" | "member";
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
