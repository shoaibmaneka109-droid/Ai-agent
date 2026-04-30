const { query } = require('../../config/database');
const logger = require('../../services/logger');

const getOrganization = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, slug, plan_type, status, is_active,
              individual_name, tax_id, company_name, company_reg_no,
              company_address, company_website, billing_email,
              max_members, max_api_keys, created_at
       FROM organizations WHERE id = $1`,
      [req.orgId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Organization not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const updateOrganization = async (req, res, next) => {
  const allowed = [
    'name', 'billing_email',
    'individual_name', 'tax_id',
    'company_name', 'company_reg_no', 'company_address', 'company_website',
  ];
  const updates = {};
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = [req.orgId, ...Object.values(updates)];

  try {
    const { rows } = await query(
      `UPDATE organizations SET ${setClauses} WHERE id = $1 RETURNING id, name, slug, plan_type, billing_email`,
      values
    );
    logger.info('Organization updated', { orgId: req.orgId, fields: Object.keys(updates) });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const getMembers = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, email, full_name, role, is_active, email_verified, last_login_at, created_at
       FROM users WHERE organization_id = $1 ORDER BY created_at ASC`,
      [req.orgId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

const getStats = async (req, res, next) => {
  try {
    const [membersRes, paymentsRes, apiKeysRes] = await Promise.all([
      query('SELECT COUNT(*) FROM users WHERE organization_id = $1 AND is_active = TRUE', [req.orgId]),
      query(
        `SELECT COUNT(*) AS total, SUM(amount) AS volume,
                COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'failed') AS failed
         FROM payments WHERE organization_id = $1`,
        [req.orgId]
      ),
      query('SELECT COUNT(*) FROM api_keys WHERE organization_id = $1 AND is_active = TRUE', [req.orgId]),
    ]);

    const p = paymentsRes.rows[0];
    res.json({
      members: parseInt(membersRes.rows[0].count, 10),
      apiKeys: parseInt(apiKeysRes.rows[0].count, 10),
      payments: {
        total: parseInt(p.total, 10),
        completed: parseInt(p.completed, 10),
        failed: parseInt(p.failed, 10),
        volume: parseInt(p.volume || 0, 10),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getOrganization, updateOrganization, getMembers, getStats };
