import { Router } from "express";
import type { Request, Response } from "express";
import type { CredentialProvider } from "@securepay/shared";
import {
  testStripeConnection,
  testAirwallexConnection,
  testWiseConnection,
} from "@securepay/shared";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";
import { requireFullSubscription } from "../../middleware/requireFullSubscription.js";
import { requireMainAgencyAdmin } from "../../middleware/requireOrgPermissions.js";
import {
  upsertEncryptedCredential,
  getDecryptedCredential,
  listCredentialRows,
} from "../billing/credentials.repository.js";

const r = Router();

function parseProvider(p: string): CredentialProvider | null {
  if (p === "stripe" || p === "airwallex" || p === "wise") return p;
  return null;
}

/** Encrypted JSON for Airwallex issuing: client id + API key (+ optional API base). */
function buildAirwallexApiPayload(body: {
  clientId?: string;
  apiKey?: string;
  baseUrl?: string | null;
}): string {
  if (!body.clientId || !body.apiKey) {
    throw new Error("AIRWALLEX_FIELDS");
  }
  return JSON.stringify({
    clientId: body.clientId.trim(),
    apiKey: body.apiKey.trim(),
    baseUrl: body.baseUrl?.trim() || undefined,
  });
}

r.get(
  "/integrations",
  requireAuth,
  requireTenantMembership,
  requireMainAgencyAdmin,
  async (req: Request, res: Response) => {
    try {
      const rows = await listCredentialRows(req.tenantId!);
      const configured = rows.map((row) => ({
        provider: row.provider,
        kind: row.credential_kind,
        updatedAt: row.updated_at.toISOString(),
      }));
      res.json({ organizationId: req.tenantId, credentials: configured });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("DATABASE_URL")) {
        res.status(503).json({ error: "Database not configured" });
        return;
      }
      throw e;
    }
  }
);

r.put(
  "/integrations/:provider",
  requireAuth,
  requireTenantMembership,
  requireMainAgencyAdmin,
  requireFullSubscription,
  async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider ?? "");
    if (!provider) {
      res.status(400).json({ error: "Unknown provider" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    try {
      if (provider === "stripe") {
        const apiSecret = body.apiSecret as string | undefined;
        const webhookSecret = body.webhookSecret as string | undefined;
        if (!apiSecret?.trim()) {
          res.status(400).json({ error: "apiSecret required for Stripe" });
          return;
        }
        await upsertEncryptedCredential({
          organizationId: req.tenantId!,
          provider: "stripe",
          kind: "api_secret",
          plaintextSecret: apiSecret.trim(),
          label: "Stripe API",
        });
        if (webhookSecret?.trim()) {
          await upsertEncryptedCredential({
            organizationId: req.tenantId!,
            provider: "stripe",
            kind: "webhook_secret",
            plaintextSecret: webhookSecret.trim(),
            label: "Stripe webhook signing",
          });
        }
      } else if (provider === "airwallex") {
        const webhookSecret = body.webhookSecret as string | undefined;
        const payload = buildAirwallexApiPayload({
          clientId: body.clientId as string | undefined,
          apiKey: body.apiKey as string | undefined,
          baseUrl: (body.baseUrl as string | undefined) ?? null,
        });
        await upsertEncryptedCredential({
          organizationId: req.tenantId!,
          provider: "airwallex",
          kind: "api_secret",
          plaintextSecret: payload,
          label: "Airwallex API",
        });
        if (webhookSecret?.trim()) {
          await upsertEncryptedCredential({
            organizationId: req.tenantId!,
            provider: "airwallex",
            kind: "webhook_secret",
            plaintextSecret: webhookSecret.trim(),
            label: "Airwallex webhook",
          });
        }
      } else if (provider === "wise") {
        const apiSecret = body.apiSecret as string | undefined;
        const webhookSecret = body.webhookSecret as string | undefined;
        if (!apiSecret?.trim()) {
          res.status(400).json({ error: "apiSecret (Wise API token) required" });
          return;
        }
        const live = Boolean(body.live);
        const toStore = JSON.stringify({ token: apiSecret.trim(), live });
        await upsertEncryptedCredential({
          organizationId: req.tenantId!,
          provider: "wise",
          kind: "api_secret",
          plaintextSecret: toStore,
          label: live ? "Wise (live)" : "Wise (sandbox)",
        });
        if (webhookSecret?.trim()) {
          await upsertEncryptedCredential({
            organizationId: req.tenantId!,
            provider: "wise",
            kind: "webhook_secret",
            plaintextSecret: webhookSecret.trim(),
            label: "Wise webhook",
          });
        }
      }
      res.status(204).end();
    } catch (e) {
      if (e instanceof Error && e.message === "AIRWALLEX_FIELDS") {
        res.status(400).json({ error: "clientId and apiKey required for Airwallex" });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("DATABASE_URL")) {
        res.status(503).json({ error: "Database not configured" });
        return;
      }
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ error: "Failed to save integration" });
    }
  }
);

