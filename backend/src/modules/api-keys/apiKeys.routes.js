const { Router } = require('express');
const { body, param } = require('express-validator');
const authenticate       = require('../../middleware/authenticate');
const authorize          = require('../../middleware/authorize');
const checkSubscription  = require('../../middleware/checkSubscription');
const validate           = require('../../middleware/validate');
const { listApiKeys, createApiKey, rotateApiKey, deleteApiKey } = require('./apiKeys.service');
const { success, created, noContent } = require('../../utils/apiResponse');

const router = Router({ mergeParams: true });

// API key management requires full active subscription (requireActive).
// Even listing keys is locked in hibernation — raw keys are operational data.
router.use(authenticate, authorize('owner', 'admin'), checkSubscription.requireActive);

router.get('/', async (req, res, next) => {
  try {
    const keys = await listApiKeys(req.tenant.id);
    success(res, keys);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  [
    body('provider').notEmpty().toLowerCase(),
    body('label').trim().notEmpty(),
    body('rawKey').notEmpty().withMessage('rawKey is required'),
    body('environment').optional().isIn(['live', 'sandbox']),
  ],
  validate,
  async (req, res, next) => {
    try {
      const key = await createApiKey(req.tenant.id, req.body);
      created(res, key);
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/:keyId',
  [
    param('keyId').isUUID(),
    body('rawKey').notEmpty(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const key = await rotateApiKey(req.params.keyId, req.tenant.id, req.body);
      success(res, key);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:keyId',
  [param('keyId').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      await deleteApiKey(req.params.keyId, req.tenant.id);
      noContent(res);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
