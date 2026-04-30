/**
 * Tenant isolation middleware.
 * Ensures every authenticated request is scoped to the user's organization.
 * Sets PostgreSQL session variable app.current_org_id for row-level security.
 */
const { getClient } = require('../config/database');
const logger = require('../services/logger');

const tenantContext = async (req, res, next) => {
  if (!req.user || !req.user.organization_id) {
    return res.status(401).json({ error: 'Tenant context unavailable' });
  }

  req.orgId = req.user.organization_id;
  next();
};

/**
 * Higher-order helper: wraps a handler to execute within a tenant-scoped DB client
 * that has the RLS session variable set. Use this for DB operations needing RLS.
 */
const withTenantClient = (handler) => async (req, res, next) => {
  const client = await getClient();
  try {
    await client.query(`SET LOCAL app.current_org_id = '${req.orgId}'`);
    req.dbClient = client;
    await handler(req, res, next);
  } catch (err) {
    logger.error('Tenant context DB error', { error: err.message, orgId: req.orgId });
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { tenantContext, withTenantClient };
