const { query, withTransaction } = require('../../config/database');
const { parsePagination, buildPaginationMeta } = require('../../shared/utils/pagination');

const getOrganization = async (organizationId) => {
  const result = await query(
    `SELECT id, name, slug, type, plan, is_active, settings, created_at, updated_at
     FROM organizations
     WHERE id = $1`,
    [organizationId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Organization not found');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
};

const updateOrganization = async (organizationId, { name, settings }) => {
  const result = await query(
    `UPDATE organizations
     SET name = COALESCE($1, name),
         settings = COALESCE($2, settings),
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, name, slug, type, plan, is_active, settings, updated_at`,
    [name || null, settings ? JSON.stringify(settings) : null, organizationId]
  );

  return result.rows[0];
};

const listMembers = async (organizationId, queryParams) => {
  const { limit, offset, page } = parsePagination(queryParams);

  const [membersResult, countResult] = await Promise.all([
    query(
      `SELECT id, email, first_name, last_name, role, is_active, last_login_at, created_at
       FROM users
       WHERE organization_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset]
    ),
    query('SELECT COUNT(*) FROM users WHERE organization_id = $1', [organizationId]),
  ]);

  const total = parseInt(countResult.rows[0].count, 10);
  return {
    members: membersResult.rows,
    meta: buildPaginationMeta(total, { page, limit }),
  };
};

const inviteMember = async (organizationId, { email, role, invitedById }) => {
  return withTransaction(async (client) => {
    const validRoles = ['admin', 'member'];
    if (!validRoles.includes(role)) {
      const err = new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1 AND organization_id = $2',
      [email.toLowerCase(), organizationId]
    );
    if (existing.rows.length > 0) {
      const err = new Error('User already belongs to this organization');
      err.statusCode = 409;
      throw err;
    }

    const result = await client.query(
      `INSERT INTO organization_invitations (organization_id, email, role, invited_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, email)
       DO UPDATE SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by,
                     expires_at = NOW() + INTERVAL '7 days', accepted_at = NULL
       RETURNING id, email, role, created_at, expires_at`,
      [organizationId, email.toLowerCase(), role, invitedById]
    );

    return result.rows[0];
  });
};

const updateMemberRole = async (organizationId, targetUserId, role, requestingUserId) => {
  if (targetUserId === requestingUserId) {
    const err = new Error('You cannot change your own role');
    err.statusCode = 400;
    throw err;
  }

  const result = await query(
    `UPDATE users SET role = $1, updated_at = NOW()
     WHERE id = $2 AND organization_id = $3 AND role != 'owner'
     RETURNING id, email, first_name, last_name, role`,
    [role, targetUserId, organizationId]
  );

  if (result.rows.length === 0) {
    const err = new Error('Member not found or cannot modify owner role');
    err.statusCode = 404;
    throw err;
  }

  return result.rows[0];
};

module.exports = { getOrganization, updateOrganization, listMembers, inviteMember, updateMemberRole };
