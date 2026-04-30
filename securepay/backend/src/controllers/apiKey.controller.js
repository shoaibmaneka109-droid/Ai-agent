const { body, param } = require('express-validator');
const apiKeyService = require('../services/apiKey.service');
const { success, created, notFound } = require('../utils/apiResponse');
const validate = require('../middleware/validate.middleware');

const createValidators = [
  body('label').trim().notEmpty().withMessage('Label is required'),
  body('provider').isIn(['stripe', 'airwallex', 'custom']).withMessage('Invalid provider'),
  body('environment').isIn(['live', 'sandbox']).withMessage('Environment must be live or sandbox'),
  body('secretKey').notEmpty().withMessage('Secret key is required'),
];

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
    const key = await apiKeyService.getApiKey(req.tenant.id, req.params.keyId, false);
    if (!key) return notFound(res, 'API key not found');
    return success(res, key);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const key = await apiKeyService.createApiKey(req.tenant.id, req.user.id, req.body);
    return created(res, key, 'API key stored securely');
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

module.exports = { list, show, create, update, revoke, createValidators };
