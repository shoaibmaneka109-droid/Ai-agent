const { body, query: qv } = require('express-validator');
const paymentService = require('../services/payment.service');
const { success, created, paginated } = require('../utils/apiResponse');
const validate = require('../middleware/validate.middleware');

const createValidators = [
  body('provider').isIn(['stripe', 'airwallex', 'manual']),
  body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer (smallest currency unit)'),
  body('currency').optional().isLength({ min: 3, max: 3 }),
  body('customerEmail').optional().isEmail(),
];

async function list(req, res, next) {
  try {
    const { payments, meta } = await paymentService.listPayments(req.tenant.id, req.query);
    return paginated(res, payments, meta);
  } catch (err) {
    next(err);
  }
}

async function show(req, res, next) {
  try {
    const payment = await paymentService.getPayment(req.tenant.id, req.params.paymentId);
    return success(res, payment);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const payment = await paymentService.createPaymentRecord(req.tenant.id, req.user.id, req.body);
    return created(res, payment, 'Payment recorded');
  } catch (err) {
    next(err);
  }
}

async function refund(req, res, next) {
  try {
    const refundRecord = await paymentService.createRefund(
      req.tenant.id,
      req.params.paymentId,
      req.user.id,
      req.body,
    );
    return created(res, refundRecord, 'Refund initiated');
  } catch (err) {
    next(err);
  }
}

async function analytics(req, res, next) {
  try {
    const data = await paymentService.getAnalytics(req.tenant.id, req.query);
    return success(res, data, 'Analytics data');
  } catch (err) {
    next(err);
  }
}

module.exports = { list, show, create, refund, analytics, createValidators };
