import express, { Router } from "express";
import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { getDecryptedCredential } from "../billing/credentials.repository.js";
import {
  verifyStripeWebhook,
  findVirtualCardById,
  markCardFrozenInDb,
  freezeStripeIssuingCardIfPossible,
  freezeAirwallexCardIfPossible,
  verifyAirwallexSignatureIfPresent,
  emitCardFrozenToOrg,
} from "./paymentWebhook.service.js";

const stripeRouter = Router();
const airwallexRouter = Router();
const combinedRouter = Router();

function requireOrgQuery(req: Request, res: Response): string | null {
  const orgId = (req.query.organization_id as string | undefined)?.trim();
  if (!orgId) {
    res.status(400).send("Missing organization_id query parameter");
    return null;
  }
  return orgId;
}

async function processStripeWebhook(req: Request, res: Response, organizationId: string, raw: Buffer): Promise<void> {
  const whSecret = await getDecryptedCredential(organizationId, "stripe", "webhook_secret");
  if (!whSecret) {
    res.status(503).send("Stripe webhook secret not configured for this organization");
    return;
  }
  const sig = req.header("stripe-signature");
  const event = verifyStripeWebhook(raw, sig, whSecret);
  if (event.type !== "payment_intent.succeeded") {
    res.json({ received: true, ignored: event.type });
    return;
  }
  const pi = event.data.object as { metadata?: Record<string, string> };
  const cardId = pi.metadata?.organization_virtual_card_id?.trim() ?? pi.metadata?.virtual_card_id?.trim();
  if (!cardId) {
    res.json({ received: true, skipped: "no_card_metadata" });
    return;
  }
  const card = await findVirtualCardById(cardId);
  if (!card || card.organization_id !== organizationId) {
    res.status(404).json({ error: "Virtual card not found for organization" });
    return;
  }
  if (!card.is_auto_freeze_enabled) {
    res.json({ received: true, skipped: "auto_freeze_disabled" });
    return;
  }
  if (card.card_kind === "MASTER_CARD") {
    res.json({ received: true, skipped: "master_card_excluded" });
    return;
  }
  const apiSecret = await getDecryptedCredential(organizationId, "stripe", "api_secret");
  if (!apiSecret) {
    res.status(503).json({ error: "Stripe API secret not configured" });
    return;
  }
  const providerResult = await freezeStripeIssuingCardIfPossible(card.external_ref, apiSecret);
  await markCardFrozenInDb(organizationId, card.id);
  emitCardFrozenToOrg({
    organizationId,
    virtualCardId: card.id,
    externalRef: card.external_ref,
    last4: card.last4,
    provider: "stripe",
    source: "webhook_auto_freeze",
  });
  res.json({ received: true, frozen: true, providerMessage: providerResult.message });
}

async function processAirwallexWebhook(req: Request, res: Response, organizationId: string, raw: Buffer): Promise<void> {
  const whSecret = await getDecryptedCredential(organizationId, "airwallex", "webhook_secret");
  if (!whSecret) {
    res.status(503).send("Airwallex webhook secret not configured");
    return;
  }
  const sig = req.header("x-airwallex-signature") ?? req.header("x-signature");
  if (!verifyAirwallexSignatureIfPresent(raw, sig, whSecret)) {
    res.status(401).send("Invalid webhook signature");
    return;
  }
  const body = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  const type = String(body.type ?? body.name ?? body.event ?? "");
  const isPaymentSuccess =
    type === "payment_intent.succeeded" ||
    (type.length > 0 && type.includes("payment_intent.succeeded")) ||
    type === "issuing.transaction.succeeded" ||
    type === "issuing.purchase.succeeded";
  if (!isPaymentSuccess) {
    res.json({ received: true, ignored: type || "unknown_type" });
    return;
  }
  const dataObj = body.data as Record<string, unknown> | undefined;
  const inner = dataObj?.object as Record<string, unknown> | undefined;
  const nestedMeta =
    (inner?.metadata as Record<string, string> | undefined) ??
    (body.metadata as Record<string, string> | undefined) ??
    {};
  const cardId =
    nestedMeta.organization_virtual_card_id ??
    nestedMeta.virtual_card_id ??
    (typeof body.organization_virtual_card_id === "string" ? body.organization_virtual_card_id : undefined);
  const id = typeof cardId === "string" ? cardId.trim() : "";
  if (!id) {
    res.json({ received: true, skipped: "no_card_metadata" });
    return;
  }
  const card = await findVirtualCardById(id);
  if (!card || card.organization_id !== organizationId) {
    res.status(404).json({ error: "Virtual card not found" });
    return;
  }
  if (!card.is_auto_freeze_enabled) {
    res.json({ received: true, skipped: "auto_freeze_disabled" });
    return;
  }
  if (card.card_kind === "MASTER_CARD") {
    res.json({ received: true, skipped: "master_card_excluded" });
    return;
  }
  const apiJson = await getDecryptedCredential(organizationId, "airwallex", "api_secret");
  if (!apiJson) {
    res.status(503).json({ error: "Airwallex API credentials not configured" });
    return;
  }
  const providerResult = await freezeAirwallexCardIfPossible(card.external_ref, apiJson);
  await markCardFrozenInDb(organizationId, card.id);
  emitCardFrozenToOrg({
    organizationId,
    virtualCardId: card.id,
    externalRef: card.external_ref,
    last4: card.last4,
    provider: "airwallex",
    source: "webhook_auto_freeze",
  });
  res.json({ received: true, frozen: true, providerMessage: providerResult.message });
}

stripeRouter.post("/", async (req: Request, res: Response) => {
  const organizationId = requireOrgQuery(req, res);
  if (!organizationId) return;
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || raw.length === 0) {
    res.status(400).send("Empty body");
    return;
  }
  try {
    await processStripeWebhook(req, res, organizationId, raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Webhook signature") || msg.includes("Stripe-Signature")) {
      res.status(400).send(msg);
      return;
    }
    if (env.nodeEnv !== "production") console.error(e);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

airwallexRouter.post("/", async (req: Request, res: Response) => {
  const organizationId = requireOrgQuery(req, res);
  if (!organizationId) return;
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || raw.length === 0) {
    res.status(400).send("Empty body");
    return;
  }
  try {
    await processAirwallexWebhook(req, res, organizationId, raw);
  } catch (e) {
    if (env.nodeEnv !== "production") console.error(e);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

/** Combined entry: Stripe if Stripe-Signature present, else Airwallex (signed JSON). */
combinedRouter.post("/", async (req: Request, res: Response) => {
  const organizationId = requireOrgQuery(req, res);
  if (!organizationId) return;
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw) || raw.length === 0) {
    res.status(400).send("Empty body");
    return;
  }
  try {
    if (req.header("stripe-signature")) {
      await processStripeWebhook(req, res, organizationId, raw);
      return;
    }
    await processAirwallexWebhook(req, res, organizationId, raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Webhook signature") || msg.includes("Stripe-Signature")) {
      res.status(400).send(msg);
      return;
    }
    if (env.nodeEnv !== "production") console.error(e);
    if (!res.headersSent) res.status(500).json({ error: "Webhook processing failed" });
  }
});

export function mountPaymentWebhooks(app: express.Express): void {
  const rawJson = express.raw({ type: "application/json" });
  app.use("/api/webhooks/payments", rawJson, combinedRouter);
  app.use("/api/webhooks/payments/stripe", rawJson, stripeRouter);
  app.use("/api/webhooks/payments/airwallex", rawJson, airwallexRouter);
}
