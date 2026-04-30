const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, getClient } = require('../config/database');
const jwtConfig = require('../config/jwt');
const logger = require('../utils/logger');
const { initTrial, computeAccess } = require('./trial.service');

const SALT_ROUNDS = 12;

function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email,
    },
    jwtConfig.accessToken.secret,
    { expiresIn: jwtConfig.accessToken.expiresIn },
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

async function register({ tenantName, tenantSlug, plan, email, password, firstName, lastName, companyName }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Validate slug uniqueness
    const existingTenant = await client.query('SELECT id FROM tenants WHERE slug = $1', [tenantSlug]);
    if (existingTenant.rows.length) throw Object.assign(new Error('Tenant slug already taken'), { statusCode: 409 });

    // Create tenant
    const maxUsers = plan === 'agency' ? -1 : 1;
    const maxApiKeys = plan === 'agency' ? 10 : 2;
    const tenantResult = await client.query(
      `INSERT INTO tenants (slug, name, plan, contact_email, max_users, max_api_keys, company_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
       RETURNING id`,
      [tenantSlug, tenantName, plan, email, maxUsers, maxApiKeys, companyName || null],
    );
    const tenantId = tenantResult.rows[0].id;

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create owner user
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, status, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, 'owner', 'active', NOW())
       RETURNING id, tenant_id, role, email, first_name, last_name`,
      [tenantId, email, passwordHash, firstName, lastName],
    );
    const user = userResult.rows[0];

    // ── Initialize trial subscription (inside same transaction) ──────────────
    // Solo  → 15-day trial
    // Agency → 30-day trial, employee cap = 9
    const subscription = await initTrial(client, tenantId, plan);

    await client.query('COMMIT');
    logger.info(`New tenant registered: ${tenantSlug} (plan: ${plan}, trial ends: ${subscription.trial_end})`);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [refreshTokenHash, user.id]);

    const access = computeAccess(subscription);

    return {
      accessToken,
      refreshToken,
      user: sanitizeUser(user),
      tenantId,
      subscription: {
        status: subscription.status,
        trialEnd: subscription.trial_end,
        trialDays: subscription.trial_days,
      },
      access,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function login({ email, password, tenantSlug }) {
  // Join subscription so we can return access state on login without a 2nd round-trip
  const { rows } = await query(
    `SELECT u.id, u.tenant_id, u.role, u.email, u.password_hash, u.status,
            u.first_name, u.last_name, u.failed_login_count, u.locked_until,
            t.plan, t.status AS tenant_status,
            s.id AS sub_id, s.status AS sub_status, s.trial_end, s.trial_days,
            s.trial_expired_at, s.hibernation_started_at,
            s.grace_period_hours, s.api_access, s.autofill_access, s.data_read_only,
            s.current_period_end
     FROM users u
     JOIN tenants t ON t.id = u.tenant_id
     LEFT JOIN subscriptions s ON s.tenant_id = t.id
     WHERE u.email = $1 AND t.slug = $2`,
    [email, tenantSlug],
  );

  if (!rows.length) throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });

  const row = rows[0];

  // User-level checks
  if (row.status !== 'active') throw Object.assign(new Error('Account is not active'), { statusCode: 403 });
  if (row.tenant_status === 'suspended') throw Object.assign(new Error('This workspace has been suspended'), { statusCode: 403 });
  if (row.tenant_status === 'cancelled') throw Object.assign(new Error('This workspace has been closed'), { statusCode: 403 });

  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    throw Object.assign(new Error('Account is temporarily locked. Please try again later.'), { statusCode: 423 });
  }

  const passwordMatch = await bcrypt.compare(password, row.password_hash);
  if (!passwordMatch) {
    const failCount = row.failed_login_count + 1;
    const lockUntil = failCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await query(
      'UPDATE users SET failed_login_count = $1, locked_until = $2 WHERE id = $3',
      [failCount, lockUntil, row.id],
    );
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  }

  // Reset failed attempts and record last login
  await query(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1',
    [row.id],
  );

  // Compute subscription access state (hibernated users are still allowed to log in)
  const subRow = row.sub_id
    ? {
        status: row.sub_status,
        trial_end: row.trial_end,
        grace_period_hours: row.grace_period_hours ?? 24,
        api_access: row.api_access,
        autofill_access: row.autofill_access,
        data_read_only: row.data_read_only,
      }
    : null;
  const access = computeAccess(subRow);

  const user = {
    id: row.id,
    tenant_id: row.tenant_id,
    role: row.role,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
  };

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
  await query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [refreshTokenHash, row.id]);

  // Days remaining in trial (null if not trialing)
  let trialDaysRemaining = null;
  if (row.sub_status === 'trialing' && row.trial_end) {
    trialDaysRemaining = Math.max(0, Math.ceil((new Date(row.trial_end) - new Date()) / 86400000));
  }

  return {
    accessToken,
    refreshToken,
    user: sanitizeUser(user),
    subscription: row.sub_id
      ? {
          status: row.sub_status,
          trialEnd: row.trial_end,
          trialDays: row.trial_days,
          trialDaysRemaining,
          trialExpiredAt: row.trial_expired_at,
          hibernationStartedAt: row.hibernation_started_at,
          currentPeriodEnd: row.current_period_end,
        }
      : null,
    access,
  };
}

async function refreshTokens(userId, refreshToken) {
  const { rows } = await query(
    'SELECT id, tenant_id, role, email, refresh_token_hash, status, first_name, last_name FROM users WHERE id = $1',
    [userId],
  );
  if (!rows.length) throw Object.assign(new Error('User not found'), { statusCode: 401 });

  const user = rows[0];
  if (!user.refresh_token_hash) throw Object.assign(new Error('No active session'), { statusCode: 401 });

  const valid = await bcrypt.compare(refreshToken, user.refresh_token_hash);
  if (!valid) throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });

  if (user.status !== 'active') throw Object.assign(new Error('Account is not active'), { statusCode: 403 });

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken();
  const newRefreshHash = await bcrypt.hash(newRefreshToken, 10);

  await query('UPDATE users SET refresh_token_hash = $1 WHERE id = $2', [newRefreshHash, user.id]);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

async function logout(userId) {
  await query('UPDATE users SET refresh_token_hash = NULL WHERE id = $1', [userId]);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    tenantId: user.tenant_id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
  };
}

module.exports = { register, login, refreshTokens, logout };
