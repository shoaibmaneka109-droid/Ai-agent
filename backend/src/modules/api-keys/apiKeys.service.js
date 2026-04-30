const { query, withTransaction } = require('../../config/database');
const { encrypt, decrypt, maskSecret } = require('../../shared/utils/encryption');

const SUPPORTED_PROVIDERS = ['stripe', 'airwallex', 'custom'];

/**
 * Store a new provider API key for an organization.
 * The key material is AES-256-GCM encrypted before persistence.
 */
const createApiKey = async (organizationId, { provider, label, publicKey, secretKey, webhookSecret }) => {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    const err = new Error(`Unsupported provider. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const encryptedSecret = encrypt(secretKey);
  const encryptedWebhook = webhookSecret ? encrypt(webhookSecret) : null;

  const result = await query(
    `INSERT INTO organization_api_keys
       (organization_id, provider, label, public_key, encrypted_secret_key, encrypted_webhook_secret)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, provider, label, public_key, is_active, created_at`,
    [organizationId, provider, label, publicKey || null, encryptedSecret, encryptedWebhook]
  );

  return result.rows[0];
};

/**
 * List all API keys for an org. Secret material is never returned in list views.
 */
const listApiKeys = async (organizationId) => {
  const result = await query(
    `SELECT id, provider, label, public_key, is_active, created_at, updated_at
     FROM organization_api_keys
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId]
  );

  return result.rows;
};

/**
 * Retrieve a single key entry including the decrypted secret for internal use.
 * The decrypted value is NEVER sent to the client; callers must mask appropriately.
 */
const getApiKeyWithSecret = async (organizationId, keyId) => {
  const result = await query(
    `SELECT id, provider, label, public_key, encrypted_secret_key,
            encrypted_webhook_secret, is_active, created_at
     FROM organization_api_keys
     WHERE id = $1 AND organization_id = $2`,
    [keyId, organizationId]
  );

  if (result.rows.length === 0) {
    const err = new Error('API key not found');
    err.statusCode = 404;
    throw err;
  }

  const row = result.rows[0];
  const secretKey = decrypt(row.encrypted_secret_key);
  const webhookSecret = row.encrypted_webhook_secret
    ? decrypt(row.encrypted_webhook_secret)
    : null;

  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    publicKey: row.public_key,
    secretKey,
    webhookSecret,
    maskedSecretKey: maskSecret(secretKey),
    maskedWebhookSecret: webhookSecret ? maskSecret(webhookSecret) : null,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
};

/**
 * Rotate (replace) an existing key's secret material.
 */
const rotateApiKey = async (organizationId, keyId, { secretKey, webhookSecret }) => {
  return withTransaction(async (client) => {
    const existing = await client.query(
      'SELECT id FROM organization_api_keys WHERE id = $1 AND organization_id = $2',
      [keyId, organizationId]
    );
    if (existing.rows.length === 0) {
      const err = new Error('API key not found');
      err.statusCode = 404;
      throw err;
    }

    const encryptedSecret = encrypt(secretKey);
    const encryptedWebhook = webhookSecret ? encrypt(webhookSecret) : null;

    const result = await client.query(
      `UPDATE organization_api_keys
       SET encrypted_secret_key = $1,
           encrypted_webhook_secret = COALESCE($2, encrypted_webhook_secret),
           updated_at = NOW()
       WHERE id = $3 AND organization_id = $4
       RETURNING id, provider, label, public_key, is_active, updated_at`,
      [encryptedSecret, encryptedWebhook, keyId, organizationId]
    );

    return result.rows[0];
  });
};

const toggleApiKey = async (organizationId, keyId, isActive) => {
  const result = await query(
    `UPDATE organization_api_keys
     SET is_active = $1, updated_at = NOW()
     WHERE id = $2 AND organization_id = $3
     RETURNING id, provider, label, is_active, updated_at`,
    [isActive, keyId, organizationId]
  );

  if (result.rows.length === 0) {
    const err = new Error('API key not found');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
};

const deleteApiKey = async (organizationId, keyId) => {
  const result = await query(
    'DELETE FROM organization_api_keys WHERE id = $1 AND organization_id = $2 RETURNING id',
    [keyId, organizationId]
  );

  if (result.rows.length === 0) {
    const err = new Error('API key not found');
    err.statusCode = 404;
    throw err;
  }
};

module.exports = { createApiKey, listApiKeys, getApiKeyWithSecret, rotateApiKey, toggleApiKey, deleteApiKey };
