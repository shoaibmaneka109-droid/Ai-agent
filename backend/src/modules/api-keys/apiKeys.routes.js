const { Router } = require('express');
const { body } = require('express-validator');
const controller = require('./apiKeys.controller');
const validate = require('../../middleware/validate');
const { authenticate, requireRole } = require('../../middleware/auth');
const { tenantContext } = require('../../middleware/tenantContext');

const router = Router();
router.use(authenticate, tenantContext);

router.get('/', controller.listApiKeys);
router.get('/:id', controller.getApiKey);

router.post(
  '/',
  requireRole('owner', 'admin'),
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
  [
    body('secretKey').notEmpty(),
    body('publishableKey').optional().isString(),
  ],
  validate,
  controller.rotateApiKey
);

router.delete('/:id', requireRole('owner', 'admin'), controller.deleteApiKey);

module.exports = router;
