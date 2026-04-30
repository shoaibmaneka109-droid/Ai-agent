import { Router } from "express";

import { apiKeyRouter } from "../modules/api-keys/api-key.routes.js";
import { organizationRouter } from "../modules/organizations/organization.routes.js";

export function createRoutes() {
  const routes = Router();

  routes.use("/organizations", organizationRouter);
  routes.use("/api-keys", apiKeyRouter);

  return routes;
}
