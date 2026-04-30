const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../config/database');
const { getSubscriptionContext } = require('../services/subscription');
const logger = require('../services/logger');

/**
 * Verifies the Bearer JWT, loads the user + org record, and attaches the
 * full subscription context to req.subscription. Every downstream middleware
 * (subscriptionGuard, tenantContext) can trust both req.user and req.subscription.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.secret);

    const result = await query(
      `SELECT u.id, u.email, u.role, u.organization_id, u.is_active,
              o.plan_type, o.is_active AS org_active, o.subscription_status
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.id = $1`,
      [payload.sub]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }
    if (!user.org_active) {
      return res.status(403).json({ error: 'Organization is suspended' });
    }

    req.user = user;
    req.orgId = user.organization_id;

    // Attach the full subscription context so guards don't need extra DB round-trips
    req.subscription = await getSubscriptionContext(user.organization_id);

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    logger.warn('JWT verification failed', { error: err.message });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

const requireOrgPlan = (...plans) => (req, res, next) => {
  if (!req.user || !plans.includes(req.user.plan_type)) {
    return res.status(403).json({ error: 'Feature not available on your current plan' });
  }
  next();
};

module.exports = { authenticate, requireRole, requireOrgPlan };
