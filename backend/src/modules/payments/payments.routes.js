const { Router } = require('express');
const { body, query } = require('express-validator');
const controller = require('./payments.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const { tenantContext } = require('../../middleware/tenantContext');

const router = Router();
router.use(authenticate, tenantContext);

router.get('/', controller.listPayments);
router.get('/stats', controller.getPaymentStats);
router.get('/:id', controller.getPayment);

router.post(
  '/',
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
