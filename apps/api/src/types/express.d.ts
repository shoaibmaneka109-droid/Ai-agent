import "express-serve-static-core";
import type { AuthTokenPayload } from "../security/jwt.js";
import type { SubscriptionAccess } from "../modules/subscriptions/trial-policy.js";

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthTokenPayload;
    entitlement?: SubscriptionAccess;
    tenantContext?: {
      tenantId: string;
      organizationId?: string;
    };
  }
}
