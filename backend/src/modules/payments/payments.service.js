const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../../db/pool');
const { resolveRawKey } = require('../api-keys/apiKeys.service');

/**
 * Payment processing is provider-agnostic: the service resolves the
 * encrypted API key, calls the appropriate adapter, then persists the
 * transaction record.  The actual HTTP call to Stripe/Airwallex is
 * delegated to provider adapters (stubs shown here — replace with real
 * SDK calls in production).
 */

async function createPayment(orgId, { provider, amount, currency, metadata, environment }) {
  const rawKey = await resolveRawKey(orgId, provider, environment || 'live');

  // Call the provider adapter (stub)
  const providerResponse = await providerAdapter(provider, {
    action: 'charge',
    amount,
    currency,
    apiKey: rawKey,
    metadata,
  });

  const result = await query(
    `INSERT INTO payments
       (id, organization_id, provider, amount, currency, status, provider_transaction_id,
        environment, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      uuidv4(), orgId, provider, amount, currency,
      providerResponse.status,
      providerResponse.transactionId,
      environment || 'live',
      JSON.stringify(metadata || {}),
    ],
  );
  return result.rows[0];
}

async function listPayments(orgId, { page = 1, limit = 20, status, provider } = {}) {
  const conditions = ['organization_id = $1'];
  const values     = [orgId];
  let   idx        = 2;

  if (status)   { conditions.push(`status = $${idx++}`);   values.push(status);   }
  if (provider) { conditions.push(`provider = $${idx++}`); values.push(provider); }

  const where  = conditions.join(' AND ');
  const offset = (page - 1) * limit;

  const [rows, count] = await Promise.all([
    query(
      `SELECT id, provider, amount, currency, status, provider_transaction_id,
              environment, metadata, created_at
       FROM   payments
       WHERE  ${where}
       ORDER  BY created_at DESC
       LIMIT  $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    ),
    query(`SELECT COUNT(*) FROM payments WHERE ${where}`, values),
  ]);

  return {
    payments: rows.rows,
    total:    parseInt(count.rows[0].count, 10),
    page,
    limit,
  };
}

async function getPayment(paymentId, orgId) {
  const result = await query(
    'SELECT * FROM payments WHERE id = $1 AND organization_id = $2',
    [paymentId, orgId],
  );
  if (!result.rows.length) {
    const err = new Error('Payment not found');
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

async function refundPayment(paymentId, orgId, { reason }) {
  const payment = await getPayment(paymentId, orgId);

  if (payment.status !== 'succeeded') {
    const err = new Error('Only succeeded payments can be refunded');
    err.statusCode = 400;
    throw err;
  }

  const rawKey = await resolveRawKey(orgId, payment.provider, payment.environment);

  await providerAdapter(payment.provider, {
    action: 'refund',
    transactionId: payment.provider_transaction_id,
    apiKey: rawKey,
    reason,
  });

  const result = await query(
    `UPDATE payments SET status = 'refunded', updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING *`,
    [paymentId, orgId],
  );
  return result.rows[0];
}

// ---------- Provider adapter stub ----------

async function providerAdapter(provider, params) {
  // In production: call Stripe SDK / Airwallex SDK here.
  // Each provider module should be in /adapters/<provider>.js
  return {
    status:        'succeeded',
    transactionId: `${provider}_txn_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
  };
}

module.exports = { createPayment, listPayments, getPayment, refundPayment };
