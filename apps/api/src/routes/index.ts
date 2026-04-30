import { Router } from "express";

import { authRouter } from "../modules/auth/auth.routes.js";
import { apiKeyRouter } from "../modules/api-keys/api-key.routes.js";
import { autofillRouter } from "../modules/autofill/autofill.routes.js";
import { memberRouter } from "../modules/members/member.routes.js";
import { organizationRouter } from "../modules/organizations/organization.routes.js";
import { providerIntegrationRouter } from "../modules/provider-integrations/provider-integration.routes.js";

export function createRoutes() {
  const routes = Router();

  routes.use("/auth", authRouter);
  routes.use("/organizations", organizationRouter);
  routes.use("/api-keys", apiKeyRouter);
  routes.use("/members", memberRouter);
  routes.use("/autofill", autofillRouter);
  routes.use("/provider-integrations", providerIntegrationRouter);

  return routes;
}
