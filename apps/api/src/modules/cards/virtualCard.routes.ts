import { Router } from "express";
import type { Request, Response } from "express";
import { getPool } from "../../lib/db/pool.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";
import { requireFullSubscription } from "../../middleware/requireFullSubscription.js";
import { requireEmployeeVpsIpForCardAccess } from "../../middleware/requireEmployeeVpsIp.js";
import { env } from "../../config/env.js";

const r = Router();

/**
 * Sensitive card fields — employees only when request IP matches DB `allowed_vps_ip`.
 * Admins/owners may preview mapping context without IP check.
 */
r.get(
  "/my-virtual-card/details",
  requireAuth,
  requireTenantMembership,
  requireFullSubscription,
  requireEmployeeVpsIpForCardAccess,
  async (req: Request, res: Response) => {
    try {
      const pool = getPool();
      const { rows } = await pool.query<{
        external_ref: string;
        last4: string;
        label: string | null;
        pan_masked: string;
      }>(
        `SELECT vc.external_ref, vc.last4, vc.label,
                '****-****-****-' || vc.last4 AS pan_masked
         FROM organization_members m
         JOIN organization_virtual_cards vc ON vc.id = m.virtual_card_id
         WHERE m.organization_id = $1 AND m.user_id = $2`,
        [req.tenantId, req.auth!.userId]
      );
      const row = rows[0];
      if (!row) {
        res.status(404).json({ error: "No virtual card assigned" });
        return;
      }
      const isEmployee = req.orgMemberRole === "member";
      res.json({
        externalRef: row.external_ref,
        last4: row.last4,
        label: row.label,
        panMasked: row.pan_masked,
        /** Full PAN placeholder — replace with issuer API call using org credentials */
        panFull: isEmployee ? `SIMULATED-FULL-PAN-FOR-${row.external_ref}` : null,
        note: isEmployee
          ? "IP check passed. In production, fetch PAN from Stripe/Airwallex Issuing using externalRef."
          : "Admin view: employee IP restriction does not apply.",
      });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to load card details" });
    }
  }
);

export const virtualCardRoutes = r;
