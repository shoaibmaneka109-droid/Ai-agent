const express = require("express");

const {
  requireAuthenticatedUser,
  requireTenantMembership,
} = require("../../shared/middleware/authentication");
const {
  attachSubscriptionAccess,
  requireFeatureAccess,
} = require("../../shared/middleware/subscriptionAccess");

const autofillRouter = express.Router();

autofillRouter.use(requireAuthenticatedUser);
autofillRouter.use(requireTenantMembership);
autofillRouter.use(attachSubscriptionAccess);

autofillRouter.post("/", requireFeatureAccess("autofill"), (req, res) => {
  res.json({
    message: "Auto-fill executed successfully.",
    tenantId: req.context.tenantId,
    subscription: req.subscription,
    capabilities: req.auth.capabilities,
  });
});

module.exports = {
  autofillRouter,
};
