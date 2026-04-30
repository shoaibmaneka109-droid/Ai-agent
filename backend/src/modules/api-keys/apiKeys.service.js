/**
 * API Keys Service (extended)
 *
 * Self-service integration management:
 *   - Admin inputs their own Stripe / Airwallex / Wise / PayPal keys
 *   - Both the API key AND the webhook secret are AES-256-GCM encrypted at rest
 *   - Connection test pings the provider's API with the decrypted key
 *   - Test result (status + message) is persisted on the key row
 */
const { v4: uuidv4 }             = require('uuid');
const { query, withTransaction } = require('../../db/pool');
const { encrypt, decrypt }       = require('../../utils/encryption');
const { runConnectionTest }      = require('./providers');

const ALLOWED_PROVIDERS = ['stripe', 'airwallex', 'wise', 'paypal', 'braintree'];
const ALLOWED_KEY_TYPES = ['secret_key', 'publishable_key', 'webhook_secret', 'access_token', 'api_token'];

// ── List ─────────────────────────────────────────────────────────────────────

async function listApiKeys(orgId) {
  const result = await query(
    `SELECT id, provider, label, key_type, key_hint,
            webhook_secret_hint, environment, is_active,
            connection_test_status, connection_test_message, connection_tested_at,
            extra_config, created_at, updated_at
     FROM   api_keys
     WHERE  organization_id = $1
     ORDER  BY provider, environment, key_type, created_at DESC`,
    [orgId],
  );
  return result.rows;
}

// ── Provider catalog (from DB, populated by migration) ───────────────────────

async function listProviders() {
  const result = await query(
    `SELECT slug, display_name, logo_url, website_url, docs_url,
            supported_key_types, test_endpoint, test_method, auth_scheme, sort_order
     FROM   provider_catalog
     WHERE  is_active = true
     ORDER  BY sort_order, display_name`,
  );
  return result.rows;
}

// ── Create ────────────────────────────────────────────────────────────────────

/**
 * Create a new API key for an org.
 * Both rawKey and rawWebhookSecret (optional) are AES-256-GCM encrypted.
 * clientId and other extras go into extra_config as JSON.
 */
