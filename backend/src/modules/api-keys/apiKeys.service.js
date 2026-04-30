const { query, withTransaction } = require('../../config/database');
const { encrypt, decrypt, maskSecret } = require('../../shared/utils/encryption');
const { runConnectionTest } = require('./connectionTest.service');

const SUPPORTED_PROVIDERS = ['stripe', 'airwallex', 'wise', 'custom'];

/**
 * Store a new provider API key for an organization.
 * All secret material is AES-256-GCM encrypted before persistence.
 * Optionally runs a connection test immediately after creation.
 */
const createApiKey = async (
  organizationId,
  { provider, label, publicKey, secretKey, webhookSecret, extraConfig = {}, testAfterCreate = false }
) => {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    const err = new Error(`Unsupported provider. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const encryptedSecret = encrypt(secretKey);
  const encryptedWebhook = webhookSecret ? encrypt(webhookSecret) : null;

  const result = await query(
    `INSERT INTO organization_api_keys
       (organization_id, provider, label, public_key,
        encrypted_secret_key, encrypted_webhook_secret, extra_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, provider, label, public_key, is_active,
               last_test_status, last_test_message, last_tested_at, last_test_latency,
               extra_config, created_at`,
    [
      organizationId, provider, label, publicKey || null,
      encryptedSecret, encryptedWebhook,
      JSON.stringify(extraConfig),
    ]
  );

  const created = result.rows[0];

  // Self-service: optionally run a connection test right after save
  if (testAfterCreate) {
    const testResult = await runAndPersistTest(organizationId, created.id, {
      provider,
      secretKey,
      publicKey: publicKey || null,
      webhookSecret: webhookSecret || null,
      extraConfig,
    });
    return { ...created, testResult };
  }

  return created;
};

/**
 * List all API keys — never returns secret material.
 */
const listApiKeys = async (organizationId) => {
  const result = await query(
    `SELECT id, provider, label, public_key, is_active,
            last_test_status, last_test_message, last_tested_at, last_test_latency,
            extra_config, created_at, updated_at
     FROM organization_api_keys
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId]
  );
  return result.rows;
};

/**
 * Retrieve a single key with decrypted credentials (internal use only).
 * Plaintext is NEVER returned to the client.
 */
const getApiKeyWithSecret = async (organizationId, keyId) => {
  const result = await query(
    `SELECT id, provider, label, public_key, encrypted_secret_key,
            encrypted_webhook_secret, extra_config, is_active,
            last_test_status, last_test_message, last_tested_at, last_test_latency,
            created_at
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
    extraConfig: row.extra_config ?? {},
    maskedSecretKey: maskSecret(secretKey),
    maskedWebhookSecret: webhookSecret ? maskSecret(webhookSecret) : null,
    isActive: row.is_active,
    lastTestStatus: row.last_test_status,
    lastTestMessage: row.last_test_message,
    lastTestedAt: row.last_tested_at,
    lastTestLatency: row.last_test_latency,
    createdAt: row.created_at,
  };
};

/**
 * Internal: execute the connection test, persist result, return it.
 */
const runAndPersistTest = async (organizationId, keyId, { provider, secretKey, publicKey, webhookSecret, extraConfig }) => {
  const testResult = await runConnectionTest(provider, {
    secretKey,
    publicKey,
    webhookSecret,
    extraConfig: extraConfig ?? {},
  });

  await query(
    `UPDATE organization_api_keys
     SET last_test_status  = $1,
         last_test_message = $2,
         last_tested_at    = NOW(),
         last_test_latency = $3,
         updated_at        = NOW()
     WHERE id = $4 AND organization_id = $5`,
    [
      testResult.ok ? 'ok' : 'failed',
      testResult.message,
      testResult.latencyMs ?? null,
      keyId,
      organizationId,
    ]
  );

  return testResult;
};

/**
 * Run a live connection test for an existing key.
 * Decrypts credentials, calls the provider, persists the result.
 */
const testApiKeyConnection = async (organizationId, keyId) => {
  const key = await getApiKeyWithSecret(organizationId, keyId);

  return runAndPersistTest(organizationId, keyId, {
    provider: key.provider,
    secretKey: key.secretKey,
    publicKey: key.publicKey,
    webhookSecret: key.webhookSecret,
    extraConfig: key.extraConfig,
  });
};

/**
 * Rotate (replace) secret material. Resets test status — requires a new test.
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
       SET encrypted_secret_key    = $1,
           encrypted_webhook_secret = COALESCE($2, encrypted_webhook_secret),
           -- Reset test status after rotation — credentials have changed
           last_test_status         = NULL,
           last_test_message        = NULL,
           last_tested_at           = NULL,
           last_test_latency        = NULL,
           updated_at               = NOW()
       WHERE id = $3 AND organization_id = $4
       RETURNING id, provider, label, public_key, is_active,
                 last_test_status, last_tested_at, updated_at`,
      [encryptedSecret, encryptedWebhook, keyId, organizationId]
    );

    return result.rows[0];
  });
};

/**
 * Update non-secret metadata (label, publicKey, extraConfig).
 */
const updateApiKeyMeta = async (organizationId, keyId, { label, publicKey, extraConfig }) => {
  const result = await query(
    `UPDATE organization_api_keys
     SET label       = COALESCE($1, label),
         public_key  = COALESCE($2, public_key),
         extra_config = COALESCE($3, extra_config),
         updated_at  = NOW()
     WHERE id = $4 AND organization_id = $5
     RETURNING id, provider, label, public_key, extra_config, is_active, updated_at`,
    [
      label || null,
      publicKey ?? null,
      extraConfig ? JSON.stringify(extraConfig) : null,
      keyId,
      organizationId,
    ]
  );

  if (result.rows.length === 0) {
    const err = new Error('API key not found');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
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

module.exports = {
  createApiKey,
  listApiKeys,
  getApiKeyWithSecret,
  testApiKeyConnection,
  rotateApiKey,
  updateApiKeyMeta,
  toggleApiKey,
  deleteApiKey,
};
