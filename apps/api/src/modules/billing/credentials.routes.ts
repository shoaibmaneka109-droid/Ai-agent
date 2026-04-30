import { Router } from "express";
import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";
import { requireFullSubscription } from "../../middleware/requireFullSubscription.js";
import { upsertEncryptedCredential } from "./credentials.repository.js";

const r = Router();

r.post("/:provider", requireAuth, requireTenantMembership, requireFullSubscription, async (req: Request, res: Response) => {
  const provider = req.params.provider;
  if (provider !== "stripe" && provider !== "airwallex") {
    res.status(400).json({ error: "provider must be stripe or airwallex" });
    return;
  }
  const body = req.body as { secret?: string; label?: string };
  if (!body?.secret) {
    res.status(400).json({ error: "secret required" });
    return;
  }
  try {
    await upsertEncryptedCredential({
      organizationId: req.tenantId!,
      provider,
      plaintextSecret: body.secret,
      label: body.label ?? null,
    });
    res.status(204).end();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("DATABASE_URL")) {
      res.status(503).json({ error: "Database not configured" });
      return;
    }
    if (env.nodeEnv !== "production") {
      // eslint-disable-next-line no-console
      console.error(e);
    }
    res.status(500).json({ error: "Failed to store credential" });
  }
});

export const credentialsRoutes = r;
