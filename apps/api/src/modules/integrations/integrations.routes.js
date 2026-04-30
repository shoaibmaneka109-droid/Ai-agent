const express = require("express");

const {
  listIntegrationsForTenant,
  saveIntegrationSettings,
  testProviderConnection,
} = require("./integrations.service");
const {
  requireAuthenticatedUser,
  requireTenantMembership,
  requireRoles,
} = require("../../shared/middleware/authentication");
const {
  attachSubscriptionAccess,
  requireFeatureAccess,
} = require("../../shared/middleware/subscriptionAccess");
const { asyncHandler } = require("../../shared/http/errors");

const integrationsRouter = express.Router();

integrationsRouter.use(requireAuthenticatedUser);
integrationsRouter.use(requireTenantMembership);
integrationsRouter.use(requireRoles(["owner", "admin"]));
integrationsRouter.use(attachSubscriptionAccess);

integrationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const integrations = await listIntegrationsForTenant(req.auth.membership.tenantId);

    res.json({
      integrations,
      tenantId: req.auth.membership.tenantId,
    });
  }),
);

integrationsRouter.post(
  "/",
  requireFeatureAccess("api"),
  asyncHandler(async (req, res) => {
    const integration = await saveIntegrationSettings({
      tenantId: req.auth.membership.tenantId,
      actorUserId: req.auth.userId,
      provider: req.body?.provider,
      credentials: req.body?.credentials,
      environment: req.body?.environment,
    });

    res.status(201).json({
      message: "Integration settings saved securely.",
      integration,
    });
  }),
);

integrationsRouter.post(
  "/test",
  requireFeatureAccess("api"),
  asyncHandler(async (req, res) => {
    const result = await testProviderConnection({
      tenantId: req.auth.membership.tenantId,
      actorUserId: req.auth.userId,
      actorRole: req.auth.membership.role,
      provider: req.body?.provider,
    });

    res.json({
      result,
    });
  }),
);

module.exports = {
  integrationsRouter,
};
