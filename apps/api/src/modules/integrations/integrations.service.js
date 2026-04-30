const crypto = require("crypto");

const { env } = require("../../config/env");
const { encryptSecret, decryptSecret } = require("../../shared/crypto/aes256");
const { pool, withTransaction } = require("../../shared/db/pool");
const { AppError } = require("../../shared/http/errors");

const DEFAULT_LABEL = "primary";

const PROVIDER_CONFIG = {
  stripe: {
    requiredForTest: ["api_key"],
    fields: [
      { secretType: "api_key", label: "Stripe secret key" },
      { secretType: "webhook_secret", label: "Webhook signing secret" },
    ],
  },
  airwallex: {
    requiredForTest: ["client_id", "api_key"],
    fields: [
      { secretType: "client_id", label: "Airwallex client ID" },
      { secretType: "api_key", label: "Airwallex API key" },
      { secretType: "webhook_secret", label: "Webhook signing secret" },
    ],
  },
  wise: {
    requiredForTest: ["api_key"],
    fields: [
      { secretType: "api_key", label: "Wise API token" },
      { secretType: "webhook_secret", label: "Webhook signing secret" },
    ],
  },
};

const SUPPORTED_SECRET_TYPES = new Set([
  "api_key",
  "client_id",
  "webhook_secret",
  "signing_secret",
]);

function normalizeProvider(provider) {
  const normalized = String(provider || "").trim().toLowerCase();

  if (!PROVIDER_CONFIG[normalized]) {
    throw new AppError(
      400,
      "provider must be one of: stripe, airwallex, wise.",
    );
  }

  return normalized;
}

function normalizeSecretType(secretType) {
  const normalized = String(secretType || "").trim().toLowerCase();

  if (!SUPPORTED_SECRET_TYPES.has(normalized)) {
    throw new AppError(
      400,
      "secretType must be one of: api_key, client_id, webhook_secret, signing_secret.",
    );
  }

  return normalized;
}

function normalizeEnvironment(environment) {
  const normalized = String(environment || "sandbox").trim().toLowerCase();
  return normalized === "live" ? "live" : "sandbox";
}

function buildSecretAad({ tenantId, provider, secretType, label }) {
  return `${tenantId}:${provider}:${secretType}:${label}`;
}

function buildSecretEnvelope({ tenantId, provider, secretType, label, value }) {
  const encrypted = encryptSecret(
    value,
    buildSecretAad({ tenantId, provider, secretType, label }),
  );

  return {
    algorithm: encrypted.algorithm,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyFingerprint: crypto
      .createHash("sha256")
      .update(String(value))
      .digest("hex")
      .slice(0, 16),
  };
}

function maskValue(value) {
  const rawValue = String(value || "");
  if (!rawValue) {
    return null;
  }

  if (rawValue.length <= 8) {
    return "********";
  }

  return `${rawValue.slice(0, 4)}...${rawValue.slice(-4)}`;
}

function decryptStoredSecret(record) {
  return decryptSecret(
    {
      algorithm: record.algorithm,
      ciphertext: Buffer.isBuffer(record.encrypted_value)
        ? record.encrypted_value.toString("base64")
        : record.encrypted_value,
      iv: Buffer.isBuffer(record.iv) ? record.iv.toString("base64") : record.iv,
      authTag: Buffer.isBuffer(record.auth_tag)
        ? record.auth_tag.toString("base64")
        : record.auth_tag,
    },
    buildSecretAad({
      tenantId: record.tenant_id,
      provider: record.provider,
      secretType: record.secret_type,
      label: record.label,
    }),
  );
}

