/**
 * Provider Connections Controller
 *
 * Self-service: any Admin/Owner can manage their org's provider integrations
 * without platform-level intervention.
 *
 * Secret handling rule: encrypted values are written to DB and never returned
 * in API responses. Only the key_prefix (first 12 chars) is ever sent to
 * the client, so the UI can show "sk_live_Abc123..." without revealing the key.
 */

const { query, transaction } = require('../../config/database');
const { encrypt, decrypt } = require('../../services/encryption');
const { getAdapter, PROVIDER_META } = require('../../services/providers');
const logger = require('../../services/logger');

// Safe fields returned to the client — NO encrypted columns
const SAFE_FIELDS = `
  id, organization_id, provider, environment, display_name,
  key_prefix, webhook_endpoint_url,
  status, last_test_at, last_test_success, last_test_message, last_test_latency_ms,
  is_active, last_rotated_at, created_at, updated_at
`;

// ── Helpers ────────────────────────────────────────────────────────────────

const encryptIfPresent = (val) => (val ? encrypt(val) : null);

const safePrefix = (val) => (val ? `${val.slice(0, 12)}…` : null);

// ── List all connections for the org ──────────────────────────────────────

const list = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${SAFE_FIELDS} FROM provider_connections
       WHERE organization_id = $1
       ORDER BY provider, environment`,
      [req.orgId]
    );
    // Augment with static provider metadata so the frontend has logos/labels
    const enriched = rows.map((r) => ({
      ...r,
      meta: PROVIDER_META[r.provider] || null,
    }));
    res.json(enriched);
  } catch (err) {
    next(err);
  }
};

// ── Get a single connection ────────────────────────────────────────────────

const getOne = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${SAFE_FIELDS} FROM provider_connections
       WHERE id = $1 AND organization_id = $2`,
      [req.params.id, req.orgId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Connection not found' });
    res.json({ ...rows[0], meta: PROVIDER_META[rows[0].provider] || null });
  } catch (err) {
    next(err);
  }
};

// ── Get provider metadata (no auth needed but we keep it behind auth for cleanliness) ──

const getProviderMeta = async (req, res) => {
  res.json(PROVIDER_META);
};

// ── Create / upsert a connection ──────────────────────────────────────────

/**
 * POST /provider-connections
 * Creates a new provider connection (or updates the existing one for the
 * same org+provider+environment combination via ON CONFLICT DO UPDATE).
 *
 * This is intentionally idempotent so the UI can call it both for "add"
 * and "update" scenarios with the same shape — true self-service UX.
 */
const upsert = async (req, res, next) => {
  const {
    provider,
    environment = 'test',
    displayName,
    secretKey,
    publishableKey,
    webhookSecret,
    extraCredential,
    webhookEndpointUrl,
  } = req.body;

  try {
    const encSecret      = encrypt(secretKey);
    const encPublishable = encryptIfPresent(publishableKey);
    const encWebhook     = encryptIfPresent(webhookSecret);
    const encExtra       = encryptIfPresent(extraCredential);
    const prefix         = safePrefix(secretKey);

    const { rows } = await query(
      `INSERT INTO provider_connections
         (organization_id, provider, environment, display_name,
          encrypted_secret_key, encrypted_publishable_key,
          encrypted_webhook_secret, encrypted_extra_credential,
          key_prefix, webhook_endpoint_url, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'configured', $11, $11)
       ON CONFLICT (organization_id, provider, environment)
       DO UPDATE SET
         display_name               = EXCLUDED.display_name,
         encrypted_secret_key       = EXCLUDED.encrypted_secret_key,
         encrypted_publishable_key  = COALESCE(EXCLUDED.encrypted_publishable_key,  provider_connections.encrypted_publishable_key),
         encrypted_webhook_secret   = COALESCE(EXCLUDED.encrypted_webhook_secret,   provider_connections.encrypted_webhook_secret),
         encrypted_extra_credential = COALESCE(EXCLUDED.encrypted_extra_credential, provider_connections.encrypted_extra_credential),
         key_prefix                 = EXCLUDED.key_prefix,
         webhook_endpoint_url       = COALESCE(EXCLUDED.webhook_endpoint_url, provider_connections.webhook_endpoint_url),
         status                     = 'configured',
         updated_by                 = EXCLUDED.updated_by,
         last_rotated_at            = CASE
           WHEN provider_connections.encrypted_secret_key != EXCLUDED.encrypted_secret_key
           THEN NOW() ELSE provider_connections.last_rotated_at END
       RETURNING ${SAFE_FIELDS}`,
      [req.orgId, provider, environment, displayName,
       encSecret, encPublishable, encWebhook, encExtra,
       prefix, webhookEndpointUrl, req.user.id]
    );

    logger.info('Provider connection upserted', {
      orgId: req.orgId, provider, environment, userId: req.user.id,
    });

    res.status(201).json({ ...rows[0], meta: PROVIDER_META[provider] || null });
  } catch (err) {
    next(err);
  }
};

// ── Update webhook endpoint URL only (non-secret) ────────────────────────

