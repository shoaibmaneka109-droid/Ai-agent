import type { Request, Response, NextFunction } from "express";

/**
 * Blocks API integrations (credentials, auto-fill, etc.) when subscription/trial ended.
 * Read-only / session routes stay available after login (hibernation).
 */
export function requireFullSubscription(req: Request, res: Response, next: NextFunction): void {
  const billing = req.orgBilling;
  if (!billing) {
    res.status(500).json({ error: "Billing context missing" });
    return;
  }
  if (!billing.integrationsUnlocked) {
    res.status(402).json({
      error: "Subscription required",
      code: "HIBERNATION",
      accessMode: billing.accessMode,
      trialEndsAt: billing.trialEndsAt.toISOString(),
      subscriptionEndsAt: billing.subscriptionEndsAt?.toISOString() ?? null,
    });
    return;
  }
  next();
}
