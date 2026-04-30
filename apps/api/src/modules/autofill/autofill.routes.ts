import { Router } from "express";

import { authenticateJwt } from "../../middleware/authenticate-jwt.js";
import { attachSubscriptionAccess, requireActiveSubscription } from "../../middleware/entitlements.js";

export const autofillRouter = Router();

autofillRouter.post(
  "/resolve",
  authenticateJwt,
  attachSubscriptionAccess,
  requireActiveSubscription,
  async (_req, res) => {
    res.json({
      data: {
        locked: false,
        message: "Auto-fill is available for tenants with an active trial or paid subscription."
      }
    });
  }
);
