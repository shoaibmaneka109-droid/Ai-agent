const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../db/pool');

const BCRYPT_ROUNDS = 12;

async function getUser(userId, orgId) {
  const result = await query(
    `SELECT id, email, first_name, last_name, role, is_active, last_login_at, created_at
     FROM   users
     WHERE  id = $1 AND organization_id = $2`,
    [userId, orgId],
  );
  if (!result.rows.length) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

async function inviteUser(orgId, { email, firstName, lastName, role, tempPassword }) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

  const result = await query(
    `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, first_name, last_name, role, created_at`,
    [uuidv4(), orgId, email.toLowerCase(), passwordHash, firstName, lastName, role],
  );
  return result.rows[0];
}

async function updateUser(userId, orgId, { firstName, lastName, role }) {
  const fields = [];
  const values = [];
  let   idx    = 1;

  if (firstName !== undefined) { fields.push(`first_name = $${idx++}`); values.push(firstName); }
  if (lastName  !== undefined) { fields.push(`last_name = $${idx++}`);  values.push(lastName);  }
  if (role      !== undefined) { fields.push(`role = $${idx++}`);       values.push(role);       }

  if (!fields.length) return getUser(userId, orgId);

  fields.push(`updated_at = NOW()`);
  values.push(userId, orgId);

  const result = await query(
    `UPDATE users SET ${fields.join(', ')}
     WHERE id = $${idx} AND organization_id = $${idx + 1}
     RETURNING id, email, first_name, last_name, role, is_active, updated_at`,
    values,
  );
  if (!result.rows.length) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

async function deactivateUser(userId, orgId, requestingUserId) {
  if (userId === requestingUserId) {
    const err = new Error('Cannot deactivate your own account');
    err.statusCode = 400;
    throw err;
  }
  const result = await query(
    `UPDATE users SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2
     RETURNING id`,
    [userId, orgId],
  );
  if (!result.rows.length) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!result.rows.length) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!valid) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 400;
    throw err;
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
}

module.exports = { getUser, inviteUser, updateUser, deactivateUser, changePassword };
