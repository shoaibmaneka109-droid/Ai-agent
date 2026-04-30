const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./payments.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { tenantContext } = require('../../middleware/tenantContext');
const {
  requireActiveSubscription,
  requireNotCancelled,
} = require('../../middleware/subscriptionGuard');

const router = Router();
router.use(authenticate, tenantContext);

// READ: hibernating users can still view their payment history
router.get('/', requireNotCancelled, controller.listPayments);
router.get('/stats', requireNotCancelled, controller.getPaymentStats);
router.get('/:id', requireNotCancelled, controller.getPayment);

// CREATE: requires active/trialing subscription — invokes payment provider API key
router.post(
  '/',
  requireActiveSubscription,
  [
    body('provider').isIn(['stripe', 'airwallex', 'custom']),
    body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer (cents)'),
    body('currency').optional().isIn(['USD', 'EUR', 'GBP', 'AUD', 'SGD', 'HKD']),
    body('description').optional().isString().isLength({ max: 500 }),
    body('customerEmail').optional().isEmail().normalizeEmail(),
    body('customerName').optional().isString().isLength({ max: 255 }),
    body('environment').optional().isIn(['live', 'test']),
  ],
  validate,
  controller.createPayment
);

module.exports = router;
