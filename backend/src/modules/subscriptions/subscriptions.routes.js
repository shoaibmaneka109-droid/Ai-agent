const { Router } = require('express');
const { body, param } = require('express-validator');
const subscriptionsService = require('./subscriptions.service');
const authenticate = require('../../shared/middleware/authenticate');
const { authorize, tenantGuard } = require('../../shared/middleware/authorize');
const validate = require('../../shared/middleware/validate');
const { sendSuccess } = require('../../shared/utils/apiResponse');

const router = Router({ mergeParams: true });
router.use(authenticate, tenantGuard);

// GET /organizations/:organizationId/subscription
// Returns full subscription context — used by frontend banner and dashboard
router.get('/', async (req, res, next) => {
  try {
    const status = await subscriptionsService.getSubscriptionStatus(req.user.organizationId);
    return sendSuccess(res, { subscription: status });
  } catch (err) {
    next(err);
  }
});

// GET /organizations/:organizationId/subscription/events
router.get('/events', authorize(['owner', 'admin']), async (req, res, next) => {
  try {
    const events = await subscriptionsService.listSubscriptionEvents(req.user.organizationId);
    return sendSuccess(res, { events });
  } catch (err) {
    next(err);
  }
});

// POST /organizations/:organizationId/subscription/reactivate
// Called after successful payment to unlock the org
router.post(
  '/reactivate',
  authorize(['owner']),
  validate([
    param('organizationId').isUUID(),
    body('plan').isIn(['starter', 'growth', 'enterprise']),
    body('periodEndDate').isISO8601().withMessage('periodEndDate must be an ISO 8601 date'),
    body('externalId').optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const result = await subscriptionsService.reactivateOrganization(
        req.user.organizationId,
        req.body
      );
      return sendSuccess(res, { subscription: result });
    } catch (err) {
      next(err);
    }
  }
);

// POST /organizations/:organizationId/subscription/cancel
router.post(
  '/cancel',
  authorize(['owner']),
  validate([body('reason').optional().isString().isLength({ max: 255 })]),
  async (req, res, next) => {
    try {
      await subscriptionsService.cancelSubscription(
        req.user.organizationId,
        req.body.reason || 'owner_requested'
      );
      return sendSuccess(res, { message: 'Subscription cancelled. Your data is preserved.' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
