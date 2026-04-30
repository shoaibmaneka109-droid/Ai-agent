const { query } = require('../db/pool');
const { notFound, error } = require('../utils/apiResponse');

/**
 * Resolves the :orgSlug route parameter to a full organization row
 * and attaches it to req.organization.
 *
 * Also enforces that the authenticated user belongs to that organization
 * (unless the user has the 'superadmin' role).
 */
async function tenantContext(req, res, next) {
  const slug = req.params.orgSlug;
  if (!slug) return next();

  const result = await query(
    'SELECT * FROM organizations WHERE slug = $1',
    [slug],
  );

  if (!result.rows.length) {
    return notFound(res, 'Organization');
  }

  const org = result.rows[0];

  if (!org.is_active) {
    return error(res, 'Organization is suspended', 403);
  }

  if (req.user && req.user.role !== 'superadmin') {
    if (req.user.organization_id !== org.id) {
      return notFound(res, 'Organization');
    }
  }

  req.organization = org;
  next();
}

module.exports = tenantContext;
