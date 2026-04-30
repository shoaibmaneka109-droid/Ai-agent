/**
 * API Keys / Integrations Routes
 *
 * GET    /api/v1/orgs/:orgSlug/api-keys               — list keys (no raw values)
 * GET    /api/v1/orgs/:orgSlug/api-keys/providers      — provider catalog (self-service)
 * POST   /api/v1/orgs/:orgSlug/api-keys               — create key + optional webhook secret
 * PUT    /api/v1/orgs/:orgSlug/api-keys/:keyId         — update label / rotate key / update webhook
 * DELETE /api/v1/orgs/:orgSlug/api-keys/:keyId         — delete
 * POST   /api/v1/orgs/:orgSlug/api-keys/:keyId/test   — connection test (live API ping)
 */
const { Router } = require('express');
const { body, param } = require('express-validator');
const authenticate      = require('../../middleware/authenticate');
const authorize         = require('../../middleware/authorize');
const checkSubscription = require('../../middleware/checkSubscription');
const validate          = require('../../middleware/validate');
const {
  listApiKeys, listProviders,
  createApiKey, updateApiKey, deleteApiKey, testConnection,
} = require('./apiKeys.service');
const { success, created, noContent } = require('../../utils/apiResponse');

const router = Router({ mergeParams: true });

// All routes require auth + admin role.
// The /providers catalog is exempt from hibernation check (read-only reference data).
router.use(authenticate, authorize('owner', 'admin'));

// ── Provider catalog (no hibernation check needed) ────────────────────────────
router.get('/providers', async (req, res, next) => {
  try {
    const providers = await listProviders();
    success(res, providers);
  } catch (err) {
    next(err);
  }
});

// ── All remaining routes require active subscription ──────────────────────────
router.use(checkSubscription.requireActive);

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const keys = await listApiKeys(req.tenant.id);
    success(res, keys);
  } catch (err) {
    next(err);
  }
});

// ── Create ────────────────────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('provider').notEmpty().toLowerCase().trim(),
    body('label').trim().notEmpty().withMessage('Label is required'),
    body('keyType')
      .optional()
      .isIn(['secret_key', 'publishable_key', 'access_token', 'api_token'])
      .default('secret_key'),
    body('rawKey').notEmpty().withMessage('rawKey (API key value) is required'),
    body('rawWebhookSecret').optional().isString(),
    body('environment').optional().isIn(['live', 'sandbox']).default('live'),
    body('clientId').optional().isString().trim(),
    body('extraConfig').optional().isObject(),
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

// ── Update (rotate / edit) ────────────────────────────────────────────────────
router.put(
  '/:keyId',
  [
    param('keyId').isUUID(),
    body('rawKey').optional().isString().notEmpty(),
    body('rawWebhookSecret').optional(),         // null = remove, string = update
    body('label').optional().trim().notEmpty(),
    body('clientId').optional().isString().trim(),
    body('extraConfig').optional().isObject(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const key = await updateApiKey(req.params.keyId, req.tenant.id, req.body);
      success(res, key);
    } catch (err) {
      next(err);
    }
  },
);

// ── Delete ────────────────────────────────────────────────────────────────────
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

// ── Connection test (live API ping) ──────────────────────────────────────────
router.post(
  '/:keyId/test',
  [param('keyId').isUUID()],
  validate,
  async (req, res, next) => {
    try {
      const result = await testConnection(req.params.keyId, req.tenant.id);
      // Always 200 — success/failure is in the payload
      success(res, result);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