function sanitizeCredential(record) {
  return {
    id: record.id,
    provider: record.provider,
    secretType: record.secret_type,
    label: record.label,
    environment: record.environment,
    publicValue: record.public_value,
    maskedValue: record.masked_value,
    keyFingerprint: record.key_fingerprint,
    hasValue: Boolean(record.encrypted_value),
    lastTestStatus: record.last_test_status,
    lastTestedAt: record.last_tested_at,
    lastErrorMessage: record.last_error_message,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function buildProviderSummary(provider, rows) {
  const config = PROVIDER_CONFIG[provider];
  const credentials = {};
  let lastTestStatus = "not_tested";
  let lastTestedAt = null;
  let lastErrorMessage = null;
  let environment = "sandbox";

  rows.forEach((row) => {
    credentials[row.secret_type] = sanitizeCredential(row);
    if (row.last_tested_at && (!lastTestedAt || row.last_tested_at > lastTestedAt)) {
      lastTestStatus = row.last_test_status || "not_tested";
      lastTestedAt = row.last_tested_at;
      lastErrorMessage = row.last_error_message;
    }
    if (row.environment) {
      environment = row.environment;
    }
  });

  const configuredSecretTypes = Object.keys(credentials);
  const missingSecretTypes = config.requiredForTest.filter(
    (secretType) => !configuredSecretTypes.includes(secretType),
  );

  return {
    provider,
    environment,
    fields: config.fields,
    credentials,
    testable: missingSecretTypes.length === 0,
    missingSecretTypes,
    lastTestStatus,
    lastTestedAt,
    lastErrorMessage,
  };
}

async function listIntegrationsForTenant(tenantId) {
  const result = await pool.query(
    `
      SELECT *
      FROM tenant_integration_credentials
      WHERE tenant_id = $1
      ORDER BY provider ASC, secret_type ASC, label ASC
    `,
    [tenantId],
  );

  const grouped = result.rows.reduce((accumulator, row) => {
    if (!accumulator[row.provider]) {
      accumulator[row.provider] = [];
    }

    accumulator[row.provider].push(row);
    return accumulator;
  }, {});

  return Object.keys(PROVIDER_CONFIG).map((provider) =>
    buildProviderSummary(provider, grouped[provider] || []),
  );
}

async function upsertIntegrationSecret(client, {
  tenantId,
  actorUserId,
  provider,
  secretType,
  label = DEFAULT_LABEL,
  value,
  publicValue = null,
  environment = "sandbox",
}) {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedSecretType = normalizeSecretType(secretType);
  const normalizedLabel = String(label || DEFAULT_LABEL).trim() || DEFAULT_LABEL;

  if (!value) {
    throw new AppError(
      400,
      `${normalizedProvider} ${normalizedSecretType} value is required.`,
    );
  }

  const envelope = buildSecretEnvelope({
    tenantId,
    provider: normalizedProvider,
    secretType: normalizedSecretType,
    label: normalizedLabel,
    value,
  });

  const result = await client.query(
    `
      INSERT INTO tenant_integration_credentials (
        tenant_id,
        provider,
        secret_type,
        label,
        environment,
        public_value,
        masked_value,
        algorithm,
        key_fingerprint,
        encrypted_value,
        iv,
        auth_tag,
        key_version,
        last_test_status,
        last_error_message,
        created_by_user_id,
        updated_by_user_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        decode($10, 'base64'),
        decode($11, 'base64'),
        decode($12, 'base64'),
        'v1',
        'not_tested',
        NULL,
        $13,
        $13
      )
      ON CONFLICT (tenant_id, provider, secret_type, label)
      DO UPDATE SET
        environment = EXCLUDED.environment,
        public_value = EXCLUDED.public_value,
        masked_value = EXCLUDED.masked_value,
        algorithm = EXCLUDED.algorithm,
        key_fingerprint = EXCLUDED.key_fingerprint,
        encrypted_value = EXCLUDED.encrypted_value,
        iv = EXCLUDED.iv,
        auth_tag = EXCLUDED.auth_tag,
        key_version = EXCLUDED.key_version,
        last_test_status = 'not_tested',
        last_tested_at = NULL,
        last_error_message = NULL,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = NOW()
      RETURNING *
    `,
    [
      tenantId,
      normalizedProvider,
      normalizedSecretType,
      normalizedLabel,
      normalizeEnvironment(environment),
      publicValue,
      maskValue(value),
      envelope.algorithm,
      envelope.keyFingerprint,
      envelope.ciphertext,
      envelope.iv,
      envelope.authTag,
      actorUserId,
    ],
  );

  return sanitizeCredential(result.rows[0]);
}

async function saveIntegrationSettings({
  tenantId,
  actorUserId,
  provider,
  credentials,
  environment = "sandbox",
}) {
  const normalizedProvider = normalizeProvider(provider);

  if (!Array.isArray(credentials) || credentials.length === 0) {
    throw new AppError(
      400,
      "credentials must contain at least one secret entry.",
    );
  }

  const saved = await withTransaction(async (client) => {
    const records = [];

    for (const credential of credentials) {
      records.push(
        await upsertIntegrationSecret(client, {
          tenantId,
          actorUserId,
          provider: normalizedProvider,
          secretType: credential.secretType,
          label: credential.label || DEFAULT_LABEL,
          value: credential.value,
          publicValue: credential.publicValue || null,
          environment,
        }),
      );
    }

    await client.query(
      `
        INSERT INTO audit_logs (tenant_id, actor_user_id, action, entity_type, details)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [
        tenantId,
        actorUserId,
        "integration.credentials.updated",
        "tenant_integration_credentials",
        JSON.stringify({
          provider: normalizedProvider,
          secretTypes: records.map((record) => record.secretType),
        }),
      ],
    );

    return records;
  });

  const integrations = await listIntegrationsForTenant(tenantId);
  return {
    provider: normalizedProvider,
    credentials: saved,
    integration:
      integrations.find((entry) => entry.provider === normalizedProvider) || null,
  };
}

async function getCredentialMap(tenantId, provider) {
  const normalizedProvider = normalizeProvider(provider);
  const result = await pool.query(
    `
      SELECT *
      FROM tenant_integration_credentials
      WHERE tenant_id = $1 AND provider = $2
    `,
    [tenantId, normalizedProvider],
  );

  const credentials = {};
  result.rows.forEach((row) => {
    credentials[row.secret_type] = {
      ...sanitizeCredential(row),
      secretValue: decryptStoredSecret(row),
    };
  });

  return credentials;
}

function getProviderBaseUrl(provider, environment) {
  const normalizedEnvironment = normalizeEnvironment(environment);

  if (provider === "airwallex") {
    return normalizedEnvironment === "live"
      ? "https://api.airwallex.com"
      : "https://api-demo.airwallex.com";
  }

  if (provider === "wise") {
    return normalizedEnvironment === "live"
      ? "https://api.transferwise.com"
      : "https://api.sandbox.transferwise.tech";
  }

  return "https://api.stripe.com";
}

async function performProviderConnectionTest(provider, credentials, environment) {
  const signal = AbortSignal.timeout(env.connectionTestTimeoutMs);

  if (provider === "stripe") {
    const response = await fetch(`${getProviderBaseUrl(provider, environment)}/v1/balance`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credentials.api_key.secretValue}`,
      },
      signal,
    });

    return {
      ok: response.ok,
      statusCode: response.status,
      responseBody: (await response.text()).slice(0, 1000),
    };
  }

  if (provider === "airwallex") {
    const response = await fetch(
      `${getProviderBaseUrl(provider, environment)}/api/v1/authentication/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": credentials.client_id.secretValue,
          "x-api-key": credentials.api_key.secretValue,
        },
        body: JSON.stringify({}),
        signal,
      },
    );

    return {
      ok: response.ok,
      statusCode: response.status,
      responseBody: (await response.text()).slice(0, 1000),
    };
  }

  const response = await fetch(
    `${getProviderBaseUrl(provider, environment)}/v1/profiles`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credentials.api_key.secretValue}`,
      },
      signal,
    },
  );

  return {
    ok: response.ok,
    statusCode: response.status,
    responseBody: (await response.text()).slice(0, 1000),
  };
}

