const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./apiKeys.controller');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const { tenantContext } = require('../../middleware/tenantContext');
const {
  requireActiveSubscription,
  requireNotCancelled,
} = require('../../middleware/subscriptionGuard');

const router = Router();
router.use(authenticate, tenantContext);

// READ operations: allowed in hibernation (Data Hibernation — can view, not use)
router.get('/', requireNotCancelled, controller.listApiKeys);
router.get('/:id', requireNotCancelled, controller.getApiKey);

// WRITE / ACTIVE-USE operations: require an active/trialing subscription
router.post(
  '/',
  requireRole('owner', 'admin'),
  requireActiveSubscription,
  [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('provider').isIn(['stripe', 'airwallex', 'custom']),
    body('environment').optional().isIn(['live', 'test']),
    body('secretKey').notEmpty().withMessage('secretKey is required'),
    body('publishableKey').optional().isString(),
  ],
  validate,
  controller.createApiKey
);

router.put(
  '/:id/rotate',
  requireRole('owner', 'admin'),
  requireActiveSubscription,
  [
    body('secretKey').notEmpty(),
    body('publishableKey').optional().isString(),
  ],
  validate,
  controller.rotateApiKey
);

router.delete('/:id', requireRole('owner', 'admin'), requireActiveSubscription, controller.deleteApiKey);

module.exports = router;
