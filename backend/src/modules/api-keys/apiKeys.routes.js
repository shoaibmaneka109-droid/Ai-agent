const { Router } = require('express');
const { body, param } = require('express-validator');
const apiKeysService = require('./apiKeys.service');
const authenticate = require('../../shared/middleware/authenticate');
const { authorize, tenantGuard } = require('../../shared/middleware/authorize');
const { requireFullAccess } = require('../../shared/middleware/featureLock');
const validate = require('../../shared/middleware/validate');
const { sendSuccess, sendCreated } = require('../../shared/utils/apiResponse');

const ALL_PROVIDERS = ['stripe', 'airwallex', 'wise', 'custom'];

const router = Router({ mergeParams: true });
router.use(authenticate, tenantGuard);

// ─── List ─────────────────────────────────────────────────────────────────────
// GET /organizations/:organizationId/api-keys
router.get('/', async (req, res, next) => {
  try {
    const keys = await apiKeysService.listApiKeys(req.user.organizationId);
    return sendSuccess(res, { keys });
  } catch (err) {
    next(err);
  }
});

// ─── Create ───────────────────────────────────────────────────────────────────
// POST /organizations/:organizationId/api-keys
// Self-service: any admin/owner can add their own credentials.
// Supports optional immediate connection test via testAfterCreate flag.
router.post(
  '/',
  requireFullAccess,
  authorize(['owner', 'admin']),
  validate([
    body('provider').isIn(ALL_PROVIDERS).withMessage(`provider must be one of: ${ALL_PROVIDERS.join(', ')}`),
    body('label').trim().notEmpty().isLength({ max: 100 }),
    body('secretKey').notEmpty().withMessage('secretKey is required'),
    body('publicKey').optional().isString(),
    body('webhookSecret').optional().isString(),
    body('extraConfig').optional().isObject(),
    body('testAfterCreate').optional().isBoolean(),
  ]),
  async (req, res, next) => {
    try {
      const result = await apiKeysService.createApiKey(req.user.organizationId, req.body);
      return sendCreated(res, { key: result });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Get one (masked) ─────────────────────────────────────────────────────────
// GET /organizations/:organizationId/api-keys/:keyId
router.get(
  '/:keyId',
  validate([param('keyId').isUUID()]),
  async (req, res, next) => {
    try {
      const key = await apiKeysService.getApiKeyWithSecret(
        req.user.organizationId,
        req.params.keyId
      );
      // Strip plaintext — only masked values + metadata go to client
      const { secretKey, webhookSecret, ...safeKey } = key;
      return sendSuccess(res, { key: safeKey });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Update metadata ──────────────────────────────────────────────────────────
// PATCH /organizations/:organizationId/api-keys/:keyId/meta
// Updates label, publicKey, extraConfig — does NOT touch encrypted secrets.
router.patch(
  '/:keyId/meta',
  authorize(['owner', 'admin']),
  validate([
    param('keyId').isUUID(),
    body('label').optional().trim().notEmpty().isLength({ max: 100 }),
    body('publicKey').optional().isString(),
    body('extraConfig').optional().isObject(),
  ]),
  async (req, res, next) => {
    try {
      const key = await apiKeysService.updateApiKeyMeta(
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

// ─── Connection Test ──────────────────────────────────────────────────────────
// POST /organizations/:organizationId/api-keys/:keyId/test
// Decrypts the stored credentials and pings the provider's API.
// Result is persisted to the key record and returned to the client.
router.post(
  '/:keyId/test',
  authorize(['owner', 'admin']),
  validate([param('keyId').isUUID()]),
  async (req, res, next) => {
    try {
      const testResult = await apiKeysService.testApiKeyConnection(
        req.user.organizationId,
        req.params.keyId
      );
      const statusCode = testResult.ok ? 200 : 422;
      return res.status(statusCode).json({
        success: testResult.ok,
        data: { testResult },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Rotate secrets ───────────────────────────────────────────────────────────
// PUT /organizations/:organizationId/api-keys/:keyId/rotate
router.put(
  '/:keyId/rotate',
  requireFullAccess,
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

// ─── Toggle active state ──────────────────────────────────────────────────────
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

// ─── Delete ───────────────────────────────────────────────────────────────────
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
