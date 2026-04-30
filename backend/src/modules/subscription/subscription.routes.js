const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./subscription.controller');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const { tenantContext } = require('../../middleware/tenantContext');

const router = Router();
router.use(authenticate, tenantContext);

// Any authenticated member can check subscription status
router.get('/', controller.getStatus);
router.get('/events', controller.getEvents);

// Only owner can activate or cancel
router.post(
  '/activate',
  requireRole('owner'),
  [
    body('durationDays').optional().isInt({ min: 1, max: 3650 }),
    body('note').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  controller.activate
);

router.post(
  '/cancel',
  requireRole('owner'),
  [body('note').optional().isString().isLength({ max: 500 })],
  validate,
  controller.cancel
);

// Dev/test helper
router.post('/simulate-expire', requireRole('owner', 'admin'), controller.simulateExpire);

module.exports = router;
