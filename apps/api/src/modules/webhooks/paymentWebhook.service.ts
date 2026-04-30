import Stripe from "stripe";
import crypto from "node:crypto";
import { getPool } from "../../lib/db/pool.js";
import { getDecryptedCredential } from "../billing/credentials.repository.js";
import type { Server as IoServer } from "socket.io";

export type PaymentWebhookProvider = "stripe" | "airwallex";

export interface CardFreezeEmitPayload {
  organizationId: string;
  virtualCardId: string;
  externalRef: string;
  last4: string;
  provider: PaymentWebhookProvider;
  source: "webhook_auto_freeze";
}

let ioRef: IoServer | null = null;

export function setPaymentWebhookIo(io: IoServer | null): void {
  ioRef = io;
}

export function emitCardFrozenToOrg(payload: CardFreezeEmitPayload): void {
  if (!ioRef) return;
  ioRef.to(`org:${payload.organizationId}`).emit("card_frozen", payload);
}

export async function findVirtualCardById(
  virtualCardId: string
): Promise<{
  id: string;
  organization_id: string;
  external_ref: string;
  last4: string;
  is_auto_freeze_enabled: boolean;
} | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: string;
    organization_id: string;
    external_ref: string;
    last4: string;
    is_auto_freeze_enabled: boolean;
  }>(
    `SELECT id, organization_id, external_ref, last4, is_auto_freeze_enabled
     FROM organization_virtual_cards
     WHERE id = $1::uuid`,
    [virtualCardId]
  );
  return rows[0] ?? null;
}

export async function markCardFrozenInDb(organizationId: string, virtualCardId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE organization_virtual_cards
     SET card_frozen_at = COALESCE(card_frozen_at, now())
     WHERE id = $1::uuid AND organization_id = $2`,
    [virtualCardId, organizationId]
  );
}

export function verifyStripeWebhook(
  rawBody: Buffer,
  signature: string | undefined,
  webhookSecret: string
): Stripe.Event {
  if (!signature) throw new Error("Missing Stripe-Signature header");
  return Stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/** Airwallex: optional HMAC-SHA256 of raw body vs webhook secret (custom header). */
export function verifyAirwallexSignatureIfPresent(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  webhookSecret: string
): boolean {
  if (!signatureHeader) return process.env.NODE_ENV !== "production";
  try {
    const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const a = Buffer.from(signatureHeader.trim(), "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function freezeStripeIssuingCardIfPossible(
  externalRef: string,
  stripeSecretKey: string
): Promise<{ ok: boolean; message: string }> {
  const stripe = new Stripe(stripeSecretKey);
  try {
    await stripe.issuing.cards.update(externalRef, { status: "inactive" });
    return { ok: true, message: "Stripe Issuing card set to inactive" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Stripe Issuing update failed: ${msg}` };
  }
}

export async function freezeAirwallexCardIfPossible(
  externalRef: string,
  airwallexApiJson: string
): Promise<{ ok: boolean; message: string }> {
  let clientId: string;
  let apiKey: string;
  let baseUrl = "https://api.airwallex.com/api/v1";
  try {
    const parsed = JSON.parse(airwallexApiJson) as { clientId?: string; apiKey?: string; baseUrl?: string };
    if (!parsed.clientId || !parsed.apiKey) {
      return { ok: false, message: "Airwallex credentials missing clientId/apiKey" };
    }
    clientId = parsed.clientId;
    apiKey = parsed.apiKey;
    if (parsed.baseUrl?.trim()) baseUrl = parsed.baseUrl.trim().replace(/\/$/, "");
  } catch {
    return { ok: false, message: "Invalid Airwallex credential JSON" };
  }
  try {
    const authRes = await fetch(`${baseUrl}/authentication/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, api_key: apiKey }),
    });
    if (!authRes.ok) {
      return { ok: false, message: `Airwallex auth failed: ${authRes.status}` };
    }
    const authJson = (await authRes.json()) as { token?: string };
    const token = authJson.token;
    if (!token) return { ok: false, message: "Airwallex auth response missing token" };
    const cardRes = await fetch(`${baseUrl}/issuing/cards/${encodeURIComponent(externalRef)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ card_status: "INACTIVE" }),
    });
    if (!cardRes.ok) {
      const t = await cardRes.text();
      return { ok: false, message: `Airwallex card PATCH failed: ${cardRes.status} ${t.slice(0, 200)}` };
    }
    return { ok: true, message: "Airwallex Issuing card set to INACTIVE" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Airwallex request error: ${msg}` };
  }
}
