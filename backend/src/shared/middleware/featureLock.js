const { sendError } = require('../utils/apiResponse');

/**
 * featureLock
 *
 * Enforces the "Data Hibernation" policy:
 *  - Hibernating / cancelled orgs can log in and read their data (GET requests pass through).
 *  - All write operations (POST, PUT, PATCH, DELETE) and any route explicitly marked
 *    as "feature-locked" are blocked with HTTP 402 until the subscription is reactivated.
 *
 * Usage variants:
 *
 *  1. requireFullAccess  — Hard block on the ENTIRE route for hibernating orgs.
 *     router.post('/intent', requireFullAccess, handler)
 *
 *  2. requireTrialingOrActive — Same as requireFullAccess but also blocks if only cancelled.
 *
 *  3. blockWritesOnHibernation — Applied globally; automatically blocks all mutating
 *     methods for hibernating/cancelled orgs. Read operations (GET, HEAD) pass through,
 *     so the user can browse their historical data.
 */

const HIBERNATION_RESPONSE = {
  code: 'ACCOUNT_HIBERNATING',
  message:
    'Your account is in Data Hibernation mode. ' +
    'You can view your existing data but API integrations and payment features ' +
    'are locked until your subscription is reactivated.',
  upgradeUrl: '/settings/billing',
};

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Block any mutating HTTP method when the account is hibernating or cancelled.
 * Attach to router-level or individual route-level after checkSubscription.
 */
const blockWritesOnHibernation = (req, res, next) => {
  if (!req.subscription) return next();

  if (
    !req.subscription.hasFullAccess &&
    MUTATING_METHODS.has(req.method)
  ) {
    return sendError(res, HIBERNATION_RESPONSE.message, 402, HIBERNATION_RESPONSE.code, {
      upgradeUrl: HIBERNATION_RESPONSE.upgradeUrl,
      status: req.subscription.status,
    });
  }

  next();
};

/**
 * Hard block: any HTTP method is blocked when the account is not fully active.
 * Use for endpoints that must never be accessible in read-only mode
 * (e.g. creating payment intents, using auto-fill APIs).
 */
const requireFullAccess = (req, res, next) => {
  if (!req.subscription) return next();

  if (!req.subscription.hasFullAccess) {
    return sendError(res, HIBERNATION_RESPONSE.message, 402, HIBERNATION_RESPONSE.code, {
      upgradeUrl: HIBERNATION_RESPONSE.upgradeUrl,
      status: req.subscription.status,
    });
  }

  next();
};

/**
 * API / Auto-fill lock: must have an active (non-trial) subscription.
 * Use for premium features that should not be available during free trial either.
 */
const requireActiveSubscription = (req, res, next) => {
  if (!req.subscription) return next();

  if (!req.subscription.isActive) {
    const isPaidFeature = !req.subscription.isTrialing;
    return sendError(
      res,
      isPaidFeature
        ? HIBERNATION_RESPONSE.message
        : 'This feature requires an active paid subscription.',
      402,
      req.subscription.isTrialing ? 'UPGRADE_REQUIRED' : HIBERNATION_RESPONSE.code,
      { upgradeUrl: HIBERNATION_RESPONSE.upgradeUrl, status: req.subscription.status }
    );
  }

  next();
};

module.exports = { blockWritesOnHibernation, requireFullAccess, requireActiveSubscription };
