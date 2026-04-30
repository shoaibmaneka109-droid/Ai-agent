const { query } = require('../config/database');
const { encrypt, decrypt, mask } = require('../utils/encryption');

async function listApiKeys(tenantId) {
  const { rows } = await query(
    `SELECT id, label, provider, environment, publishable_key,
            is_active, last_verified_at, last_used_at, created_at
     FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId],
  );
  return rows;
}

async function getApiKey(tenantId, keyId, includeSecret = false) {
  const { rows } = await query(
    `SELECT id, label, provider, environment, publishable_key,
            secret_key_enc, webhook_secret_enc,
            is_active, last_verified_at, last_used_at, created_at
     FROM api_keys WHERE id = $1 AND tenant_id = $2`,
    [keyId, tenantId],
  );
  if (!rows.length) return null;

  const key = rows[0];
  if (includeSecret) {
    key.secretKey = decrypt(key.secret_key_enc);
    key.webhookSecret = key.webhook_secret_enc ? decrypt(key.webhook_secret_enc) : null;
  } else {
    key.secretKeyMasked = mask(decrypt(key.secret_key_enc));
    key.webhookSecretMasked = key.webhook_secret_enc ? mask(decrypt(key.webhook_secret_enc)) : null;
  }
  delete key.secret_key_enc;
  delete key.webhook_secret_enc;
  return key;
}

async function createApiKey(tenantId, userId, { label, provider, environment, secretKey, publishableKey, webhookSecret }) {
  // Enforce per-tenant key limit
  const countResult = await query(
    'SELECT COUNT(*) FROM api_keys WHERE tenant_id = $1 AND is_active = TRUE',
    [tenantId],
  );
  const maxKeys = await query('SELECT max_api_keys FROM tenants WHERE id = $1', [tenantId]);
  const limit = maxKeys.rows[0]?.max_api_keys;
  if (limit > 0 && parseInt(countResult.rows[0].count, 10) >= limit) {
    throw Object.assign(
      new Error(`API key limit (${limit}) reached for your plan`),
      { statusCode: 402 },
    );
  }

  const secretKeyEnc = encrypt(secretKey);
  const webhookSecretEnc = webhookSecret ? encrypt(webhookSecret) : null;

  const { rows } = await query(
    `INSERT INTO api_keys
       (tenant_id, created_by, label, provider, environment, secret_key_enc, publishable_key, webhook_secret_enc)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, label, provider, environment, publishable_key, is_active, created_at`,
    [tenantId, userId, label, provider, environment, secretKeyEnc, publishableKey || null, webhookSecretEnc],
  );
  return rows[0];
}

async function revokeApiKey(tenantId, keyId, userId) {
  const { rows } = await query(
    `UPDATE api_keys SET is_active = FALSE, revoked_at = NOW(), revoked_by = $1
     WHERE id = $2 AND tenant_id = $3 AND is_active = TRUE
     RETURNING id, label`,
    [userId, keyId, tenantId],
  );
  if (!rows.length) throw Object.assign(new Error('API key not found or already revoked'), { statusCode: 404 });
  return rows[0];
}

async function updateApiKey(tenantId, keyId, updates) {
  const { label } = updates;
  if (!label) throw Object.assign(new Error('Only label can be updated'), { statusCode: 400 });

  const { rows } = await query(
    'UPDATE api_keys SET label = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, label',
    [label, keyId, tenantId],
  );
  if (!rows.length) throw Object.assign(new Error('API key not found'), { statusCode: 404 });
  return rows[0];
}

/**
 * Retrieves the decrypted secret key for internal use by payment services.
 * Never expose this output to the client.
 */
async function getDecryptedKey(tenantId, provider, environment = 'live') {
  const { rows } = await query(
    `SELECT secret_key_enc, webhook_secret_enc
     FROM api_keys WHERE tenant_id = $1 AND provider = $2 AND environment = $3 AND is_active = TRUE`,
    [tenantId, provider, environment],
  );
  if (!rows.length) throw Object.assign(new Error(`No active ${provider} key found`), { statusCode: 404 });

  await query(
    'UPDATE api_keys SET last_used_at = NOW() WHERE tenant_id = $1 AND provider = $2 AND environment = $3 AND is_active = TRUE',
    [tenantId, provider, environment],
  );

  return {
    secretKey: decrypt(rows[0].secret_key_enc),
    webhookSecret: rows[0].webhook_secret_enc ? decrypt(rows[0].webhook_secret_enc) : null,
  };
}

module.exports = { listApiKeys, getApiKey, createApiKey, revokeApiKey, updateApiKey, getDecryptedKey };
