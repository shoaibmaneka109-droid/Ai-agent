import express from "express";
import { organizationRoutes } from "./modules/organizations/routes.js";
import { organizationMemberRoutes } from "./modules/organizations/members.routes.js";
import { credentialsRoutes } from "./modules/billing/credentials.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { autofillRoutes } from "./modules/autofill/autofill.routes.js";
import { integrationRoutes } from "./modules/integrations/integration.routes.js";
import { agencyDashboardRoutes } from "./modules/agency/agencyDashboard.routes.js";
import { virtualCardRoutes } from "./modules/cards/virtualCard.routes.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1", integrationRoutes);
  app.use("/api/v1", organizationRoutes);
  app.use("/api/v1/organizations/:orgId", agencyDashboardRoutes);
  app.use("/api/v1/organizations/:orgId/members", organizationMemberRoutes);
  app.use("/api/v1/credentials", credentialsRoutes);
  app.use("/api/v1/autofill", autofillRoutes);
  app.use("/api/v1/virtual-cards", virtualCardRoutes);
  return app;
}
