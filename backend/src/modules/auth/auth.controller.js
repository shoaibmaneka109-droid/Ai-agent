const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../../config/database');
const config = require('../../config');
const logger = require('../../services/logger');

const SALT_ROUNDS = 12;

const generateTokenPair = (userId, orgId, role) => {
  const access = jwt.sign(
    { sub: userId, orgId, role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
  const refresh = jwt.sign(
    { sub: userId, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
  return { access, refresh };
};

const hashRefreshToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

/**
 * POST /auth/register
 * Creates a new organization + owner user in a single transaction.
 */
const register = async (req, res, next) => {
  const { email, password, fullName, organizationName, planType } = req.body;
  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const slug = organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);

    const maxMembers = planType === 'agency' ? 999 : 1;
    const maxApiKeys = planType === 'agency' ? 10 : 2;

    const result = await transaction(async (client) => {
      // Ensure slug uniqueness
      const { rows: slugCheck } = await client.query(
        'SELECT id FROM organizations WHERE slug LIKE $1',
        [`${slug}%`]
      );
      const uniqueSlug = slugCheck.length > 0 ? `${slug}-${Date.now()}` : slug;

      const { rows: [org] } = await client.query(
        `INSERT INTO organizations (name, slug, plan_type, max_members, max_api_keys, billing_email)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, slug, plan_type`,
        [organizationName, uniqueSlug, planType || 'solo', maxMembers, maxApiKeys, email]
      );

      const { rows: [user] } = await client.query(
        `INSERT INTO users (id, organization_id, email, password_hash, full_name, role)
         VALUES ($1, $2, $3, $4, $5, 'owner') RETURNING id, email, full_name, role`,
        [uuidv4(), org.id, email, passwordHash, fullName]
      );

      return { org, user };
    });

    const { access, refresh } = generateTokenPair(
      result.user.id,
      result.org.id,
      result.user.role
    );

    const refreshHash = hashRefreshToken(refresh);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [result.user.id, refreshHash, expiresAt, req.ip, req.headers['user-agent']]
    );

    logger.info('User registered', { userId: result.user.id, orgId: result.org.id });

    res.status(201).json({
      message: 'Registration successful',
      accessToken: access,
      refreshToken: refresh,
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.full_name,
        role: result.user.role,
      },
      organization: {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
        planType: result.org.plan_type,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/login
 */
const login = async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const result = await query(
      `SELECT u.id, u.password_hash, u.full_name, u.role, u.is_active,
              o.id AS org_id, o.name AS org_name, o.slug, o.plan_type, o.is_active AS org_active
       FROM users u JOIN organizations o ON o.id = u.organization_id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Account is deactivated' });
    if (!user.org_active) return res.status(403).json({ error: 'Organization is suspended' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { access, refresh } = generateTokenPair(user.id, user.org_id, user.role);
    const refreshHash = hashRefreshToken(refresh);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, refreshHash, expiresAt, req.ip, req.headers['user-agent']]
    );

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    res.json({
      accessToken: access,
      refreshToken: refresh,
      user: { id: user.id, email, fullName: user.full_name, role: user.role },
      organization: {
        id: user.org_id,
        name: user.org_name,
        slug: user.slug,
        planType: user.plan_type,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/refresh
 */
const refresh = async (req, res, next) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const payload = jwt.verify(refreshToken, config.jwt.refreshSecret);
    const tokenHash = hashRefreshToken(refreshToken);

    const { rows } = await query(
      `SELECT rt.id, rt.revoked, rt.expires_at, u.id AS user_id, u.role, u.organization_id, u.is_active
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.user_id = $2`,
      [tokenHash, payload.sub]
    );

    if (rows.length === 0 || rows[0].revoked) {
      return res.status(401).json({ error: 'Invalid or revoked refresh token' });
    }

    const stored = rows[0];
    if (new Date(stored.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Refresh token expired' });
    }

    // Token rotation: revoke old, issue new
    await query('UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE id = $1', [stored.id]);

    const { access, refresh: newRefresh } = generateTokenPair(
      stored.user_id,
      stored.organization_id,
      stored.role
    );
    const newHash = hashRefreshToken(newRefresh);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [stored.user_id, newHash, expiresAt, req.ip, req.headers['user-agent']]
    );

    res.json({ accessToken: access, refreshToken: newRefresh });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }
    next(err);
  }
};

/**
 * POST /auth/logout
 */
const logout = async (req, res, next) => {
  const { refreshToken } = req.body;
  try {
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await query(
        'UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE token_hash = $1',
        [tokenHash]
      );
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /auth/me
 */
const me = async (req, res) => {
  const { id, email, role, organization_id, plan_type } = req.user;
  const { rows } = await require('../../config/database').query(
    'SELECT full_name, avatar_url, email_verified FROM users WHERE id = $1',
    [id]
  );
  const u = rows[0] || {};
  res.json({
    id,
    email,
    fullName: u.full_name,
    avatarUrl: u.avatar_url,
    emailVerified: u.email_verified,
    role,
    organizationId: organization_id,
    planType: plan_type,
  });
};

module.exports = { register, login, refresh, logout, me };
