import { Router } from "express";
import type { Request, Response } from "express";
import { getPool } from "../../lib/db/pool.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";
import { requireEmployeeVpsIpForCardAccess } from "../../middleware/requireEmployeeVpsIp.js";
import { requireFullSubscription } from "../../middleware/requireFullSubscription.js";
import { extensionCorsHeaders } from "../../middleware/extensionCors.js";
import { env } from "../../config/env.js";
import { getRequestClientIp, clientIpMatchesAllowed } from "../../lib/requestIp.js";

const r = Router();

r.use(extensionCorsHeaders);

function normalizeHostname(raw: string): string | null {
  const h = raw.trim().toLowerCase();
  if (!h || h.length > 253) return null;
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h)) return null;
  return h;
}

/**
 * Extension: live card fill eligibility (call before autofill). Does not return PAN.
 * 200 with canFill false when frozen/lockdown/not whitelisted; 403 when IP/VPS wrong or not employee.
 */
r.get(
  "/extension/card-fill-status",
  requireAuth,
  requireTenantMembership,
  requireFullSubscription,
  async (req: Request, res: Response) => {
    if (req.orgMemberRole !== "member") {
      res.status(403).json({ error: "Extension checkout is for employee accounts only", code: "NOT_EMPLOYEE" });
      return;
    }
    const raw = (req.query.hostname as string | undefined) ?? "";
    const hostname = normalizeHostname(raw);
    if (!hostname) {
      res.status(400).json({ error: "hostname query required" });
      return;
    }
    try {
      const pool = getPool();
      const { rows: allowRows } = await pool.query<{ ok: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM organization_checkout_allowed_merchants
           WHERE organization_id = $1 AND hostname = $2
         ) AS ok`,
        [req.tenantId, hostname]
      );
      if (!allowRows[0]?.ok) {
        res.json({
          canFill: false,
          hostname,
          reason: "MERCHANT_NOT_WHITELISTED",
          message: "This merchant is not on the admin whitelist.",
        });
        return;
      }
      const { rows: ipRows } = await pool.query<{ allowed_vps_ip: string | null }>(
        `SELECT host(allowed_vps_ip) AS allowed_vps_ip
         FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
        [req.tenantId, req.auth!.userId]
      );
      const allowed = ipRows[0]?.allowed_vps_ip ?? null;
      if (!allowed) {
        res.status(403).json({
          error: "No VPS IP configured for your account.",
          code: "VPS_IP_REQUIRED",
        });
        return;
      }
      const clientIp = getRequestClientIp(req);
      if (!clientIpMatchesAllowed(clientIp, allowed)) {
        res.status(403).json({
          error: "Request IP does not match registered VPS IP.",
          code: "VPS_IP_MISMATCH",
          expectedIp: allowed,
          observedIp: clientIp,
        });
        return;
      }
      const { rows } = await pool.query<{
        card_frozen_at: Date | null;
        full_time_freeze: boolean | null;
        emergency_lockdown_at: Date | null;
        external_ref: string | null;
        last4: string | null;
      }>(
        `SELECT vc.card_frozen_at, vc.full_time_freeze, o.emergency_lockdown_at,
                vc.external_ref, vc.last4
         FROM organization_members m
         JOIN organizations o ON o.id = m.organization_id
         LEFT JOIN organization_virtual_cards vc ON vc.id = m.virtual_card_id
         WHERE m.organization_id = $1 AND m.user_id = $2`,
        [req.tenantId, req.auth!.userId]
      );
      const row = rows[0];
      if (!row?.external_ref) {
        res.json({
          canFill: false,
          hostname,
          reason: "NO_CARD",
          message: "No virtual card assigned.",
        });
        return;
      }
      const sessionFrozen = Boolean(row.card_frozen_at);
      const masterFrozen = Boolean(row.full_time_freeze);
      const emergency = Boolean(row.emergency_lockdown_at);
      if (sessionFrozen || masterFrozen || emergency) {
        let reason = "SESSION_FROZEN";
        let message = "Card session freeze is active.";
        if (emergency) {
          reason = "EMERGENCY_LOCKDOWN";
          message = "Agency emergency lockdown is active.";
        } else if (masterFrozen) {
          reason = "MASTER_FREEZE";
          message = "Master full-time freeze is ON for this card.";
        }
        res.json({
          canFill: false,
          hostname,
          reason,
          message,
          sessionFrozen,
          fullTimeFreeze: masterFrozen,
          emergencyLockdown: emergency,
          last4: row.last4,
        });
        return;
      }
      res.json({
        canFill: true,
        hostname,
        last4: row.last4,
        externalRef: row.external_ref,
      });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Status check failed" });
    }
  }
);

/**
 * Extension: verify current tab hostname is on the org admin whitelist (requires login).
 */
r.get(
  "/extension/merchant-allowed",
  requireAuth,
  requireTenantMembership,
  async (req: Request, res: Response) => {
    const raw = (req.query.hostname as string | undefined) ?? "";
    const hostname = normalizeHostname(raw);
    if (!hostname) {
      res.status(400).json({ error: "hostname query required (e.g. pay.example.com)" });
      return;
    }
    try {
      const pool = getPool();
      const { rows } = await pool.query<{ ok: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM organization_checkout_allowed_merchants
           WHERE organization_id = $1 AND hostname = $2
         ) AS ok`,
        [req.tenantId, hostname]
      );
      res.json({ allowed: Boolean(rows[0]?.ok), hostname });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("DATABASE_URL")) {
        res.status(503).json({ error: "Database not configured" });
        return;
      }
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Whitelist check failed" });
    }
  }
);

/**
 * Extension: card PAN + meta for checkout autofill (employees only past VPS + subscription).
 * Caller must only use on whitelisted merchant pages (enforced client-side + merchant-allowed check recommended before this).
 */
r.get(
  "/extension/checkout-card",
  requireAuth,
  requireTenantMembership,
  requireFullSubscription,
  requireEmployeeVpsIpForCardAccess,
  async (req: Request, res: Response) => {
    if (req.orgMemberRole !== "member") {
      res.status(403).json({ error: "Extension checkout autofill is for employee accounts only" });
      return;
    }
    const raw = (req.query.hostname as string | undefined) ?? "";
    const hostname = normalizeHostname(raw);
    if (!hostname) {
      res.status(400).json({ error: "hostname query required" });
      return;
    }
    try {
      const pool = getPool();
      const { rows: allowRows } = await pool.query<{ ok: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM organization_checkout_allowed_merchants
           WHERE organization_id = $1 AND hostname = $2
         ) AS ok`,
        [req.tenantId, hostname]
      );
      if (!allowRows[0]?.ok) {
        res.status(403).json({ error: "This merchant is not on the admin whitelist", code: "MERCHANT_NOT_WHITELISTED" });
        return;
      }
      const { rows } = await pool.query<{
        external_ref: string;
        last4: string;
        label: string | null;
      }>(
        `SELECT vc.external_ref, vc.last4, vc.label
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
      const panFull = `SIMULATED-PAN-${row.external_ref.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40)}`;
      res.json({
        pan: panFull,
        last4: row.last4,
        expiryMonth: "12",
        expiryYear: String(new Date().getFullYear() + 3),
        cvc: "***",
        nameOnCard: row.label?.trim() || "SECUREPAY CARDHOLDER",
        hostname,
      });
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to load card for extension" });
    }
  }
);

export const extensionRoutes = r;
