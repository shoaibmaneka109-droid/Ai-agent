const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { resolveTenant, enforceTenantScope } = require('../middleware/tenant.middleware');
const { success, badRequest } = require('../utils/apiResponse');

const router = Router();

router.use(authenticate, resolveTenant, enforceTenantScope);

router.get('/me', (req, res) => success(res, req.user));

router.patch('/me', async (req, res, next) => {
  try {
    const { firstName, lastName, timezone, preferences } = req.body;
    const fields = [];
    const values = [];
    let i = 1;

    if (firstName) { fields.push(`first_name = $${i++}`); values.push(firstName); }
    if (lastName)  { fields.push(`last_name = $${i++}`);  values.push(lastName); }
    if (timezone)  { fields.push(`timezone = $${i++}`);   values.push(timezone); }
    if (preferences) { fields.push(`preferences = $${i++}`); values.push(JSON.stringify(preferences)); }

    if (!fields.length) return badRequest(res, 'No fields to update');

    values.push(req.user.id);
    const { rows } = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, email, first_name, last_name, timezone, preferences`,
      values,
    );
    return success(res, rows[0], 'Profile updated');
  } catch (err) {
    next(err);
  }
});

router.patch('/me/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return badRequest(res, 'currentPassword and newPassword are required');

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return badRequest(res, 'Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, refresh_token_hash = NULL WHERE id = $2', [newHash, req.user.id]);
    return success(res, null, 'Password changed. Please log in again.');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
