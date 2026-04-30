const { body } = require('express-validator');
const apiKeyService = require('../services/apiKey.service');
const connectionTestService = require('../services/connectionTest.service');
const { success, created, notFound } = require('../utils/apiResponse');
const validate = require('../middleware/validate.middleware');

// ─── Validators ───────────────────────────────────────────────────────────────

const createValidators = [
  body('label').trim().notEmpty().withMessage('Label is required'),
  body('provider')
    .isIn(['stripe', 'airwallex', 'wise', 'custom'])
    .withMessage('Provider must be stripe, airwallex, wise, or custom'),
  body('environment')
    .isIn(['live', 'sandbox'])
    .withMessage('Environment must be live or sandbox'),
  body('secretKey').notEmpty().withMessage('Secret key (or API token) is required'),
  // Airwallex-specific
  body('clientId')
    .if(body('provider').equals('airwallex'))
    .notEmpty()
    .withMessage('Client ID is required for Airwallex'),
];

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function list(req, res, next) {
  try {
    const keys = await apiKeyService.listApiKeys(req.tenant.id);
    return success(res, keys);
  } catch (err) {
    next(err);
  }
}

async function show(req, res, next) {
  try {
    const key = await apiKeyService.getApiKey(req.tenant.id, req.params.keyId);
    if (!key) return notFound(res, 'API key not found');
    return success(res, key);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const key = await apiKeyService.createApiKey(req.tenant.id, req.user.id, req.body);
    return created(res, key, 'API key encrypted and stored securely');
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const key = await apiKeyService.updateApiKey(req.tenant.id, req.params.keyId, req.body);
    return success(res, key, 'API key updated');
  } catch (err) {
    next(err);
  }
}

async function revoke(req, res, next) {
  try {
    const key = await apiKeyService.revokeApiKey(req.tenant.id, req.params.keyId, req.user.id);
    return success(res, key, 'API key revoked');
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/api-keys/:keyId/test
 *
 * Self-service connection test: decrypts the stored credentials server-side,
 * pings the provider's read-only API endpoint, and returns pass/fail with
 * details. Results are persisted to api_key_test_log.
 *
 * No credentials are returned to the client — only test outcome metadata.
 */
async function testConnection(req, res, next) {
  try {
    const result = await connectionTestService.runConnectionTest(
      req.tenant.id,
      req.params.keyId,
      req.user.id,
    );

    const statusCode = result.success ? 200 : 422;
    return res.status(statusCode).json({
      success: result.success,
      message: result.message,
      data: {
        status: result.status,
        latencyMs: result.latencyMs,
        providerDetail: result.providerDetail,
        logId: result.logId,
        testedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/api-keys/:keyId/test-log
 * Returns the last 20 test results for a given key.
 */
async function getTestLog(req, res, next) {
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const log = await apiKeyService.getTestLog(req.tenant.id, req.params.keyId, limit);
    return success(res, log);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  show,
  create,
  update,
  revoke,
  testConnection,
  getTestLog,
  createValidators,
};
