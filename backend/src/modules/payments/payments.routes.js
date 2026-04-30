const { Router } = require('express');
const { body, param, query: queryValidator } = require('express-validator');
const paymentsService = require('./payments.service');
const authenticate = require('../../shared/middleware/authenticate');
const { authorize, tenantGuard } = require('../../shared/middleware/authorize');
const { requireFullAccess } = require('../../shared/middleware/featureLock');
const validate = require('../../shared/middleware/validate');
const { sendSuccess, sendCreated } = require('../../shared/utils/apiResponse');

const router = Router({ mergeParams: true });
router.use(authenticate, tenantGuard);

// GET /organizations/:organizationId/payments
router.get(
  '/',
  validate([
    queryValidator('status').optional().isIn(['pending', 'succeeded', 'failed', 'refunded', 'cancelled']),
    queryValidator('provider').optional().isIn(['stripe', 'airwallex', 'custom']),
    queryValidator('page').optional().isInt({ min: 1 }),
    queryValidator('limit').optional().isInt({ min: 1, max: 100 }),
  ]),
  async (req, res, next) => {
    try {
      const result = await paymentsService.listPayments(req.user.organizationId, req.query);
      return sendSuccess(res, result, 200, result.meta);
    } catch (err) {
      next(err);
    }
  }
);

// POST /organizations/:organizationId/payments/intent
// Creating payment intents requires full access (locked during hibernation)
router.post(
  '/intent',
  requireFullAccess,
  authorize(['owner', 'admin', 'member']),
  validate([
    body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer (smallest currency unit)'),
    body('currency').isLength({ min: 3, max: 3 }).isAlpha().toUpperCase(),
    body('provider').isIn(['stripe', 'airwallex']),
    body('metadata').optional().isObject(),
  ]),
  async (req, res, next) => {
    try {
      const intent = await paymentsService.createPaymentIntent(req.user.organizationId, req.body);
      return sendCreated(res, { intent });
    } catch (err) {
      next(err);
    }
  }
);

// GET /organizations/:organizationId/payments/:paymentId
router.get(
  '/:paymentId',
  validate([param('paymentId').isUUID()]),
  async (req, res, next) => {
    try {
      const payment = await paymentsService.getPayment(
        req.user.organizationId,
        req.params.paymentId
      );
      return sendSuccess(res, { payment });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /organizations/:organizationId/payments/:paymentId/status
router.patch(
  '/:paymentId/status',
  authorize(['owner', 'admin']),
  validate([
    param('paymentId').isUUID(),
    body('status').isIn(['pending', 'succeeded', 'failed', 'refunded', 'cancelled']),
    body('externalId').optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const payment = await paymentsService.updatePaymentStatus(
        req.user.organizationId,
        req.params.paymentId,
        req.body.status,
        req.body.externalId
      );
      return sendSuccess(res, { payment });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
