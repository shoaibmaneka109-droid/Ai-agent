const express = require("express");

const { addEmployeeToTenant } = require("../auth/auth.service");
const {
  requireAuthenticatedUser,
  requireTenantMembership,
} = require("../../shared/middleware/authentication");
const {
  attachSubscriptionAccess,
  requireFeatureAccess,
} = require("../../shared/middleware/subscriptionAccess");
const { pool } = require("../../shared/db/pool");
const { asyncHandler, AppError } = require("../../shared/http/errors");

const tenantsRouter = express.Router();

tenantsRouter.use(requireAuthenticatedUser);
tenantsRouter.use(attachSubscriptionAccess);

tenantsRouter.get(
  "/:tenantSlug",
  asyncHandler(async (req, res) => {
    const { tenantSlug } = req.params;
    const result = await pool.query(
      `
        SELECT
          t.id,
          t.slug,
          t.display_name,
          t.tenant_type,
          t.status,
          tm.role
        FROM tenants t
        JOIN tenant_memberships tm
          ON tm.tenant_id = t.id
        WHERE t.slug = $1 AND tm.user_id = $2
      `,
      [tenantSlug, req.auth.userId],
    );

    if (result.rowCount === 0) {
      throw new AppError(404, "Tenant not found for the current user.");
    }

    res.json({
      tenant: result.rows[0],
      subscription: req.subscription,
      message: "Tenant bootstrap endpoint for SecurePay.",
    });
  }),
);

tenantsRouter.get(
  "/:tenantSlug/data",
  asyncHandler(async (req, res) => {
    const { tenantSlug } = req.params;

    res.json({
      tenantSlug,
      accessMode: req.subscription.hibernation ? "hibernated-read-only" : "full-access",
      featuresLocked: req.subscription.featuresLocked,
      trialExpired: req.subscription.trialExpired,
      subscriptionExpired:
        req.subscription.paymentRequired && !req.subscription.trialExpired,
      capabilities: req.auth.capabilities,
      message:
        "Data remains visible during hibernation, but write and automation features are restricted.",
    });
  }),
);

tenantsRouter.post(
  "/:tenantSlug/autofill",
  requireFeatureAccess("autofill"),
  asyncHandler(async (req, res) => {
    const { tenantSlug } = req.params;

    res.json({
      tenantSlug,
      status: "enabled",
      message: "Auto-fill is available because the tenant has feature access.",
    });
  }),
);

tenantsRouter.post(
  "/:tenantSlug/employees",
  requireTenantMembership,
  requireFeatureAccess("api"),
  asyncHandler(async (req, res) => {
    const tenantLookup = await pool.query(
      `
        SELECT id, slug
        FROM tenants
        WHERE slug = $1
        LIMIT 1
      `,
      [req.params.tenantSlug],
    );

    if (tenantLookup.rowCount === 0) {
      throw new AppError(404, "Tenant not found.");
    }

    const result = await addEmployeeToTenant({
      actorUserId: req.auth.userId,
      tenantId: tenantLookup.rows[0].id,
      email: req.body?.email,
      role: req.body?.role,
    });

    res.status(201).json({
      message: "Employee added to tenant.",
      ...result,
    });
  }),
);

module.exports = {
  tenantsRouter,
};
