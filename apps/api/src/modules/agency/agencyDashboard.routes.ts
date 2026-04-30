import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getPool } from "../../lib/db/pool.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";
import { requireOrgAdmin } from "../../middleware/requireOrgAdmin.js";
import {
  requireManageEmployees,
  requireViewCardsAdmin,
  requireCardAdminFundTransfer,
  requireMainAgencyAdmin,
  requireManageEmployeesOrViewCards,
} from "../../middleware/requireOrgPermissions.js";
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
  requireManageEmployees,
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
        full_time_freeze: boolean | null;
        payments_authorized_until: Date | null;
      }>(
        `SELECT m.user_id, u.email, m.role,
                m.virtual_card_id,
                vc.external_ref,
                vc.last4,
                vc.label AS card_label,
                vc.card_frozen_at,
                vc.full_time_freeze,
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
                fullTimeFreeze: Boolean(row.full_time_freeze),
              }
            : null,
          allowedVpsIp: row.allowed_vps_ip,
          cardFrozen: Boolean(row.card_frozen_at),
          fullTimeFreeze: Boolean(row.full_time_freeze),
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
  requireViewCardsAdmin,
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
  requireManageEmployeesOrViewCards,
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
        full_time_freeze: boolean;
      }>(
        `SELECT id, external_ref, last4, label, card_frozen_at, full_time_freeze FROM organization_virtual_cards
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
          fullTimeFreeze: v.full_time_freeze,
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
  requireManageEmployees,
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
  requireViewCardsAdmin,
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

/** Master full-time freeze: when ON, extension and employee PAN access are denied regardless of session freeze. */
r.patch(
  "/virtual-cards/:cardId/full-time-freeze",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  requireViewCardsAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    const cardId = req.params.cardId;
    if (!cardId) {
      res.status(400).json({ error: "cardId required" });
      return;
    }
    const body = req.body as { fullTimeFreeze?: boolean };
    if (typeof body.fullTimeFreeze !== "boolean") {
      res.status(400).json({ error: "fullTimeFreeze (boolean) required" });
      return;
    }
    try {
      const pool = getPool();
      const { rowCount } = await pool.query(
        `UPDATE organization_virtual_cards SET full_time_freeze = $3
         WHERE id = $1::uuid AND organization_id = $2`,
        [cardId, req.tenantId, body.fullTimeFreeze]
      );
      if (rowCount === 0) {
        res.status(404).json({ error: "Virtual card not found in this organization" });
        return;
      }
      res.json({ fullTimeFreeze: body.fullTimeFreeze });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to update master freeze" });
    }
  }
);

/** Emergency lockdown: read current state (main admin). */
r.get(
  "/emergency-lockdown",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  requireMainAgencyAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    try {
      const pool = getPool();
      const { rows } = await pool.query<{ emergency_lockdown_at: Date | null }>(
        `SELECT emergency_lockdown_at FROM organizations WHERE id = $1`,
        [req.tenantId]
      );
      res.json({ emergencyLockdown: Boolean(rows[0]?.emergency_lockdown_at) });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to read lockdown state" });
    }
  }
);

/** Emergency lockdown: freeze all cards for the agency (sets org-wide flag). */
r.post(
  "/emergency-lockdown",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  requireMainAgencyAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    const body = req.body as { active?: boolean };
    if (typeof body.active !== "boolean") {
      res.status(400).json({ error: "active (boolean) required — true to lock, false to clear" });
      return;
    }
    try {
      const pool = getPool();
      await pool.query(
        `UPDATE organizations SET emergency_lockdown_at = CASE WHEN $2 THEN now() ELSE NULL END
         WHERE id = $1`,
        [req.tenantId, body.active]
      );
      res.json({ emergencyLockdown: body.active });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to update emergency lockdown" });
    }
  }
);

/** Set time-bound authorized payment window for an employee (ISO 8601 or null to clear). */
r.patch(
  "/employees/:userId/payments-authorization",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  requireManageEmployees,
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

/** Main admin: list managers (sub-admins) and their granular permissions. */
r.get(
  "/sub-admins",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  requireMainAgencyAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    try {
      const pool = getPool();
      const { rows } = await pool.query<{
        user_id: string;
        email: string;
        can_manage_employees: boolean;
        can_view_cards_hide_keys: boolean;
        can_card_admin_fund_transfer: boolean;
        joined_at: Date | null;
      }>(
        `SELECT m.user_id, u.email,
                m.can_manage_employees, m.can_view_cards_hide_keys, m.can_card_admin_fund_transfer,
                m.joined_at
         FROM organization_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = $1 AND m.role = 'sub_admin'
         ORDER BY u.email`,
        [req.tenantId]
      );
      res.json({
        subAdmins: rows.map((row) => ({
          userId: row.user_id,
          email: row.email,
          permissions: {
            manageEmployees: row.can_manage_employees,
            viewCardsHideKeys: row.can_view_cards_hide_keys,
            cardAdminFundTransfer: row.can_card_admin_fund_transfer,
          },
          joinedAt: row.joined_at ? new Date(row.joined_at).toISOString() : null,
        })),
      });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to list sub-admins" });
    }
  }
);

