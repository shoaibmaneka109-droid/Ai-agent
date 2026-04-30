import express from "express";
import { organizationRoutes } from "./modules/organizations/routes.js";
import { credentialsRoutes } from "./modules/billing/credentials.routes.js";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", organizationRoutes);
  app.use("/api/v1/credentials", credentialsRoutes);
  return app;
}
