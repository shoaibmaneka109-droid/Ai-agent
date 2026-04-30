const { v4: uuidv4 }        = require('uuid');
const { query }              = require('../../db/pool');
const { encrypt, decrypt }   = require('../../utils/encryption');

const ALLOWED_PROVIDERS = ['stripe', 'airwallex', 'paypal', 'braintree'];

async function listApiKeys(orgId) {
  const result = await query(
    `SELECT id, provider, label, key_hint, environment, is_active, created_at, updated_at
     FROM   api_keys
     WHERE  organization_id = $1
     ORDER  BY created_at DESC`,
    [orgId],
  );
  return result.rows;
}

async function createApiKey(orgId, { provider, label, rawKey, environment }) {
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    const err = new Error(`Unsupported provider. Allowed: ${ALLOWED_PROVIDERS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const encryptedKey = encrypt(rawKey);
  const keyHint      = maskKey(rawKey);

  const result = await query(
    `INSERT INTO api_keys (id, organization_id, provider, label, encrypted_key, key_hint, environment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, provider, label, key_hint, environment, is_active, created_at`,
    [uuidv4(), orgId, provider, label, encryptedKey, keyHint, environment || 'live'],
  );
  return result.rows[0];
}

async function rotateApiKey(keyId, orgId, { rawKey }) {
  const existing = await query(
    'SELECT id FROM api_keys WHERE id = $1 AND organization_id = $2',
    [keyId, orgId],
  );
  if (!existing.rows.length) {
    const err = new Error('API key not found');
    err.statusCode = 404;
    throw err;
  }

  const encryptedKey = encrypt(rawKey);
  const keyHint      = maskKey(rawKey);

  const result = await query(
    `UPDATE api_keys
     SET encrypted_key = $1, key_hint = $2, updated_at = NOW()
     WHERE id = $3 AND organization_id = $4
     RETURNING id, provider, label, key_hint, environment, is_active, updated_at`,
    [encryptedKey, keyHint, keyId, orgId],
  );
  return result.rows[0];
}

async function deleteApiKey(keyId, orgId) {
  const result = await query(
    'DELETE FROM api_keys WHERE id = $1 AND organization_id = $2 RETURNING id',
    [keyId, orgId],
  );
  if (!result.rows.length) {
    const err = new Error('API key not found');
    err.statusCode = 404;
    throw err;
  }
}

/**
 * Retrieve and decrypt the raw key value.
 * Only called internally (e.g., by payment service) — never exposed via REST.
 */
async function resolveRawKey(orgId, provider, environment = 'live') {
  const result = await query(
    `SELECT encrypted_key FROM api_keys
     WHERE  organization_id = $1 AND provider = $2 AND environment = $3 AND is_active = true
     LIMIT  1`,
    [orgId, provider, environment],
  );
  if (!result.rows.length) {
    const err = new Error(`No active ${provider} API key found for this organization`);
    err.statusCode = 404;
    throw err;
  }
  return decrypt(result.rows[0].encrypted_key);
}

function maskKey(key) {
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

module.exports = { listApiKeys, createApiKey, rotateApiKey, deleteApiKey, resolveRawKey };
