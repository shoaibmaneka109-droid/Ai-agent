const { Router } = require('express');
const { body, param } = require('express-validator');
const apiKeysService = require('./apiKeys.service');
const authenticate = require('../../shared/middleware/authenticate');
const { authorize, tenantGuard } = require('../../shared/middleware/authorize');
const validate = require('../../shared/middleware/validate');
const { sendSuccess, sendCreated } = require('../../shared/utils/apiResponse');

const router = Router({ mergeParams: true });
router.use(authenticate, tenantGuard);

// GET /organizations/:organizationId/api-keys
router.get('/', async (req, res, next) => {
  try {
    const keys = await apiKeysService.listApiKeys(req.user.organizationId);
    return sendSuccess(res, { keys });
  } catch (err) {
    next(err);
  }
});

// POST /organizations/:organizationId/api-keys
router.post(
  '/',
  authorize(['owner', 'admin']),
  validate([
    body('provider').isIn(['stripe', 'airwallex', 'custom']),
    body('label').trim().notEmpty().isLength({ max: 100 }),
    body('secretKey').notEmpty().withMessage('secretKey is required'),
    body('publicKey').optional().isString(),
    body('webhookSecret').optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const key = await apiKeysService.createApiKey(req.user.organizationId, req.body);
      return sendCreated(res, { key });
    } catch (err) {
      next(err);
    }
  }
);

// GET /organizations/:organizationId/api-keys/:keyId — returns masked view only
router.get(
  '/:keyId',
  validate([param('keyId').isUUID()]),
  async (req, res, next) => {
    try {
      const key = await apiKeysService.getApiKeyWithSecret(
        req.user.organizationId,
        req.params.keyId
      );
      // Strip plaintext secrets — only return masked versions to the client
      const { secretKey, webhookSecret, ...safeKey } = key;
      return sendSuccess(res, { key: safeKey });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /organizations/:organizationId/api-keys/:keyId/rotate
router.put(
  '/:keyId/rotate',
  authorize(['owner', 'admin']),
  validate([
    param('keyId').isUUID(),
    body('secretKey').notEmpty(),
    body('webhookSecret').optional().isString(),
  ]),
  async (req, res, next) => {
    try {
      const key = await apiKeysService.rotateApiKey(
        req.user.organizationId,
        req.params.keyId,
        req.body
      );
      return sendSuccess(res, { key });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /organizations/:organizationId/api-keys/:keyId/toggle
router.patch(
  '/:keyId/toggle',
  authorize(['owner', 'admin']),
  validate([
    param('keyId').isUUID(),
    body('isActive').isBoolean(),
  ]),
  async (req, res, next) => {
    try {
      const key = await apiKeysService.toggleApiKey(
        req.user.organizationId,
        req.params.keyId,
        req.body.isActive
      );
      return sendSuccess(res, { key });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /organizations/:organizationId/api-keys/:keyId
router.delete(
  '/:keyId',
  authorize(['owner']),
  validate([param('keyId').isUUID()]),
  async (req, res, next) => {
    try {
      await apiKeysService.deleteApiKey(req.user.organizationId, req.params.keyId);
      return sendSuccess(res, { message: 'API key deleted' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
