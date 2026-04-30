/**
 * Autofill API
 *
 * The autofill feature allows the SecurePay browser extension / SDK to
 * pre-populate payment forms using stored provider credentials.
 *
 * Access control:
 *   - Requires a valid JWT session (authenticate)
 *   - Requires active or trialing subscription (requireAutofillAccess)
 *   - Hibernated / unpaid / cancelled tenants receive 402 FEATURE_LOCKED
 *
 * Every blocked attempt is logged to access_denied_log for audit purposes.
 */

const { Router } = require('express');
const { body } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { resolveTenant, enforceTenantScope } = require('../middleware/tenant.middleware');
const {
  attachAccessState,
  injectTrialHeaders,
  requireAutofillAccess,
} = require('../middleware/subscription.middleware');
const { getDecryptedKey } = require('../services/apiKey.service');
const { success } = require('../utils/apiResponse');
const validate = require('../middleware/validate.middleware');
const logger = require('../utils/logger');

const router = Router();

// Auth + tenant scope + access gate on every autofill route
router.use(
  authenticate,
  resolveTenant,
  enforceTenantScope,
  attachAccessState,
  injectTrialHeaders,
  requireAutofillAccess,   // 402 if hibernated / locked
);

/**
 * POST /api/v1/autofill/token
 *
 * Issues a short-lived, provider-specific token for the autofill SDK.
 * Returns the publishable key (safe for the client) plus a session
 * reference; the secret key NEVER leaves the server.
 *
 * Body: { provider: 'stripe'|'airwallex', environment: 'live'|'sandbox' }
 */
router.post(
  '/token',
  authorize('owner', 'admin', 'member'),
  [
    body('provider').isIn(['stripe', 'airwallex', 'custom']).withMessage('Invalid provider'),
    body('environment').isIn(['live', 'sandbox']).withMessage('Invalid environment'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { provider, environment } = req.body;

      // Verify that an active key exists; secret is fetched server-side only
      const { secretKey } = await getDecryptedKey(req.tenant.id, provider, environment);

      // In a real integration you'd use the secretKey to create a short-lived
      // client secret (e.g., Stripe PaymentIntent client_secret) and return THAT.
      // We do NOT return the secretKey to the client.

      logger.info(`Autofill token issued for tenant ${req.tenant.id} (${provider}/${environment})`);

      return success(res, {
        provider,
        environment,
        // Placeholder: in production this would be a provider-issued ephemeral token
        sessionToken: `autofill_${Buffer.from(`${req.tenant.id}:${provider}:${Date.now()}`).toString('base64url')}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min
      }, 'Autofill session token issued');
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/autofill/config
 *
 * Returns the non-sensitive autofill configuration for the SDK:
 * publishable keys, supported providers, environment.
 * No secret keys are ever returned here.
 */
router.get('/config', async (req, res, next) => {
  try {
    const { query } = require('../config/database');
    const { rows } = await query(
      `SELECT id, provider, environment, publishable_key, label, last_used_at
       FROM api_keys
       WHERE tenant_id = $1 AND is_active = TRUE
       ORDER BY environment DESC, provider ASC`,
      [req.tenant.id],
    );

    return success(res, {
      tenantId: req.tenant.id,
      plan: req.tenant.plan,
      providers: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        environment: r.environment,
        publishableKey: r.publishable_key,
        label: r.label,
        lastUsedAt: r.last_used_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
