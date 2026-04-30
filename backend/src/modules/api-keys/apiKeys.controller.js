const { query } = require('../../config/database');
const { encrypt, decrypt } = require('../../services/encryption');
const logger = require('../../services/logger');

const SAFE_FIELDS = 'id, name, provider, environment, key_prefix, is_active, last_used_at, last_rotated_at, created_at';

const listApiKeys = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${SAFE_FIELDS} FROM api_keys WHERE organization_id = $1 ORDER BY created_at DESC`,
      [req.orgId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

const getApiKey = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${SAFE_FIELDS} FROM api_keys WHERE id = $1 AND organization_id = $2`,
      [req.params.id, req.orgId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'API key not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const createApiKey = async (req, res, next) => {
  const { name, provider, environment, secretKey, publishableKey } = req.body;

  try {
    // Enforce per-plan key limits
    const { rows: limitCheck } = await query(
      'SELECT max_api_keys FROM organizations WHERE id = $1',
      [req.orgId]
    );
    const { rows: current } = await query(
      'SELECT COUNT(*) FROM api_keys WHERE organization_id = $1 AND is_active = TRUE',
      [req.orgId]
    );

    if (parseInt(current[0].count, 10) >= limitCheck[0].max_api_keys) {
      return res.status(403).json({
        error: `API key limit reached (max ${limitCheck[0].max_api_keys} for your plan)`,
      });
    }

    const encryptedSecret = encrypt(secretKey);
    const encryptedPublishable = publishableKey ? encrypt(publishableKey) : null;

    // Store only first 12 chars as display prefix (never the full key)
    const keyPrefix = secretKey.slice(0, 12) + '...';

    const { rows } = await query(
      `INSERT INTO api_keys
         (organization_id, name, provider, environment, encrypted_secret_key, encrypted_publishable_key, key_prefix, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${SAFE_FIELDS}`,
      [req.orgId, name, provider, environment || 'test', encryptedSecret, encryptedPublishable, keyPrefix, req.user.id]
    );

    logger.info('API key created', { orgId: req.orgId, provider, environment, userId: req.user.id });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const rotateApiKey = async (req, res, next) => {
  const { secretKey, publishableKey } = req.body;
  try {
    const { rows: existing } = await query(
      'SELECT id FROM api_keys WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.orgId]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'API key not found' });

    const encryptedSecret = encrypt(secretKey);
    const encryptedPublishable = publishableKey ? encrypt(publishableKey) : null;
    const keyPrefix = secretKey.slice(0, 12) + '...';

    const { rows } = await query(
      `UPDATE api_keys
       SET encrypted_secret_key = $1, encrypted_publishable_key = $2,
           key_prefix = $3, last_rotated_at = NOW()
       WHERE id = $4 AND organization_id = $5
       RETURNING ${SAFE_FIELDS}`,
      [encryptedSecret, encryptedPublishable, keyPrefix, req.params.id, req.orgId]
    );

    logger.info('API key rotated', { keyId: req.params.id, orgId: req.orgId, userId: req.user.id });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

/**
 * Internal-only: decrypt a key for use in payment processing.
 * Never exposed via HTTP — called from payment service internally.
 */
const decryptKeyForProvider = async (orgId, provider, environment) => {
  const { rows } = await query(
    'SELECT encrypted_secret_key FROM api_keys WHERE organization_id = $1 AND provider = $2 AND environment = $3 AND is_active = TRUE',
    [orgId, provider, environment]
  );
  if (rows.length === 0) throw new Error(`No active ${provider} ${environment} key for org`);

  await query(
    'UPDATE api_keys SET last_used_at = NOW() WHERE organization_id = $1 AND provider = $2 AND environment = $3',
    [orgId, provider, environment]
  );

  return decrypt(rows[0].encrypted_secret_key);
};

const deleteApiKey = async (req, res, next) => {
  try {
    const { rowCount } = await query(
      'UPDATE api_keys SET is_active = FALSE WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.orgId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'API key not found' });
    logger.info('API key deactivated', { keyId: req.params.id, orgId: req.orgId });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports = { listApiKeys, getApiKey, createApiKey, rotateApiKey, deleteApiKey, decryptKeyForProvider };
