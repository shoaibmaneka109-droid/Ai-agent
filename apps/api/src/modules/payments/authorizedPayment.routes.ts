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
 * Simulated "authorized payment" for agency employees: allowed only inside the admin-set window,
 * from the registered VPS IP, and while the assigned card is not frozen.
 */
r.post(
  "/authorized-payment",
  requireAuth,
  requireTenantMembership,
  requireFullSubscription,
  requireEmployeeVpsIpForCardAccess,
  async (req: Request, res: Response) => {
    if (req.orgMemberRole !== "member") {
      res.status(403).json({ error: "Only employees may use authorized payment simulation" });
      return;
    }
    const body = req.body as { amountCents?: unknown; merchantRef?: unknown };
    const amount = typeof body.amountCents === "number" ? body.amountCents : Number(body.amountCents);
    const merchantRef = typeof body.merchantRef === "string" ? body.merchantRef.trim() : "";
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_00) {
      res.status(400).json({ error: "amountCents must be a positive number (max 100000000)" });
      return;
    }
    if (!merchantRef || merchantRef.length > 200) {
      res.status(400).json({ error: "merchantRef required (max 200 chars)" });
      return;
    }
    try {
      const pool = getPool();
      const { rows } = await pool.query<{
        external_ref: string;
        last4: string;
        auth_until: Date | null;
        frozen: boolean;
      }>(
        `SELECT vc.external_ref, vc.last4,
                m.payments_authorized_until AS auth_until,
                (vc.card_frozen_at IS NOT NULL) AS frozen
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
      if (row.frozen) {
        res.status(403).json({ error: "Card is frozen", code: "CARD_FROZEN" });
        return;
      }
      const until = row.auth_until ? new Date(row.auth_until) : null;
      if (!until || until.getTime() <= Date.now()) {
        res.status(403).json({
          error: "No active authorized payment window. Ask an admin to set payments authorization.",
          code: "PAYMENT_NOT_AUTHORIZED",
        });
        return;
      }
      res.status(201).json({
        status: "authorized_simulated",
        amountCents: Math.floor(amount),
        merchantRef,
        externalRef: row.external_ref,
        last4: row.last4,
        authorizedUntil: until.toISOString(),
        note: "Simulated charge — replace with Stripe/Airwallex Issuing payment intent using org credentials.",
      });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Payment simulation failed" });
    }
  }
);

export const authorizedPaymentRoutes = r;
