/**
 * Subscription / Trial Access Middleware
 *
 * Three middleware functions used as route guards:
 *
 *   requireApiAccess      — blocks API-facing actions when hibernated/cancelled/unpaid
 *   requireAutofillAccess — blocks autofill when hibernated/cancelled/unpaid
 *   requireFullAccess     — general "active subscription" gate (write operations)
 *   enforceTeamLimit      — checked before adding a new team member
 *   attachAccessState     — lightweight, non-blocking; attaches req.access for informational use
 *
 * Data-read-only mode: user CAN log in and view data; the blocked features are:
 *   - API key usage / retrieval for payment processing
 *   - Autofill endpoint
 *   - Creating payments
 *   - Adding team members (beyond trial cap)
 *
 * The response format for blocked requests always includes:
 *   { success: false, code: 'FEATURE_LOCKED', reason, accessStatus, subscriptionUrl }
 */

const { query } = require('../config/database');
const { computeAccess } = require('../services/trial.service');
const logger = require('../utils/logger');

const SUBSCRIPTION_PORTAL = process.env.FRONTEND_URL
  ? `${process.env.FRONTEND_URL}/settings/subscription`
  : '/settings/subscription';

// ─── Core: load subscription and compute access ───────────────────────────────

async function loadAccess(tenantId) {
  const { rows } = await query(
    `SELECT s.*, sp.plan_type
     FROM subscriptions s
     JOIN subscription_plans sp ON sp.id = s.plan_id
     WHERE s.tenant_id = $1`,
    [tenantId],
  );
  return computeAccess(rows[0] || null);
}

// ─── attachAccessState ────────────────────────────────────────────────────────
/**
 * Non-blocking middleware. Attaches req.access to every protected request so
 * controllers/frontend can read trial warnings without an extra API call.
 *
 * Must run AFTER authenticate + resolveTenant.
 */
async function attachAccessState(req, res, next) {
  try {
    req.access = await loadAccess(req.tenant.id);
  } catch (err) {
    // Non-fatal: log and proceed without access info
    logger.warn('attachAccessState: could not load subscription', err.message);
    req.access = { apiAccess: true, autofillAccess: true, dataReadOnly: false, accessStatus: 'unknown', reason: null };
  }
  next();
}

// ─── Reusable block helper ────────────────────────────────────────────────────

function featureLocked(res, reason, accessStatus) {
  return res.status(402).json({
    success: false,
    code: 'FEATURE_LOCKED',
    reason,
    accessStatus,
    subscriptionUrl: SUBSCRIPTION_PORTAL,
  });
}

// ─── requireApiAccess ─────────────────────────────────────────────────────────
/**
 * Blocks payment-processing and API key retrieval when the account is
 * hibernated, cancelled, or unpaid. Grace period users pass through.
 */
async function requireApiAccess(req, res, next) {
  try {
    const access = req.access || (await loadAccess(req.tenant.id));
    if (!access.apiAccess) {
      // Log the denied attempt
      await query(
        `INSERT INTO access_denied_log (tenant_id, user_id, feature, reason, ip_address)
         VALUES ($1, $2, 'api_access', $3, $4)`,
        [req.tenant.id, req.user?.id || null, access.accessStatus, req.ip],
      ).catch(() => {});
      return featureLocked(res, access.reason, access.accessStatus);
    }
    next();
  } catch (err) {
    next(err);
  }
}

// ─── requireAutofillAccess ────────────────────────────────────────────────────
async function requireAutofillAccess(req, res, next) {
  try {
    const access = req.access || (await loadAccess(req.tenant.id));
    if (!access.autofillAccess) {
      await query(
        `INSERT INTO access_denied_log (tenant_id, user_id, feature, reason, ip_address)
         VALUES ($1, $2, 'autofill', $3, $4)`,
        [req.tenant.id, req.user?.id || null, access.accessStatus, req.ip],
      ).catch(() => {});
      return featureLocked(res, access.reason, access.accessStatus);
    }
    next();
  } catch (err) {
    next(err);
  }
}

// ─── requireFullAccess ────────────────────────────────────────────────────────
/**
 * Strongest gate. Blocks all write operations (create payment, add member, etc.)
 * when the account is NOT in 'full' or 'grace' or 'past_due' state.
 */
async function requireFullAccess(req, res, next) {
  try {
    const access = req.access || (await loadAccess(req.tenant.id));
    const allowed = ['full', 'grace', 'past_due'].includes(access.accessStatus);
    if (!allowed) {
      return featureLocked(res, access.reason, access.accessStatus);
    }
    next();
  } catch (err) {
    next(err);
  }
}

// ─── enforceTeamLimit ─────────────────────────────────────────────────────────
/**
 * Checks the agency trial employee cap before adding a team member.
 * Must run AFTER authenticate + resolveTenant.
 */
async function enforceTeamLimit(req, res, next) {
  try {
    const { checkTeamLimit } = require('../services/trial.service');
    const result = await checkTeamLimit(req.tenant.id);
    if (!result.allowed) {
      return res.status(402).json({
        success: false,
        code: 'TEAM_LIMIT_REACHED',
        reason: result.reason,
        cap: result.cap,
        current: result.current,
        subscriptionUrl: SUBSCRIPTION_PORTAL,
      });
    }
    // Attach for downstream use
    req.teamLimit = result;
    next();
  } catch (err) {
    next(err);
  }
}

// ─── trialWarning header injector ─────────────────────────────────────────────
/**
 * Injects X-Trial-* headers so the frontend can display warnings
 * without a separate API call. Runs after attachAccessState.
 */
function injectTrialHeaders(req, res, next) {
  const access = req.access;
  if (!access) return next();

  res.setHeader('X-Access-Status', access.accessStatus);
  if (access.reason) res.setHeader('X-Access-Reason', access.reason);
  if (access.accessStatus === 'grace') res.setHeader('X-In-Grace-Period', 'true');
  if (access.dataReadOnly) res.setHeader('X-Data-Read-Only', 'true');
  next();
}

module.exports = {
  attachAccessState,
  requireApiAccess,
  requireAutofillAccess,
  requireFullAccess,
  enforceTeamLimit,
  injectTrialHeaders,
};
