const { query } = require('../config/database');
const { encrypt, decrypt, mask } = require('../utils/encryption');

// ─── List ─────────────────────────────────────────────────────────────────────

async function listApiKeys(tenantId) {
  const { rows } = await query(
    `SELECT id, label, provider, environment, publishable_key,
            is_active, last_verified_at, last_used_at,
            last_test_at, last_test_status, last_test_message, last_test_latency_ms,
            extra_config, created_at, updated_at
     FROM api_keys
     WHERE tenant_id = $1
     ORDER BY is_active DESC, provider ASC, environment ASC, created_at DESC`,
    [tenantId],
  );
  return rows;
}

// ─── Get single key (masked) ──────────────────────────────────────────────────

async function getApiKey(tenantId, keyId) {
  const { rows } = await query(
    `SELECT id, label, provider, environment, publishable_key,
            secret_key_enc, client_id_enc, webhook_secret_enc,
            is_active, last_verified_at, last_used_at,
            last_test_at, last_test_status, last_test_message, last_test_latency_ms,
            extra_config, created_at, updated_at
     FROM api_keys WHERE id = $1 AND tenant_id = $2`,
    [keyId, tenantId],
  );
  if (!rows.length) return null;

  const key = rows[0];
  // Always mask — secret key never leaves the server in plaintext
  key.secretKeyMasked    = mask(decrypt(key.secret_key_enc));
  key.webhookSecretMasked = key.webhook_secret_enc ? mask(decrypt(key.webhook_secret_enc)) : null;
  key.clientIdMasked      = key.client_id_enc ? mask(decrypt(key.client_id_enc)) : null;

  delete key.secret_key_enc;
  delete key.webhook_secret_enc;
  delete key.client_id_enc;
  return key;
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Accepts:
 *   label, provider, environment, secretKey, publishableKey, webhookSecret
 *   clientId    (Airwallex)
 *   extraConfig (JSON — non-sensitive metadata; also 'test_url' for custom)
 */
async function createApiKey(tenantId, userId, {
  label, provider, environment,
  secretKey, publishableKey, webhookSecret,
  clientId,
  extraConfig,
}) {
  // Enforce per-tenant key limit
  const [countResult, tenantResult] = await Promise.all([
    query('SELECT COUNT(*) FROM api_keys WHERE tenant_id = $1 AND is_active = TRUE', [tenantId]),
    query('SELECT max_api_keys FROM tenants WHERE id = $1', [tenantId]),
  ]);
  const limit = tenantResult.rows[0]?.max_api_keys;
  if (limit > 0 && parseInt(countResult.rows[0].count, 10) >= limit) {
    throw Object.assign(
      new Error(`API key limit (${limit}) reached for your plan`),
      { statusCode: 402 },
    );
  }

  // Airwallex requires client_id
  if (provider === 'airwallex' && !clientId) {
    throw Object.assign(new Error('Airwallex requires a Client ID'), { statusCode: 400 });
  }

  const secretKeyEnc     = encrypt(secretKey);
  const webhookSecretEnc = webhookSecret ? encrypt(webhookSecret) : null;
  const clientIdEnc      = clientId ? encrypt(clientId) : null;
  const extraConfigJson  = extraConfig ? JSON.stringify(extraConfig) : '{}';

  const { rows } = await query(
    `INSERT INTO api_keys
       (tenant_id, created_by, label, provider, environment,
        secret_key_enc, publishable_key, webhook_secret_enc,
        client_id_enc, extra_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, label, provider, environment, publishable_key,
               is_active, extra_config, created_at`,
    [
      tenantId, userId, label, provider, environment,
      secretKeyEnc, publishableKey || null, webhookSecretEnc,
      clientIdEnc, extraConfigJson,
    ],
  );
  return rows[0];
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Allowed update fields: label, extraConfig.
 * To rotate a key, revoke and re-create (audit trail preservation).
 */
async function updateApiKey(tenantId, keyId, updates) {
  const fields = [];
  const values = [];
  let i = 1;

  if (updates.label !== undefined) {
    fields.push(`label = $${i++}`);
    values.push(updates.label);
  }
  if (updates.extraConfig !== undefined) {
    fields.push(`extra_config = $${i++}`);
    values.push(JSON.stringify(updates.extraConfig));
  }

  if (!fields.length) throw Object.assign(new Error('No updatable fields provided'), { statusCode: 400 });

  values.push(tenantId, keyId);
  const { rows } = await query(
    `UPDATE api_keys SET ${fields.join(', ')}
     WHERE tenant_id = $${i++} AND id = $${i++} AND is_active = TRUE
     RETURNING id, label, provider, environment, extra_config, updated_at`,
    values,
  );
  if (!rows.length) throw Object.assign(new Error('API key not found'), { statusCode: 404 });
  return rows[0];
}

// ─── Revoke ───────────────────────────────────────────────────────────────────

async function revokeApiKey(tenantId, keyId, userId) {
  const { rows } = await query(
    `UPDATE api_keys
     SET is_active = FALSE, revoked_at = NOW(), revoked_by = $1
     WHERE id = $2 AND tenant_id = $3 AND is_active = TRUE
     RETURNING id, label, provider, environment`,
    [userId, keyId, tenantId],
  );
  if (!rows.length) throw Object.assign(new Error('API key not found or already revoked'), { statusCode: 404 });
  return rows[0];
}

// ─── Internal: decrypted key for payment services ─────────────────────────────

/**
 * Retrieves decrypted credentials for internal processing.
 * NEVER expose to client responses.
 */
async function getDecryptedKey(tenantId, provider, environment = 'live') {
  const { rows } = await query(
    `SELECT secret_key_enc, client_id_enc, webhook_secret_enc, extra_config
     FROM api_keys
     WHERE tenant_id = $1 AND provider = $2 AND environment = $3 AND is_active = TRUE`,
    [tenantId, provider, environment],
  );
  if (!rows.length) throw Object.assign(new Error(`No active ${provider} key found`), { statusCode: 404 });

  // Track last_used_at non-blocking
  query(
    'UPDATE api_keys SET last_used_at = NOW() WHERE tenant_id = $1 AND provider = $2 AND environment = $3 AND is_active = TRUE',
    [tenantId, provider, environment],
  ).catch(() => {});

  return {
    secretKey:     decrypt(rows[0].secret_key_enc),
    clientId:      rows[0].client_id_enc ? decrypt(rows[0].client_id_enc) : null,
    webhookSecret: rows[0].webhook_secret_enc ? decrypt(rows[0].webhook_secret_enc) : null,
    extraConfig:   rows[0].extra_config || {},
  };
}

// ─── Test log fetch ───────────────────────────────────────────────────────────

async function getTestLog(tenantId, keyId, limit = 20) {
  const { rows } = await query(
    `SELECT l.id, l.status, l.http_status, l.message, l.latency_ms, l.provider_detail, l.created_at,
            u.first_name || ' ' || u.last_name AS tested_by_name
     FROM api_key_test_log l
     LEFT JOIN users u ON u.id = l.tested_by
     WHERE l.api_key_id = $1 AND l.tenant_id = $2
     ORDER BY l.created_at DESC
     LIMIT $3`,
    [keyId, tenantId, limit],
  );
  return rows;
}

module.exports = {
  listApiKeys,
  getApiKey,
  createApiKey,
  updateApiKey,
  revokeApiKey,
  getDecryptedKey,
  getTestLog,
};
