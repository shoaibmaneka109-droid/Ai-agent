import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getPool } from "../../lib/db/pool.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";
import { getOrganizationBillingState } from "../../lib/billing/orgBilling.js";
import { assertAgencyTrialEmployeeCap, countAgencyEmployees } from "../../lib/billing/agencyTrialLimits.js";
import { env } from "../../config/env.js";

const r = Router({ mergeParams: true });

r.post(
  "/employees",
  requireAuth,
  requireTenantMembership,
  async (req: Request, res: Response) => {
    const orgId = req.params.orgId;
    if (!orgId || orgId !== req.tenantId) {
      res.status(400).json({ error: "Organization mismatch" });
      return;
    }
    if (req.orgMemberRole !== "admin" && req.orgMemberRole !== "owner") {
      res.status(403).json({ error: "Only admins can add employees" });
      return;
    }
    const billing = req.orgBilling;
    if (!billing) {
      res.status(500).json({ error: "Billing context missing" });
      return;
    }
    if (billing.organizationKind !== "agency") {
      res.status(403).json({ error: "Employees can only be added to agency organizations" });
      return;
    }
    const body = req.body as { email?: string; password?: string };
    if (!body.email || !body.password) {
      res.status(400).json({ error: "email and password required" });
      return;
    }
    try {
      const employeeCount = await countAgencyEmployees(orgId);
      assertAgencyTrialEmployeeCap(billing, employeeCount, "member");
    } catch (e) {
      if (e instanceof Error && e.message === "AGENCY_TRIAL_EMPLOYEE_CAP") {
        res.status(403).json({
          error: "Agency trial allows at most 9 employees",
          code: "AGENCY_TRIAL_EMPLOYEE_CAP",
        });
        return;
      }
      throw e;
    }

    const pool = getPool();
    const passwordHash = await bcrypt.hash(body.password, 12);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const userRes = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, user_type, default_org_id)
         VALUES ($1, $2, 'agency', $3)
         RETURNING id`,
        [body.email, passwordHash, orgId]
      );
      const newUserId = userRes.rows[0]!.id;
      await client.query(
        `INSERT INTO organization_members (organization_id, user_id, role, joined_at)
         VALUES ($1, $2, 'member', now())`,
        [orgId, newUserId]
      );
      await client.query("COMMIT");
      const freshBilling = await getOrganizationBillingState(orgId);
      res.status(201).json({
        userId: newUserId,
        billing: freshBilling
          ? {
              accessMode: freshBilling.accessMode,
              integrationsUnlocked: freshBilling.integrationsUnlocked,
            }
          : null,
      });
    } catch (e: unknown) {
      await client.query("ROLLBACK");
      const code = (e as { code?: string })?.code;
      if (code === "23505") {
        res.status(409).json({ error: "Email already in use" });
        return;
      }
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to add employee" });
    } finally {
      client.release();
    }
  }
);

export const organizationMemberRoutes = r;
