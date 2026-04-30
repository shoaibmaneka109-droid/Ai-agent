import { Router } from "express";
import type { Request, Response } from "express";
import { getPool } from "../../lib/db/pool.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";
import { requireOrgAdmin } from "../../middleware/requireOrgAdmin.js";
import { env } from "../../config/env.js";

const r = Router({ mergeParams: true });

function assertOrgMatch(req: Request, res: Response): boolean {
  const orgId = req.params.orgId;
  if (!orgId || orgId !== req.tenantId) {
    res.status(400).json({ error: "Organization mismatch" });
    return false;
  }
  return true;
}

/** List employees (members) with card + VPS mapping for agency dashboard */
r.get(
  "/employees",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    try {
      const pool = getPool();
      const { rows } = await pool.query<{
        user_id: string;
        email: string;
        role: string;
        virtual_card_id: string | null;
        external_ref: string | null;
        last4: string | null;
        card_label: string | null;
        allowed_vps_ip: string | null;
        card_frozen_at: Date | null;
        payments_authorized_until: Date | null;
      }>(
        `SELECT m.user_id, u.email, m.role,
                m.virtual_card_id,
                vc.external_ref,
                vc.last4,
                vc.label AS card_label,
                vc.card_frozen_at,
                m.payments_authorized_until,
                host(m.allowed_vps_ip) AS allowed_vps_ip
         FROM organization_members m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN organization_virtual_cards vc ON vc.id = m.virtual_card_id
         WHERE m.organization_id = $1 AND m.role = 'member'
         ORDER BY u.email`,
        [req.tenantId]
      );
      res.json({
        employees: rows.map((row) => ({
          userId: row.user_id,
          email: row.email,
          role: row.role,
          virtualCardId: row.virtual_card_id,
          virtualCard: row.virtual_card_id
            ? {
                id: row.virtual_card_id,
                externalRef: row.external_ref,
                last4: row.last4,
                label: row.card_label,
                frozen: Boolean(row.card_frozen_at),
              }
            : null,
          allowedVpsIp: row.allowed_vps_ip,
          cardFrozen: Boolean(row.card_frozen_at),
          paymentsAuthorizedUntil: row.payments_authorized_until
            ? new Date(row.payments_authorized_until).toISOString()
            : null,
        })),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("DATABASE_URL")) {
        res.status(503).json({ error: "Database not configured" });
        return;
      }
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to list employees" });
    }
  }
);

/** Create virtual card record (admin maps issuer ref + last4) */
r.post(
  "/virtual-cards",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    const body = req.body as { externalRef?: string; last4?: string; label?: string };
    if (!body.externalRef?.trim() || !body.last4?.trim()) {
      res.status(400).json({ error: "externalRef and last4 required" });
      return;
    }
    const last4 = body.last4.trim().replace(/\D/g, "").slice(0, 4);
    if (last4.length !== 4) {
      res.status(400).json({ error: "last4 must be 4 digits" });
      return;
    }
    try {
      const pool = getPool();
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO organization_virtual_cards (organization_id, external_ref, last4, label)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [req.tenantId, body.externalRef.trim(), last4, body.label?.trim() ?? null]
      );
      res.status(201).json({ id: rows[0]!.id });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "23505") {
        res.status(409).json({ error: "A card with this externalRef already exists for the org" });
        return;
      }
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to create virtual card" });
    }
  }
);

r.get(
  "/virtual-cards",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    try {
      const pool = getPool();
      const { rows } = await pool.query<{
        id: string;
        external_ref: string;
        last4: string;
        label: string | null;
        card_frozen_at: Date | null;
      }>(
        `SELECT id, external_ref, last4, label, card_frozen_at FROM organization_virtual_cards
         WHERE organization_id = $1 ORDER BY created_at`,
        [req.tenantId]
      );
      res.json({
        virtualCards: rows.map((v) => ({
          id: v.id,
          externalRef: v.external_ref,
          last4: v.last4,
          label: v.label,
          frozen: Boolean(v.card_frozen_at),
        })),
      });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to list virtual cards" });
    }
  }
);

/** Map employee to virtual card + mandatory VPS IP */
r.patch(
  "/employees/:userId",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return;
    }
    const body = req.body as { virtualCardId?: string | null; allowedVpsIp?: string };
    if (!body.allowedVpsIp?.trim()) {
      res.status(400).json({ error: "allowedVpsIp is mandatory" });
      return;
    }
    if (!body.virtualCardId?.trim()) {
      res.status(400).json({ error: "virtualCardId is mandatory" });
      return;
    }
    try {
      const pool = getPool();
      const { rowCount } = await pool.query(
        `UPDATE organization_members m
         SET virtual_card_id = $3::uuid,
             allowed_vps_ip = $4::inet
         FROM organization_virtual_cards vc
         WHERE m.organization_id = $1 AND m.user_id = $2::uuid
           AND m.role = 'member'
           AND vc.id = $3::uuid AND vc.organization_id = $1`,
        [req.tenantId, userId, body.virtualCardId.trim(), body.allowedVpsIp.trim()]
      );
      if (rowCount === 0) {
        res.status(404).json({ error: "Employee not found, not a member role, or card not in this org" });
        return;
      }
      res.status(204).end();
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(400).json({ error: "Invalid virtualCardId or IP address" });
    }
  }
);

/** Freeze or unfreeze an issued virtual card (blocks employee card details + authorized payments). */
r.post(
  "/virtual-cards/:cardId/freeze",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    const cardId = req.params.cardId;
    if (!cardId) {
      res.status(400).json({ error: "cardId required" });
      return;
    }
    const body = req.body as { frozen?: boolean };
    if (typeof body.frozen !== "boolean") {
      res.status(400).json({ error: "frozen (boolean) required" });
      return;
    }
    try {
      const pool = getPool();
      const frozenAt = body.frozen ? new Date() : null;
      const { rowCount } = await pool.query(
        `UPDATE organization_virtual_cards
         SET card_frozen_at = $3
         WHERE id = $1::uuid AND organization_id = $2`,
        [cardId, req.tenantId, frozenAt]
      );
      if (rowCount === 0) {
        res.status(404).json({ error: "Virtual card not found in this organization" });
        return;
      }
      res.json({ frozen: body.frozen });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to update card freeze state" });
    }
  }
);

/** Set time-bound authorized payment window for an employee (ISO 8601 or null to clear). */
r.patch(
  "/employees/:userId/payments-authorization",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    const userId = req.params.userId;
    if (!userId) {
      res.status(400).json({ error: "userId required" });
      return;
    }
    const body = req.body as { until?: string | null };
    if (!("until" in body)) {
      res.status(400).json({ error: "until required (ISO 8601 string or null to clear)" });
      return;
    }
    let until: Date | null = null;
    if (body.until !== null && body.until !== undefined) {
      const d = new Date(body.until);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "until must be a valid ISO 8601 datetime" });
        return;
      }
      until = d;
    }
    try {
      const pool = getPool();
      const { rowCount } = await pool.query(
        `UPDATE organization_members m
         SET payments_authorized_until = $3
         WHERE m.organization_id = $1 AND m.user_id = $2::uuid AND m.role = 'member'`,
        [req.tenantId, userId, until]
      );
      if (rowCount === 0) {
        res.status(404).json({ error: "Employee not found or not a member role" });
        return;
      }
      res.json({ paymentsAuthorizedUntil: until ? until.toISOString() : null });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to update payment authorization" });
    }
  }
);

export const agencyDashboardRoutes = r;