async function runProviderApiTest(
  provider: CredentialProvider,
  plaintext: string
): Promise<Awaited<ReturnType<typeof testStripeConnection>>> {
  if (provider === "stripe") {
    return testStripeConnection(plaintext);
  }
  if (provider === "airwallex") {
    const parsed = JSON.parse(plaintext) as {
      clientId?: string;
      apiKey?: string;
      baseUrl?: string;
    };
    if (!parsed.clientId || !parsed.apiKey) {
      return { ok: false, provider: "airwallex", message: "Stored Airwallex credentials invalid JSON" };
    }
    return testAirwallexConnection({
      clientId: parsed.clientId,
      apiKey: parsed.apiKey,
      baseUrl: parsed.baseUrl,
    });
  }
  const wiseParsed = JSON.parse(plaintext) as { token?: string; live?: boolean };
  if (!wiseParsed?.token) {
    return { ok: false, provider: "wise", message: "Stored Wise credentials missing token" };
  }
  return testWiseConnection(wiseParsed.token, Boolean(wiseParsed.live));
}

r.get(
  "/integrations/:provider/connection-test",
  requireAuth,
  requireTenantMembership,
  requireMainAgencyAdmin,
  requireFullSubscription,
  async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider ?? "");
    if (!provider) {
      res.status(400).json({ error: "Unknown provider" });
      return;
    }
    try {
      const apiSecret = await getDecryptedCredential(req.tenantId!, provider, "api_secret");
      if (!apiSecret) {
        res.status(400).json({ error: "No API credentials saved for this provider" });
        return;
      }
      const result = await runProviderApiTest(provider, apiSecret);
      res.json(result);
    } catch (e) {
      if (e instanceof SyntaxError) {
        res.status(500).json({ ok: false, provider, message: "Could not parse stored credentials" });
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("DATABASE_URL")) {
        res.status(503).json({ error: "Database not configured" });
        return;
      }
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ ok: false, provider, message: "Connection test failed" });
    }
  }
);

r.post(
  "/integrations/:provider/connection-test",
  requireAuth,
  requireTenantMembership,
  requireMainAgencyAdmin,
  requireFullSubscription,
  async (req: Request, res: Response) => {
    const provider = parseProvider(req.params.provider ?? "");
    if (!provider) {
      res.status(400).json({ error: "Unknown provider" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    try {
      if (provider === "stripe") {
        const apiSecret = body.apiSecret as string | undefined;
        if (!apiSecret?.trim()) {
          res.status(400).json({ error: "apiSecret required" });
          return;
        }
        const apiResult = await testStripeConnection(apiSecret);
        const wh = body.webhookSecret as string | undefined;
        if (wh?.trim()) {
          const whTrim = wh.trim();
          if (!whTrim.startsWith("whsec_")) {
            res.json({
              ...apiResult,
              webhook: {
                ok: false,
                message: "Stripe webhook signing secrets usually start with whsec_",
              },
            });
            return;
          }
          res.json({
            ...apiResult,
            webhook: {
              ok: true,
              message:
                "Webhook secret format looks valid. Confirm events in the Stripe dashboard (no server ping for signing secrets).",
            },
          });
          return;
        }
        res.json(apiResult);
        return;
      }
      if (provider === "airwallex") {
        const creds = {
          clientId: String(body.clientId ?? "").trim(),
          apiKey: String(body.apiKey ?? "").trim(),
          baseUrl: body.baseUrl ? String(body.baseUrl).trim() : undefined,
        };
        if (!creds.clientId || !creds.apiKey) {
          res.status(400).json({ error: "clientId and apiKey required for Airwallex" });
          return;
        }
        const apiResult = await testAirwallexConnection(creds);
        const wh = body.webhookSecret as string | undefined;
        if (wh?.trim()) {
          res.json({
            ...apiResult,
            webhook: {
              ok: true,
              message:
                "Webhook secret captured; verify delivery in Airwallex dashboard (no outbound verification).",
            },
          });
          return;
        }
        res.json(apiResult);
        return;
      }
      const apiSecret = body.apiSecret as string | undefined;
      if (!apiSecret?.trim()) {
        res.status(400).json({ error: "apiSecret (Wise token) required" });
        return;
      }
      const live = Boolean(body.live);
      const apiResult = await testWiseConnection(apiSecret, live);
      const wh = body.webhookSecret as string | undefined;
      if (wh?.trim()) {
        res.json({
          ...apiResult,
          webhook: {
            ok: wh.trim().length >= 8,
            message:
              wh.trim().length >= 8
                ? "Webhook secret format OK; configure URL in Wise (no ping)."
                : "Webhook secret too short",
          },
        });
        return;
      }
      res.json(apiResult);
    } catch (e) {
      if (env.nodeEnv !== "production") console.error(e);
      res.status(500).json({ ok: false, provider, message: "Connection test failed" });
    }
  }
);

export const integrationRoutes = r;
