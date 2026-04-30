const { query, getClient } = require('../config/database');
const { parsePagination, buildMeta } = require('../utils/pagination');
const apiKeyService = require('./apiKey.service');
const logger = require('../utils/logger');

async function listPayments(tenantId, queryParams) {
  const { limit, offset, page } = parsePagination(queryParams);
  const filters = [];
  const values = [tenantId];
  let i = 2;

  if (queryParams.status) {
    filters.push(`status = $${i++}`);
    values.push(queryParams.status);
  }
  if (queryParams.provider) {
    filters.push(`provider = $${i++}`);
    values.push(queryParams.provider);
  }
  if (queryParams.from) {
    filters.push(`created_at >= $${i++}`);
    values.push(queryParams.from);
  }
  if (queryParams.to) {
    filters.push(`created_at <= $${i++}`);
    values.push(queryParams.to);
  }

  const where = filters.length ? `AND ${filters.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    query(
      `SELECT id, provider, provider_payment_id, amount, currency, status,
              customer_email, customer_name, payment_method_type, payment_method_last4,
              payment_method_brand, description, metadata, paid_at, created_at
       FROM payments
       WHERE tenant_id = $1 ${where}
       ORDER BY created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...values, limit, offset],
    ),
    query(`SELECT COUNT(*) FROM payments WHERE tenant_id = $1 ${where}`, values),
  ]);

  return {
    payments: dataResult.rows,
    meta: buildMeta(page, limit, parseInt(countResult.rows[0].count, 10)),
  };
}

async function getPayment(tenantId, paymentId) {
  const { rows } = await query(
    `SELECT p.*, u.email as created_by_email
     FROM payments p
     LEFT JOIN users u ON u.id = p.created_by
     WHERE p.id = $1 AND p.tenant_id = $2`,
    [paymentId, tenantId],
  );
  if (!rows.length) throw Object.assign(new Error('Payment not found'), { statusCode: 404 });
  return rows[0];
}

async function createPaymentRecord(tenantId, userId, data) {
  const {
    provider, providerPaymentId, amount, currency, status,
    customerEmail, customerName, paymentMethodType, paymentMethodLast4,
    paymentMethodBrand, description, metadata,
  } = data;

  const { rows } = await query(
    `INSERT INTO payments
       (tenant_id, created_by, provider, provider_payment_id, amount, currency, status,
        customer_email, customer_name, payment_method_type, payment_method_last4,
        payment_method_brand, description, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      tenantId, userId, provider, providerPaymentId, amount, currency || 'USD', status || 'pending',
      customerEmail, customerName, paymentMethodType, paymentMethodLast4,
      paymentMethodBrand, description, metadata ? JSON.stringify(metadata) : '{}',
    ],
  );
  return rows[0];
}

async function updatePaymentStatus(tenantId, paymentId, status, additionalFields = {}) {
  const allowed = ['paid_at', 'failed_at', 'net_amount', 'fee_amount', 'provider_charge_id', 'last_webhook_event', 'last_webhook_at'];
  const fields = ['status = $3'];
  const values = [tenantId, paymentId, status];
  let i = 4;

  for (const key of allowed) {
    if (additionalFields[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(additionalFields[key]);
    }
  }

  const { rows } = await query(
    `UPDATE payments SET ${fields.join(', ')} WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    values,
  );
  if (!rows.length) throw Object.assign(new Error('Payment not found'), { statusCode: 404 });
  return rows[0];
}

async function createRefund(tenantId, paymentId, userId, { amount, reason }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: [payment] } = await client.query(
      'SELECT id, amount, refunded_amount, status FROM payments WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [paymentId, tenantId],
    );
    if (!payment) throw Object.assign(new Error('Payment not found'), { statusCode: 404 });
    if (!['succeeded', 'partially_refunded'].includes(payment.status)) {
      throw Object.assign(new Error('Payment is not eligible for refund'), { statusCode: 400 });
    }

    const remainingRefundable = payment.amount - payment.refunded_amount;
    if (amount > remainingRefundable) {
      throw Object.assign(new Error(`Maximum refundable amount is ${remainingRefundable}`), { statusCode: 400 });
    }

    const { rows: [refund] } = await client.query(
      `INSERT INTO refunds (payment_id, tenant_id, initiated_by, amount, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
      [paymentId, tenantId, userId, amount, reason],
    );

    const newRefunded = payment.refunded_amount + amount;
    const newStatus = newRefunded >= payment.amount ? 'refunded' : 'partially_refunded';

    await client.query(
      'UPDATE payments SET refunded_amount = $1, status = $2 WHERE id = $3',
      [newRefunded, newStatus, paymentId],
    );

    await client.query('COMMIT');
    return refund;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getAnalytics(tenantId, { from, to, groupBy = 'day' }) {
  const values = [tenantId, from || '1970-01-01', to || 'now()'];
  const { rows } = await query(
    `SELECT
       DATE_TRUNC($4, created_at) AS period,
       COUNT(*) AS total_count,
       SUM(amount) AS total_amount,
       SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) AS succeeded_amount,
       COUNT(CASE WHEN status = 'succeeded' THEN 1 END) AS succeeded_count,
       COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed_count,
       currency
     FROM payments
     WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
     GROUP BY period, currency
     ORDER BY period DESC`,
    [...values, groupBy],
  );
  return rows;
}

module.exports = { listPayments, getPayment, createPaymentRecord, updatePaymentStatus, createRefund, getAnalytics };
