const { AppError } = require("../http/errors");
const { pool } = require("../db/pool");
const {
  computeSubscriptionStatus,
} = require("../../modules/subscriptions/subscriptions.service");

const LOCKED_CAPABILITIES = {
  api:
    "Tenant subscription is in hibernation. API features are locked until payment is restored.",
  autofill:
    "Tenant subscription is in hibernation. Auto-fill is locked until payment is restored.",
};

async function attachSubscriptionAccess(req, _res, next) {
  try {
    const tenantId = req.auth?.membership?.tenantId || req.context?.tenantId || null;

    if (!tenantId) {
      req.subscription = computeSubscriptionStatus(null);
      req.auth = req.auth || {};
      req.auth.capabilities = req.subscription.capabilities;
      return next();
    }

    const result = await pool.query(
      `
        SELECT *
        FROM tenant_subscriptions
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantId],
    );

    req.subscription = computeSubscriptionStatus(result.rows[0] || null);
    req.auth = req.auth || {};
    req.auth.capabilities = req.subscription.capabilities;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireFeatureAccess(capability = "api") {
  return (req, _res, next) => {
    if (!req.subscription) {
      return next(
        new AppError(500, "Subscription context was not loaded for this request."),
      );
    }

    const capabilityMap = req.subscription.capabilities || {};
    const isAllowed =
      capability === "autofill"
        ? capabilityMap.autofillEnabled
        : capabilityMap.apiEnabled;

    if (!isAllowed) {
      return next(
        new AppError(402, LOCKED_CAPABILITIES[capability] || LOCKED_CAPABILITIES.api, {
          capability,
          subscription: req.subscription,
        }),
      );
    }

    return next();
  };
}

function allowReadOnlyHibernation(req, _res, next) {
  if (!req.subscription) {
    return next(new AppError(500, "Subscription context was not loaded for this request."));
  }

  req.auth.capabilities = {
    canUseApi: req.subscription.capabilities.apiEnabled,
    canUseAutofill: req.subscription.capabilities.autofillEnabled,
    canViewData: req.subscription.capabilities.dataViewEnabled,
  };

  return next();
}

module.exports = {
  attachSubscriptionAccess,
  allowReadOnlyHibernation,
  requireFeatureAccess,
};
