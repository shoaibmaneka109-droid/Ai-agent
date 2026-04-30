const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query, getClient } = require('../config/database');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { incrementEmployeeCount, decrementEmployeeCount, checkTeamLimit } = require('./trial.service');

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

  // Decrement employee count — solo plans never had employees so this is always agency
  await decrementEmployeeCount(tenantId);
}

/**
 * Invite a new employee / team member.
 *
 * Enforces:
 *   - Solo plan cannot add team members at all
 *   - Agency trial: max 9 employees (owner not counted)
 *   - Agency paid:  no cap
 *
 * Creates the user with a temporary random password and returns the record.
 * In production this would send an invite email with a password-reset link.
 */
async function inviteMember(tenantId, invitedByUserId, { email, firstName, lastName, role = 'member' }) {
  // Check trial/plan limits before doing anything
  const limitCheck = await checkTeamLimit(tenantId);
  if (!limitCheck.allowed) {
    throw Object.assign(new Error(limitCheck.reason), { statusCode: 402, code: 'TEAM_LIMIT_REACHED' });
  }

  // Disallow owner role via invite
  if (role === 'owner') {
    throw Object.assign(new Error('Cannot assign owner role via invitation'), { statusCode: 400 });
  }

  // Check email uniqueness within tenant
  const existing = await query('SELECT id FROM users WHERE tenant_id = $1 AND email = $2', [tenantId, email]);
  if (existing.rows.length) {
    throw Object.assign(new Error('A user with this email already exists in this workspace'), { statusCode: 409 });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Generate a secure temporary password — user must reset via email link
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const { rows } = await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING id, tenant_id, email, first_name, last_name, role, status, created_at`,
      [tenantId, email, passwordHash, firstName, lastName, role],
    );
    const newUser = rows[0];

    // Atomically increment employee count
    await client.query(
      `UPDATE tenants SET current_employee_count = current_employee_count + 1 WHERE id = $1`,
      [tenantId],
    );

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource, resource_id, new_values)
       VALUES ($1, $2, 'member_invited', 'users', $3, $4)`,
      [tenantId, invitedByUserId, newUser.id, JSON.stringify({ email, role })],
    );

    await client.query('COMMIT');
    return { user: newUser, tempPassword }; // tempPassword → would be sent via email in prod
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getTenant,
  updateTenant,
  getTeamMembers,
  updateMemberRole,
  removeMember,
  inviteMember,
};
