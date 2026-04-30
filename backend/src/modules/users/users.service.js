const bcrypt = require('bcryptjs');
const { query } = require('../../config/database');
const config = require('../../config');

const getProfile = async (userId) => {
  const result = await query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active,
            u.last_login_at, u.created_at,
            o.id AS org_id, o.name AS org_name, o.slug AS org_slug,
            o.type AS org_type, o.plan AS org_plan
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    organization: {
      id: row.org_id,
      name: row.org_name,
      slug: row.org_slug,
      type: row.org_type,
      plan: row.org_plan,
    },
  };
};

const updateProfile = async (userId, { firstName, lastName }) => {
  const result = await query(
    `UPDATE users
     SET first_name = COALESCE($1, first_name),
         last_name  = COALESCE($2, last_name),
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, email, first_name, last_name, updated_at`,
    [firstName || null, lastName || null, userId]
  );

  return result.rows[0];
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const result = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
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

  const newHash = await bcrypt.hash(newPassword, config.bcrypt.saltRounds);
  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newHash, userId]
  );
};

module.exports = { getProfile, updateProfile, changePassword };
