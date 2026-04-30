import { Router } from "express";
import type { Request, Response } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";
import { requireFullSubscription } from "../../middleware/requireFullSubscription.js";

const r = Router();

r.post(
  "/preview",
  requireAuth,
  requireTenantMembership,
  requireFullSubscription,
  (req: Request, res: Response) => {
    res.json({
      ok: true,
      message: "Auto-fill is available (subscription active)",
      organizationId: req.tenantId,
    });
  }
);

export const autofillRoutes = r;
