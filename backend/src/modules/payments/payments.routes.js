const { Router } = require('express');
const { body, query: qv, param } = require('express-validator');
const authenticate = require('../../middleware/authenticate');
const validate     = require('../../middleware/validate');
const { createPayment, listPayments, getPayment, refundPayment } = require('./payments.service');
const { success, created } = require('../../utils/apiResponse');

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get(
  '/',
  [
    qv('page').optional().isInt({ min: 1 }).toInt(),
    qv('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    qv('status').optional().isIn(['pending', 'succeeded', 'failed', 'refunded']),
    qv('provider').optional().isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const result = await listPayments(req.tenant.id, req.query);
      success(res, result.payments, 200, { total: result.total, page: result.page, limit: result.limit });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  [
    body('provider').notEmpty(),
    body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer (smallest currency unit)'),
    body('currency').isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter ISO code'),
    body('environment').optional().isIn(['live', 'sandbox']),
    body('metadata').optional().isObject(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const payment = await createPayment(req.tenant.id, req.body);
      created(res, payment);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:paymentId',
  [param('paymentId').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const payment = await getPayment(req.params.paymentId, req.tenant.id);
      success(res, payment);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/:paymentId/refund',
  [
    param('paymentId').isUUID(),
    body('reason').optional().isString(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const payment = await refundPayment(req.params.paymentId, req.tenant.id, req.body);
      success(res, payment);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
