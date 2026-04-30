const bcrypt = require('bcryptjs');
const { query } = require('../../config/database');
const logger = require('../../services/logger');

const SAFE_FIELDS = 'id, email, full_name, role, is_active, email_verified, avatar_url, last_login_at, created_at';

const listUsers = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${SAFE_FIELDS} FROM users WHERE organization_id = $1 ORDER BY created_at ASC`,
      [req.orgId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

const getUser = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${SAFE_FIELDS} FROM users WHERE id = $1 AND organization_id = $2`,
      [req.params.id, req.orgId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const updateProfile = async (req, res, next) => {
  const { fullName, avatarUrl } = req.body;
  const updates = {};
  if (fullName) updates.full_name = fullName;
  if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = [req.user.id, ...Object.values(updates)];

  try {
    const { rows } = await query(
      `UPDATE users SET ${setClauses} WHERE id = $1 AND organization_id = $2 RETURNING ${SAFE_FIELDS}`,
      [...values, req.orgId]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    // Revoke all existing refresh tokens
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [req.user.id]);

    logger.info('Password changed', { userId: req.user.id });
    res.json({ message: 'Password updated. Please log in again.' });
  } catch (err) {
    next(err);
  }
};

const updateUserRole = async (req, res, next) => {
  const { role } = req.body;
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }
  try {
    const { rows } = await query(
      `UPDATE users SET role = $1 WHERE id = $2 AND organization_id = $3
       RETURNING ${SAFE_FIELDS}`,
      [role, req.params.id, req.orgId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    logger.info('User role updated', { targetUserId: req.params.id, role, by: req.user.id });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const deactivateUser = async (req, res, next) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }
  try {
    const { rows } = await query(
      `UPDATE users SET is_active = FALSE WHERE id = $1 AND organization_id = $2
       RETURNING id, email, is_active`,
      [req.params.id, req.orgId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

module.exports = { listUsers, getUser, updateProfile, changePassword, updateUserRole, deactivateUser };