const updateWebhookUrl = async (req, res, next) => {
  const { webhookEndpointUrl } = req.body;
  try {
    const { rows } = await query(
      `UPDATE provider_connections
       SET webhook_endpoint_url = $1, updated_by = $2
       WHERE id = $3 AND organization_id = $4
       RETURNING ${SAFE_FIELDS}`,
      [webhookEndpointUrl, req.user.id, req.params.id, req.orgId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Connection not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

// ── Rotate secrets ────────────────────────────────────────────────────────

/**
 * PUT /provider-connections/:id/rotate
 * Updates one or more secret fields without needing to resend others.
 */
const rotateSecrets = async (req, res, next) => {
  const { secretKey, publishableKey, webhookSecret, extraCredential } = req.body;
  const updates = {};

  if (secretKey) {
    updates.encrypted_secret_key = encrypt(secretKey);
    updates.key_prefix = safePrefix(secretKey);
    updates.last_rotated_at = 'NOW()';
  }
  if (publishableKey !== undefined) updates.encrypted_publishable_key = encryptIfPresent(publishableKey);
  if (webhookSecret  !== undefined) updates.encrypted_webhook_secret  = encryptIfPresent(webhookSecret);
  if (extraCredential !== undefined) updates.encrypted_extra_credential = encryptIfPresent(extraCredential);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No secret fields provided to rotate' });
  }

  // Build dynamic SET clause — handle NOW() literal
  const setClauses = [];
  const values = [];
  let idx = 1;
  for (const [col, val] of Object.entries(updates)) {
    if (val === 'NOW()') {
      setClauses.push(`${col} = NOW()`);
    } else {
      setClauses.push(`${col} = $${idx++}`);
      values.push(val);
    }
  }
  setClauses.push(`updated_by = $${idx++}`);
  values.push(req.user.id);
  setClauses.push(`status = 'configured'`);

  values.push(req.params.id, req.orgId);

  try {
    const { rows } = await query(
      `UPDATE provider_connections SET ${setClauses.join(', ')}
       WHERE id = $${idx} AND organization_id = $${idx + 1}
       RETURNING ${SAFE_FIELDS}`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Connection not found' });

    logger.info('Provider secrets rotated', { connectionId: req.params.id, orgId: req.orgId });
    res.json({ ...rows[0], meta: PROVIDER_META[rows[0].provider] || null });
  } catch (err) {
    next(err);
  }
};

// ── Test connection ───────────────────────────────────────────────────────

/**
 * POST /provider-connections/:id/test
 * Decrypts the stored credentials, calls the provider's verification
 * endpoint, records the result, and returns it.
 *
 * The raw secrets are held only in local memory for the duration of this
 * function and are never logged or returned to the client.
 */
const testConnection = async (req, res, next) => {
  try {
    // Fetch encrypted credentials
    const { rows } = await query(
      `SELECT id, provider, environment,
              encrypted_secret_key, encrypted_publishable_key,
              encrypted_webhook_secret, encrypted_extra_credential
       FROM provider_connections
       WHERE id = $1 AND organization_id = $2 AND is_active = TRUE`,
      [req.params.id, req.orgId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Connection not found or inactive' });
    }

    const conn = rows[0];

    // Decrypt all available credentials in memory
    const credentials = {
      environment: conn.environment,
      secretKey:        decrypt(conn.encrypted_secret_key),
      publishableKey:   conn.encrypted_publishable_key  ? decrypt(conn.encrypted_publishable_key)  : null,
      webhookSecret:    conn.encrypted_webhook_secret   ? decrypt(conn.encrypted_webhook_secret)   : null,
      extraCredential:  conn.encrypted_extra_credential ? decrypt(conn.encrypted_extra_credential) : null,
    };

    // Run the adapter's test
    const adapter = getAdapter(conn.provider);
    const result = await adapter.test(credentials);

    // Persist result to provider_connections and log it
    const newStatus = result.success ? 'verified' : 'failed';

    await transaction(async (client) => {
      await client.query(
        `UPDATE provider_connections
         SET status = $1, last_test_at = NOW(),
             last_test_success = $2, last_test_message = $3, last_test_latency_ms = $4
         WHERE id = $5`,
        [newStatus, result.success, result.summary, result.latencyMs, conn.id]
      );

      await client.query(
        `INSERT INTO connection_test_logs
           (connection_id, organization_id, triggered_by, success, latency_ms,
            http_status, response_summary, error_code, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [conn.id, req.orgId, req.user.id, result.success, result.latencyMs,
         result.httpStatus, result.summary, result.errorCode,
         result.success ? null : result.summary]
      );
    });

    // Fetch updated safe row
    const { rows: updated } = await query(
      `SELECT ${SAFE_FIELDS} FROM provider_connections WHERE id = $1`,
      [conn.id]
    );

    logger.info('Connection test completed', {
      orgId: req.orgId, provider: conn.provider,
      success: result.success, latencyMs: result.latencyMs,
    });

    res.json({
      connection: { ...updated[0], meta: PROVIDER_META[conn.provider] || null },
      testResult: {
        success: result.success,
        latencyMs: result.latencyMs,
        httpStatus: result.httpStatus,
        summary: result.summary,
        errorCode: result.errorCode,
        testedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── Get test log history ──────────────────────────────────────────────────

const getTestLogs = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ctl.id, ctl.success, ctl.latency_ms, ctl.http_status,
              ctl.response_summary, ctl.error_code, ctl.created_at,
              u.full_name AS triggered_by_name
       FROM connection_test_logs ctl
       LEFT JOIN users u ON u.id = ctl.triggered_by
       WHERE ctl.connection_id = $1 AND ctl.organization_id = $2
       ORDER BY ctl.created_at DESC
       LIMIT 20`,
      [req.params.id, req.orgId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// ── Deactivate connection ─────────────────────────────────────────────────

const deactivate = async (req, res, next) => {
  try {
    const { rowCount } = await query(
      `UPDATE provider_connections SET is_active = FALSE, updated_by = $1
       WHERE id = $2 AND organization_id = $3`,
      [req.user.id, req.params.id, req.orgId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Connection not found' });
    logger.info('Provider connection deactivated', { id: req.params.id, orgId: req.orgId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  list, getOne, getProviderMeta, upsert,
  updateWebhookUrl, rotateSecrets, testConnection, getTestLogs, deactivate,
};
