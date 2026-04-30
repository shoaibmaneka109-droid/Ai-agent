const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config    = require('../../config');
const { query, withTransaction } = require('../../db/pool');

const BCRYPT_ROUNDS = 12;

async function register({ email, password, firstName, lastName, orgName, orgType }) {
  return withTransaction(async (client) => {
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) {
      const err = new Error('Email already registered');
      err.statusCode = 409;
      throw err;
    }

    const orgSlug = slugify(orgName);
    const slugCheck = await client.query('SELECT id FROM organizations WHERE slug = $1', [orgSlug]);
    if (slugCheck.rows.length) {
      const err = new Error('Organization name already taken');
      err.statusCode = 409;
      throw err;
    }

    const orgResult = await client.query(
      `INSERT INTO organizations (id, name, slug, type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [uuidv4(), orgName, orgSlug, orgType],
    );
    const org = orgResult.rows[0];

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const userResult = await client.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6, 'owner')
       RETURNING id, email, first_name, last_name, role, created_at`,
      [uuidv4(), org.id, email.toLowerCase(), passwordHash, firstName, lastName],
    );

    const user = userResult.rows[0];
    return { user, org };
  });
}

async function login({ email, password }) {
  const result = await query(
    `SELECT u.id, u.email, u.password_hash, u.role, u.is_active, u.first_name, u.last_name,
            o.id AS org_id, o.slug AS org_slug, o.plan AS org_plan, o.is_active AS org_active
     FROM   users u
     JOIN   organizations o ON o.id = u.organization_id
     WHERE  u.email = $1`,
    [email.toLowerCase()],
  );

  if (!result.rows.length) {
    throw loginError();
  }

  const user = result.rows[0];

  if (!user.is_active) {
    const err = new Error('Account is disabled');
    err.statusCode = 403;
    throw err;
  }

  if (!user.org_active) {
    const err = new Error('Organization is suspended');
    err.statusCode = 403;
    throw err;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw loginError();

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  const accessToken  = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user);

  return { accessToken, refreshToken, user: publicUser(user) };
}

async function refreshAccessToken(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    throw err;
  }

  const result = await query(
    `SELECT u.id, u.email, u.role, u.is_active, u.first_name, u.last_name,
            o.id AS org_id, o.slug AS org_slug, o.plan AS org_plan, o.is_active AS org_active
     FROM   users u
     JOIN   organizations o ON o.id = u.organization_id
     WHERE  u.id = $1`,
    [payload.sub],
  );

  if (!result.rows.length || !result.rows[0].is_active) {
    const err = new Error('User not found or inactive');
    err.statusCode = 401;
    throw err;
  }

  return { accessToken: issueAccessToken(result.rows[0]) };
}

// ---------- helpers ----------

function issueAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, org: user.org_id || user.organization_id },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
}

function issueRefreshToken(user) {
  return jwt.sign(
    { sub: user.id },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn },
  );
}

function loginError() {
  const err = new Error('Invalid email or password');
  err.statusCode = 401;
  return err;
}

function publicUser(user) {
  return {
    id:        user.id,
    email:     user.email,
    firstName: user.first_name,
    lastName:  user.last_name,
    role:      user.role,
    orgId:     user.org_id,
    orgSlug:   user.org_slug,
    orgPlan:   user.org_plan,
  };
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { register, login, refreshAccessToken };
