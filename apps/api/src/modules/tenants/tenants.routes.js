const express = require("express");

const tenantsRouter = express.Router();

tenantsRouter.get("/:tenantSlug", (req, res) => {
  const { tenantSlug } = req.params;

  res.json({
    tenantSlug,
    tenantId: req.context.tenantId,
    tenantType: tenantSlug.includes("agency") ? "agency" : "solo",
    message: "Tenant bootstrap endpoint for SecurePay.",
  });
});

module.exports = {
  tenantsRouter,
};