async function updateConnectionTestResult({
  tenantId,
  actorUserId,
  provider,
  status,
  statusCode,
  message,
}) {
  await pool.query(
    `
      UPDATE tenant_integration_credentials
      SET
        last_test_status = $3,
        last_tested_at = NOW(),
        last_error_message = $4,
        updated_by_user_id = $5,
        updated_at = NOW()
      WHERE tenant_id = $1 AND provider = $2
    `,
    [
      tenantId,
      provider,
      status,
      status === "connected" ? null : `${statusCode || "ERR"}: ${message}`,
      actorUserId,
    ],
  );
}

async function testProviderConnection({ tenantId, actorUserId, provider }) {
  const normalizedProvider = normalizeProvider(provider);
  const credentials = await getCredentialMap(tenantId, normalizedProvider);
  const missing = PROVIDER_CONFIG[normalizedProvider].requiredForTest.filter(
    (secretType) => !credentials[secretType]?.secretValue,
  );

  if (missing.length > 0) {
    throw new AppError(
      400,
      `Missing saved credentials for connection test: ${missing.join(", ")}.`,
    );
  }

  const environment =
    credentials[PROVIDER_CONFIG[normalizedProvider].requiredForTest[0]].environment ||
    "sandbox";
  const result = await performProviderConnectionTest(
    normalizedProvider,
    credentials,
    environment,
  );

  await updateConnectionTestResult({
    tenantId,
    actorUserId,
    provider: normalizedProvider,
    status: result.ok ? "connected" : "failed",
    statusCode: result.statusCode,
    message: result.responseBody,
  });

  return {
    provider: normalizedProvider,
    environment,
    success: result.ok,
    statusCode: result.statusCode,
    message: result.ok
      ? `${normalizedProvider} integration test succeeded.`
      : `${normalizedProvider} integration test failed.`,
    responsePreview: result.responseBody,
  };
}

module.exports = {
  PROVIDER_CONFIG,
  listIntegrationsForTenant,
  saveIntegrationSettings,
  testProviderConnection,
};
