const express = require("express");

const { buildSecretPayload } = require("./secrets.service");
const {
  requireAuthenticatedUser,
  requireTenantMembership,
} = require("../../shared/middleware/authentication");
const {
  attachSubscriptionAccess,
  requireFeatureAccess,
} = require("../../shared/middleware/subscriptionAccess");

const secretsRouter = express.Router();
const SUPPORTED_PROVIDERS = new Set(["stripe", "airwallex"]);

secretsRouter.post(
  "/",
  requireAuthenticatedUser,
  requireTenantMembership,
  attachSubscriptionAccess,
  requireFeatureAccess("api"),
  (req, res) => {
    const { provider, apiKey, createdByUserId, accountLabel } = req.body || {};

    if (!provider || !apiKey || !accountLabel) {
      return res.status(400).json({
        error: "provider, apiKey, and accountLabel are required.",
      });
    }

    if (!SUPPORTED_PROVIDERS.has(provider)) {
      return res.status(400).json({
        error: "provider must be one of: stripe, airwallex.",
      });
    }

    if (!req.context?.tenantId) {
      return res.status(400).json({
        error: "x-tenant-id header is required for tenant-scoped secret writes.",
      });
    }

    const payload = buildSecretPayload({
      tenantId: req.context.tenantId,
      provider,
      apiKey,
      createdByUserId: createdByUserId || req.auth.userId,
      accountLabel,
    });

    return res.status(201).json({
      message: "Secret encrypted successfully.",
      secret: payload,
    });
  },
);

module.exports = {
  secretsRouter,
};