/** Main admin: create a Sub-Admin (manager) with granular permissions A/B/C. */
r.post(
  "/sub-admins",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  requireMainAgencyAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    const body = req.body as {
      email?: string;
      password?: string;
      canManageEmployees?: boolean;
      canViewCardsHideKeys?: boolean;
      canCardAdminFundTransfer?: boolean;
    };
    if (!body.email?.trim() || !body.password) {
      res.status(400).json({ error: "email and password required" });
      return;
    }
    const permA = Boolean(body.canManageEmployees);
    const permB = Boolean(body.canViewCardsHideKeys);
    const permC = Boolean(body.canCardAdminFundTransfer);
    if (!permA && !permB && !permC) {
      res.status(400).json({ error: "At least one permission (A, B, or C) must be true" });
      return;
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
        [body.email.trim(), passwordHash, req.tenantId]
      );
      const newUserId = userRes.rows[0]!.id;
      await client.query(
        `INSERT INTO organization_members
          (organization_id, user_id, role, joined_at,
           can_manage_employees, can_view_cards_hide_keys, can_card_admin_fund_transfer)
         VALUES ($1, $2, 'sub_admin', now(), $3, $4, $5)`,
        [req.tenantId, newUserId, permA, permB, permC]
      );
      await client.query("COMMIT");
      res.status(201).json({
        userId: newUserId,
        permissions: {
          manageEmployees: permA,
          viewCardsHideKeys: permB,
          cardAdminFundTransfer: permC,
        },
      });
    } catch (e: unknown) {
      await client.query("ROLLBACK");
      const code = (e as { code?: string })?.code;
      if (code === "23505") {
        res.status(409).json({ error: "Email already in use" });
        return;
      }
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to create sub-admin" });
    } finally {
      client.release();
    }
  }
);

/** Card-to-admin fund transfer (simulated); requires permission C. */
r.post(
  "/fund-transfers",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  requireCardAdminFundTransfer,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    const body = req.body as { fromVirtualCardId?: string; amountCents?: unknown; note?: string };
    if (!body.fromVirtualCardId?.trim()) {
      res.status(400).json({ error: "fromVirtualCardId required" });
      return;
    }
    const amount = typeof body.amountCents === "number" ? body.amountCents : Number(body.amountCents);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
      res.status(400).json({ error: "amountCents must be a positive integer (max 100000000)" });
      return;
    }
    const note = body.note?.trim() ? body.note.trim().slice(0, 500) : null;
    try {
      const pool = getPool();
      const cardCheck = await pool.query<{ id: string }>(
        `SELECT id FROM organization_virtual_cards WHERE id = $1::uuid AND organization_id = $2`,
        [body.fromVirtualCardId.trim(), req.tenantId]
      );
      if (!cardCheck.rows[0]) {
        res.status(400).json({ error: "Virtual card not in this organization" });
        return;
      }
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO organization_card_fund_transfers
          (organization_id, from_virtual_card_id, amount_cents, initiated_by_user_id, note)
         VALUES ($1, $2::uuid, $3, $4, $5)
         RETURNING id`,
        [req.tenantId, body.fromVirtualCardId.trim(), Math.floor(amount), req.auth!.userId, note]
      );
      res.status(201).json({
        transferId: rows[0]!.id,
        status: "simulated_completed",
        message:
          "Simulated transfer recorded. Replace with Stripe/Airwallex Issuing transfer to the org settlement account.",
      });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Fund transfer failed" });
    }
  }
);

/** Main admin: list checkout merchant whitelist (hostnames). */
r.get(
  "/checkout-allowed-merchants",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  requireMainAgencyAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    try {
      const pool = getPool();
      const { rows } = await pool.query<{
        id: string;
        hostname: string;
        label: string | null;
        created_at: Date;
      }>(
        `SELECT id, hostname, label, created_at FROM organization_checkout_allowed_merchants
         WHERE organization_id = $1 ORDER BY hostname`,
        [req.tenantId]
      );
      res.json({
        merchants: rows.map((r) => ({
          id: r.id,
          hostname: r.hostname,
          label: r.label,
          createdAt: r.created_at.toISOString(),
        })),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("relation") && msg.includes("organization_checkout_allowed_merchants")) {
        res.status(503).json({ error: "Run database migration 006_checkout_merchant_whitelist.sql" });
        return;
      }
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to list whitelist" });
    }
  }
);

r.post(
  "/checkout-allowed-merchants",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  requireMainAgencyAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    const body = req.body as { hostname?: string; label?: string };
    const hostname = body.hostname?.trim().toLowerCase() ?? "";
    if (!hostname || hostname.length > 253 || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(hostname)) {
      res.status(400).json({ error: "hostname must be a valid lowercase hostname (e.g. checkout.stripe.com)" });
      return;
    }
    try {
      const pool = getPool();
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO organization_checkout_allowed_merchants (organization_id, hostname, label)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, hostname) DO UPDATE SET label = COALESCE(EXCLUDED.label, organization_checkout_allowed_merchants.label)
         RETURNING id`,
        [req.tenantId, hostname, body.label?.trim() ?? null]
      );
      res.status(201).json({ id: rows[0]!.id, hostname });
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === "42P01") {
        res.status(503).json({ error: "Run database migration 006_checkout_merchant_whitelist.sql" });
        return;
      }
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to add hostname" });
    }
  }
);

r.delete(
  "/checkout-allowed-merchants/:entryId",
  requireAuth,
  requireTenantMembership,
  requireOrgAdmin,
  requireMainAgencyAdmin,
  async (req: Request, res: Response) => {
    if (!assertOrgMatch(req, res)) return;
    const entryId = req.params.entryId;
    if (!entryId) {
      res.status(400).json({ error: "entryId required" });
      return;
    }
    try {
      const pool = getPool();
      const { rowCount } = await pool.query(
        `DELETE FROM organization_checkout_allowed_merchants WHERE id = $1::uuid AND organization_id = $2`,
        [entryId, req.tenantId]
      );
      if (rowCount === 0) {
        res.status(404).json({ error: "Whitelist entry not found" });
        return;
      }
      res.status(204).end();
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to remove hostname" });
    }
  }
);

export const agencyDashboardRoutes = r;
