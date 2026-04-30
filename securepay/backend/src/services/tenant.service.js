const { query } = require('../config/database');
const { parsePagination, buildMeta } = require('../utils/pagination');

async function getTenant(tenantId) {
  const { rows } = await query(
    `SELECT id, slug, name, plan, status, company_name, company_tax_id, company_address,
            contact_email, contact_phone, max_users, max_api_keys, settings, created_at
     FROM tenants WHERE id = $1`,
    [tenantId],
  );
  return rows[0] || null;
}

async function updateTenant(tenantId, updates) {
  const allowed = ['name', 'company_name', 'company_tax_id', 'company_address', 'contact_phone', 'settings'];
  const fields = [];
  const values = [];
  let i = 1;

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      values.push(updates[key]);
    }
  }

  if (!fields.length) return getTenant(tenantId);

  values.push(tenantId);
  const { rows } = await query(
    `UPDATE tenants SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  );
  return rows[0];
}

async function getTeamMembers(tenantId, queryParams) {
  const { limit, offset, page } = parsePagination(queryParams);

  const [{ rows }, countResult] = await Promise.all([
    query(
      `SELECT id, email, first_name, last_name, role, status, last_login_at, created_at
       FROM users WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    ),
    query('SELECT COUNT(*) FROM users WHERE tenant_id = $1', [tenantId]),
  ]);

  return { members: rows, meta: buildMeta(page, limit, parseInt(countResult.rows[0].count, 10)) };
}

async function updateMemberRole(tenantId, userId, newRole) {
  const { rows } = await query(
    `UPDATE users SET role = $1 WHERE id = $2 AND tenant_id = $3
     RETURNING id, email, first_name, last_name, role`,
    [newRole, userId, tenantId],
  );
  if (!rows.length) throw Object.assign(new Error('User not found in this tenant'), { statusCode: 404 });
  return rows[0];
}

async function removeMember(tenantId, userId, requestingUserId) {
  if (userId === requestingUserId) {
    throw Object.assign(new Error('You cannot remove yourself'), { statusCode: 400 });
  }
  const { rows } = await query(
    'SELECT role FROM users WHERE id = $1 AND tenant_id = $2',
    [userId, tenantId],
  );
  if (!rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  if (rows[0].role === 'owner') throw Object.assign(new Error('Cannot remove the tenant owner'), { statusCode: 400 });

  await query('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [userId, tenantId]);
}

module.exports = { getTenant, updateTenant, getTeamMembers, updateMemberRole, removeMember };
