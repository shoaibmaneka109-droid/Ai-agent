import type { NextFunction, Request, Response } from "express";

import { HttpError } from "./error-handler.js";
import { getTenantContext, requireTenantContext } from "./tenant-context.js";
import { SubscriptionRepository } from "../modules/subscriptions/subscription.repository.js";
import { evaluateSubscriptionAccess } from "../modules/subscriptions/trial-policy.js";

const repository = new SubscriptionRepository();

export async function attachSubscriptionAccess(req: Request, res: Response, next: NextFunction) {
  requireTenantContext(req, res, async () => {
    try {
      const { tenantId } = getTenantContext(req);
      const tenant = await repository.getEntitlement(tenantId);

      if (!tenant) {
        throw new HttpError(404, "Tenant not found", "TENANT_NOT_FOUND");
      }

      req.entitlement = evaluateSubscriptionAccess(tenant);
      next();
    } catch (error) {
      next(error);
    }
  });
}

export function requireActiveSubscription(req: Request, _res: Response, next: NextFunction) {
  if (!req.entitlement) {
    throw new HttpError(500, "Subscription access has not been evaluated", "SUBSCRIPTION_ACCESS_MISSING");
  }

  if (!req.entitlement.apiEnabled) {
    throw new HttpError(
      402,
      "Subscription payment is required. Data is available in read-only hibernation mode.",
      "SUBSCRIPTION_PAYMENT_REQUIRED"
    );
  }

  next();
}