async function createApiKey(orgId, {
  provider,
  label,
  keyType = 'secret_key',
  rawKey,
  rawWebhookSecret,
  environment = 'live',
  clientId,
  extraConfig = {},
}) {
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    const err = new Error(`Unsupported provider. Allowed: ${ALLOWED_PROVIDERS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  if (!ALLOWED_KEY_TYPES.includes(keyType)) {
    const err = new Error(`Invalid keyType. Allowed: ${ALLOWED_KEY_TYPES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const encryptedKey = encrypt(rawKey);
  const keyHint      = maskKey(rawKey);

  let encryptedWebhookSecret = null;
  let webhookHint            = null;
  if (rawWebhookSecret) {
    encryptedWebhookSecret = encrypt(rawWebhookSecret);
    webhookHint            = maskKey(rawWebhookSecret);
  }

  // clientId is stored (non-sensitive) in extra_config
  const config = { ...extraConfig };
  if (clientId) config.client_id = clientId;

  const result = await query(
    `INSERT INTO api_keys
       (id, organization_id, provider, label, key_type,
        encrypted_key, key_hint,
        encrypted_webhook_secret, webhook_secret_hint,
        environment, extra_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, provider, label, key_type, key_hint,
               webhook_secret_hint, environment, is_active,
               connection_test_status, connection_test_message,
               connection_tested_at, extra_config, created_at`,
    [
      uuidv4(), orgId, provider, label, keyType,
      encryptedKey, keyHint,
      encryptedWebhookSecret, webhookHint,
      environment,
      JSON.stringify(config),
    ],
  );
  return result.rows[0];
}

// ── Update (rotate key + optional new webhook secret) ────────────────────────

async function updateApiKey(keyId, orgId, {
  rawKey,
  rawWebhookSecret,
  label,
  clientId,
  extraConfig,
}) {
  const existing = await query(
    'SELECT id, extra_config FROM api_keys WHERE id = $1 AND organization_id = $2',
    [keyId, orgId],
  );
  if (!existing.rows.length) {
    const err = new Error('API key not found');
    err.statusCode = 404;
    throw err;
  }

  const fields = [];
  const values = [];
  let   idx    = 1;

  if (rawKey !== undefined) {
    fields.push(`encrypted_key = $${idx++}`, `key_hint = $${idx++}`);
    values.push(encrypt(rawKey), maskKey(rawKey));
    // Rotating the key clears any previous test result
    fields.push(`connection_test_status = NULL`, `connection_test_message = NULL`, `connection_tested_at = NULL`);
  }

  if (rawWebhookSecret !== undefined) {
    if (rawWebhookSecret === null || rawWebhookSecret === '') {
      fields.push(`encrypted_webhook_secret = NULL`, `webhook_secret_hint = NULL`);
    } else {
      fields.push(`encrypted_webhook_secret = $${idx++}`, `webhook_secret_hint = $${idx++}`);
      values.push(encrypt(rawWebhookSecret), maskKey(rawWebhookSecret));
    }
  }

  if (label !== undefined) {
    fields.push(`label = $${idx++}`);
    values.push(label);
  }

  if (clientId !== undefined || extraConfig !== undefined) {
    const current = existing.rows[0].extra_config || {};
    const merged  = { ...current, ...(extraConfig || {}) };
    if (clientId !== undefined) merged.client_id = clientId;
    fields.push(`extra_config = $${idx++}`);
    values.push(JSON.stringify(merged));
  }

  if (!fields.length) {
    const err = new Error('No fields to update');
    err.statusCode = 400;
    throw err;
  }

  fields.push(`updated_at = NOW()`);
  values.push(keyId, orgId);

  const result = await query(
    `UPDATE api_keys SET ${fields.join(', ')}
     WHERE id = $${idx} AND organization_id = $${idx + 1}
     RETURNING id, provider, label, key_type, key_hint,
               webhook_secret_hint, environment, is_active,
               connection_test_status, connection_test_message,
               connection_tested_at, extra_config, updated_at`,
    values,
  );
  return result.rows[0];
}

// ── Delete ────────────────────────────────────────────────────────────────────

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

// ── Connection Test ───────────────────────────────────────────────────────────

/**
 * Decrypt the key, call the provider's test adapter, and persist the result.
 * Returns the TestResult so the route can send it directly to the client.
 */
async function testConnection(keyId, orgId) {
  const result = await query(
    `SELECT id, provider, encrypted_key, environment, extra_config
     FROM   api_keys
     WHERE  id = $1 AND organization_id = $2`,
    [keyId, orgId],
  );
  if (!result.rows.length) {
    const err = new Error('API key not found');
    err.statusCode = 404;
    throw err;
  }

  const row       = result.rows[0];
  const secretKey = decrypt(row.encrypted_key);
  const extra     = row.extra_config || {};

  const testResult = await runConnectionTest(row.provider, {
    secretKey,
    clientId:    extra.client_id,
    environment: row.environment,
  });

  // Persist test outcome
  await query(
    `UPDATE api_keys
     SET connection_test_status  = $1,
         connection_test_message = $2,
         connection_tested_at    = NOW(),
         updated_at              = NOW()
     WHERE id = $3`,
    [
      testResult.success ? 'success' : 'failed',
      testResult.message,
      keyId,
    ],
  );

  return testResult;
}

// ── Resolve raw key (used internally by payments service) ─────────────────────

async function resolveRawKey(orgId, provider, environment = 'live') {
  const result = await query(
    `SELECT encrypted_key FROM api_keys
     WHERE  organization_id = $1 AND provider = $2 AND environment = $3
            AND is_active = true AND key_type = 'secret_key'
     LIMIT  1`,
    [orgId, provider, environment],
  );
  if (!result.rows.length) {
    const err = new Error(`No active ${provider} secret key found for this organization`);
    err.statusCode = 404;
    throw err;
  }
  return decrypt(result.rows[0].encrypted_key);
}

/**
 * Resolve the webhook secret for a provider/environment.
 * Used by the webhook signature verification middleware.
 */
async function resolveWebhookSecret(orgId, provider, environment = 'live') {
  const result = await query(
    `SELECT encrypted_webhook_secret FROM api_keys
     WHERE  organization_id = $1 AND provider = $2 AND environment = $3
            AND is_active = true AND encrypted_webhook_secret IS NOT NULL
     LIMIT  1`,
    [orgId, provider, environment],
  );
  if (!result.rows.length) return null;
  return decrypt(result.rows[0].encrypted_webhook_secret);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskKey(key) {
  if (!key || key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

module.exports = {
  listApiKeys,
  listProviders,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  testConnection,
  resolveRawKey,
  resolveWebhookSecret,
};
