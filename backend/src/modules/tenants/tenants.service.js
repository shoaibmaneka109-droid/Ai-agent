const { query, withTransaction } = require('../../db/pool');

async function getOrganization(orgId) {
  const result = await query(
    `SELECT id, name, slug, type, plan, is_active, settings, created_at, updated_at
     FROM   organizations
     WHERE  id = $1`,
    [orgId],
  );
  if (!result.rows.length) {
    const err = new Error('Organization not found');
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

async function updateOrganization(orgId, { name, settings }) {
  const fields = [];
  const values = [];
  let   idx    = 1;

  if (name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(name);
  }
  if (settings !== undefined) {
    fields.push(`settings = $${idx++}`);
    values.push(JSON.stringify(settings));
  }

  if (!fields.length) {
    return getOrganization(orgId);
  }

  fields.push(`updated_at = NOW()`);
  values.push(orgId);

  const result = await query(
    `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return result.rows[0];
}

async function upgradePlan(orgId, plan) {
  const allowed = ['free', 'starter', 'professional', 'enterprise'];
  if (!allowed.includes(plan)) {
    const err = new Error(`Invalid plan. Allowed: ${allowed.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const result = await query(
    `UPDATE organizations SET plan = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [plan, orgId],
  );
  return result.rows[0];
}

async function listMembers(orgId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const result = await query(
    `SELECT id, email, first_name, last_name, role, is_active, last_login_at, created_at
     FROM   users
     WHERE  organization_id = $1
     ORDER  BY created_at DESC
     LIMIT  $2 OFFSET $3`,
    [orgId, limit, offset],
  );
  const countResult = await query(
    'SELECT COUNT(*) FROM users WHERE organization_id = $1',
    [orgId],
  );
  return {
    members: result.rows,
    total:   parseInt(countResult.rows[0].count, 10),
    page,
    limit,
  };
}

module.exports = { getOrganization, updateOrganization, upgradePlan, listMembers };
