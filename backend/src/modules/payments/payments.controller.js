const { query, transaction } = require('../../config/database');
const { decryptKeyForProvider } = require('../api-keys/apiKeys.controller');
const logger = require('../../services/logger');

const listPayments = async (req, res, next) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  let whereClause = 'WHERE p.organization_id = $1';
  const params = [req.orgId];

  if (status) {
    params.push(status);
    whereClause += ` AND p.status = $${params.length}`;
  }

  try {
    const [dataRes, countRes] = await Promise.all([
      query(
        `SELECT p.id, p.provider, p.provider_payment_id, p.amount, p.currency,
                p.status, p.description, p.customer_email, p.customer_name,
                p.refunded_amount, p.created_at,
                u.full_name AS created_by_name
         FROM payments p
         JOIN users u ON u.id = p.created_by
         ${whereClause}
         ORDER BY p.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, parseInt(limit, 10), offset]
      ),
      query(`SELECT COUNT(*) FROM payments p ${whereClause}`, params),
    ]);

    res.json({
      data: dataRes.rows,
      pagination: {
        total: parseInt(countRes.rows[0].count, 10),
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(countRes.rows[0].count / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

const getPayment = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, u.full_name AS created_by_name
       FROM payments p JOIN users u ON u.id = p.created_by
       WHERE p.id = $1 AND p.organization_id = $2`,
      [req.params.id, req.orgId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Payment not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /payments
 * Creates a payment record. In production, this would invoke the provider SDK
 * using the decrypted API key. Here we simulate the provider call.
 */
const createPayment = async (req, res, next) => {
  const { provider, amount, currency, description, customerEmail, customerName, environment } = req.body;

  try {
    // Decrypt provider key (demonstrates AES-256 decryption flow)
    let providerPaymentId = null;
    try {
      const secretKey = await decryptKeyForProvider(req.orgId, provider, environment || 'test');
      // In production: call Stripe/Airwallex SDK with secretKey
      // e.g. const charge = await stripe.charges.create({...}, { apiKey: secretKey });
      providerPaymentId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      logger.debug('Provider key decrypted for payment', { provider, orgId: req.orgId });
      void secretKey; // explicitly consumed
    } catch (keyErr) {
      return res.status(400).json({ error: `No active ${provider} key configured: ${keyErr.message}` });
    }

    const result = await transaction(async (client) => {
      const { rows: [payment] } = await client.query(
        `INSERT INTO payments
           (organization_id, created_by, provider, provider_payment_id, amount, currency, status, description, customer_email, customer_name)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)
         RETURNING *`,
        [req.orgId, req.user.id, provider, providerPaymentId, amount, currency || 'USD', description, customerEmail, customerName]
      );

      // Simulate completed payment
      const { rows: [updated] } = await client.query(
        `UPDATE payments SET status = 'completed' WHERE id = $1 RETURNING *`,
        [payment.id]
      );

      return updated;
    });

    logger.info('Payment created', { paymentId: result.id, orgId: req.orgId, amount, provider });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

const getPaymentStats = async (req, res, next) => {
  const { from, to } = req.query;
  try {
    let dateFilter = '';
    const params = [req.orgId];
    if (from) { params.push(from); dateFilter += ` AND created_at >= $${params.length}`; }
    if (to) { params.push(to); dateFilter += ` AND created_at <= $${params.length}`; }

    const { rows } = await query(
      `SELECT
         currency,
         SUM(amount) FILTER (WHERE status = 'completed') AS total_volume,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed_count,
         COUNT(*) FILTER (WHERE status = 'refunded') AS refunded_count,
         AVG(amount) FILTER (WHERE status = 'completed') AS avg_amount
       FROM payments
       WHERE organization_id = $1 ${dateFilter}
       GROUP BY currency`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

module.exports = { listPayments, getPayment, createPayment, getPaymentStats };
