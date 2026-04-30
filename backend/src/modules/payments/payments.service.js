const { query, withTransaction } = require('../../config/database');
const { decrypt } = require('../../shared/utils/encryption');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');

/**
 * Retrieve the active API key config for a provider within an organization.
 * Decrypts the secret key for use in payment gateway calls.
 */
const getActiveProviderConfig = async (organizationId, provider) => {
  const result = await query(
    `SELECT id, public_key, encrypted_secret_key, encrypted_webhook_secret
     FROM organization_api_keys
     WHERE organization_id = $1 AND provider = $2 AND is_active = true
     LIMIT 1`,
    [organizationId, provider]
  );

  if (result.rows.length === 0) {
    const err = new Error(`No active ${provider} configuration found for this organization`);
    err.statusCode = 404;
    throw err;
  }

  const row = result.rows[0];
  return {
    keyId: row.id,
    publicKey: row.public_key,
    secretKey: decrypt(row.encrypted_secret_key),
    webhookSecret: row.encrypted_webhook_secret ? decrypt(row.encrypted_webhook_secret) : null,
  };
};

const createPaymentIntent = async (organizationId, { amount, currency, provider, metadata = {} }) => {
  const config = await getActiveProviderConfig(organizationId, provider);

  // Record the intent in DB first (idempotent by external_id)
  const result = await withTransaction(async (client) => {
    const payment = await client.query(
      `INSERT INTO payments
         (organization_id, provider, amount, currency, status, metadata)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING id, provider, amount, currency, status, created_at`,
      [organizationId, provider, amount, currency.toUpperCase(), JSON.stringify(metadata)]
    );

    return payment.rows[0];
  });

  // NOTE: Actual Stripe / Airwallex SDK calls would happen here.
  // The decrypted config.secretKey is used to initialise the SDK client.
  // Placeholder demonstrates the integration point.
  return {
    ...result,
    clientSecret: `${provider}_cs_placeholder_${result.id}`,
    providerKeyId: config.keyId,
  };
};

const listPayments = async (organizationId, queryParams) => {
  const { limit, offset, page } = parsePagination(queryParams);
  const { status, provider } = queryParams;

  const conditions = ['organization_id = $1'];
  const params = [organizationId];
  let paramIdx = 2;

  if (status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(status);
  }
  if (provider) {
    conditions.push(`provider = $${paramIdx++}`);
    params.push(provider);
  }

  const whereClause = conditions.join(' AND ');

  const [paymentsResult, countResult] = await Promise.all([
    query(
      `SELECT id, provider, amount, currency, status, external_id, metadata, created_at, updated_at
       FROM payments
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*) FROM payments WHERE ${whereClause}`, params),
  ]);

  const total = parseInt(countResult.rows[0].count, 10);
  return {
    payments: paymentsResult.rows,
    meta: buildPaginationMeta(total, { page, limit }),
  };
};

const getPayment = async (organizationId, paymentId) => {
  const result = await query(
    `SELECT id, provider, amount, currency, status, external_id, metadata, created_at, updated_at
     FROM payments
     WHERE id = $1 AND organization_id = $2`,
    [paymentId, organizationId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Payment not found');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
};

const updatePaymentStatus = async (organizationId, paymentId, status, externalId = null) => {
  const result = await query(
    `UPDATE payments
     SET status = $1,
         external_id = COALESCE($2, external_id),
         updated_at = NOW()
     WHERE id = $3 AND organization_id = $4
     RETURNING id, status, external_id, updated_at`,
    [status, externalId, paymentId, organizationId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Payment not found');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
};

module.exports = { createPaymentIntent, listPayments, getPayment, updatePaymentStatus, getActiveProviderConfig };
