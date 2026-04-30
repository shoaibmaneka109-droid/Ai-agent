/**
 * Subscription Routes
 *
 * GET  /api/v1/orgs/:orgSlug/subscription         — current status + trial info
 * POST /api/v1/orgs/:orgSlug/subscription/cancel  — cancel (owner only)
 * POST /api/v1/webhooks/payment                   — provider webhook (Stripe / Airwallex)
 */
const { Router } = require('express');
const { body }   = require('express-validator');
const crypto     = require('crypto');

const authenticate      = require('../../middleware/authenticate');
const authorize         = require('../../middleware/authorize');
const tenantContext     = require('../../middleware/tenantContext');
const validate          = require('../../middleware/validate');
const { success }       = require('../../utils/apiResponse');
const { buildSubscriptionSnapshot } = require('../../utils/subscription');
const logger            = require('../../utils/logger');

const {
  getSubscriptionStatus,
  activateSubscription,
  cancelSubscription,
  reactivateSubscription,
  checkAndExpireTrial,
} = require('./subscriptions.service');

// ── Tenant-scoped subscription router ────────────────────────────────────────
const tenantRouter = Router({ mergeParams: true });
tenantRouter.use(authenticate, tenantContext);

/**
 * GET /api/v1/orgs/:orgSlug/subscription
 * Returns the full subscription status, trial countdown, and seat info.
 * Available even in hibernation (so users can see what expired).
 */
tenantRouter.get('/', async (req, res, next) => {
  try {
    // Run lazy expiration check
    await checkAndExpireTrial(req.organization.id);

    const org      = await getSubscriptionStatus(req.organization.id);
    const snapshot = buildSubscriptionSnapshot(org);

    success(res, {
      ...snapshot,
      orgType:     org.type,
      orgPlan:     org.plan,
      maxSeats:    org.max_seats,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/orgs/:orgSlug/subscription/cancel
 * Owner-only: cancel the subscription. Org enters Data Hibernation.
 */
tenantRouter.post(
  '/cancel',
  authorize('owner'),
  [body('reason').optional().isString()],
  validate,
  async (req, res, next) => {
    try {
      await cancelSubscription(req.organization.id, req.body.reason);
      const org      = await getSubscriptionStatus(req.organization.id);
      const snapshot = buildSubscriptionSnapshot(org);
      success(res, { message: 'Subscription cancelled.', subscription: snapshot });
    } catch (err) {
      next(err);
    }
  },
);

// ── Webhook router (no auth — verified by signature) ─────────────────────────
const webhookRouter = Router();

/**
 * POST /api/v1/webhooks/payment
 *
 * Handles payment provider webhooks (Stripe / Airwallex).
 * Uses raw body for signature verification.
 *
 * Events handled:
 *   invoice.payment_succeeded  → activateSubscription
 *   customer.subscription.deleted → cancelSubscription
 *   customer.subscription.updated → reactivateSubscription (if back to active)
 */
webhookRouter.post(
  '/payment',
  // Raw body needed for signature verification — express.json() must NOT run first.
  // This route is mounted BEFORE the body-parser middleware in app.js.
  (req, res, next) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      req.rawBody = data;
      next();
    });
  },
  async (req, res) => {
    try {
      const provider  = req.headers['x-payment-provider'] || 'stripe';
      const signature = req.headers['x-webhook-signature'] || req.headers['stripe-signature'];
      const secret    = process.env[`WEBHOOK_SECRET_${provider.toUpperCase()}`];

      // Signature verification (stub — replace with real SDK verification)
      if (secret && signature) {
        const expected = crypto
          .createHmac('sha256', secret)
          .update(req.rawBody)
          .digest('hex');
        const sigValue = signature.startsWith('t=')
          ? signature.split(',').find((p) => p.startsWith('v1='))?.slice(3)
          : signature;

        const sigBuf  = Buffer.from(sigValue    || '', 'hex');
        const expBuf  = Buffer.from(expected, 'hex');

        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
          logger.warn('Webhook signature mismatch', { provider });
          return res.status(400).json({ error: 'Invalid signature' });
        }
      }

      const event = JSON.parse(req.rawBody);
      logger.info('Webhook received', { provider, type: event.type, id: event.id });

      await handleWebhookEvent(provider, event);
      res.json({ received: true });
    } catch (err) {
      logger.error('Webhook error', { error: err.message });
      res.status(400).json({ error: err.message });
    }
  },
);

// ── Webhook event dispatcher ─────────────────────────────────────────────────

async function handleWebhookEvent(provider, event) {
  const { query } = require('../../db/pool');

  switch (event.type) {
    // ── Stripe: payment succeeded ──────────────────────────────────────────
    case 'invoice.payment_succeeded': {
      const sub    = event.data?.object?.subscription;
      const custId = event.data?.object?.customer;
      if (!sub || !custId) break;

      const org = await query(
        'SELECT id FROM organizations WHERE payment_customer_id = $1',
        [custId],
      );
      if (!org.rows.length) {
        logger.warn('Webhook: no org for customer', { custId });
        break;
      }

      const periodEnd = event.data?.object?.lines?.data?.[0]?.period?.end;
      await activateSubscription(org.rows[0].id, {
        plan:                  'professional',
        subscriptionEndsAt:    periodEnd ? new Date(periodEnd * 1000) : null,
        paymentProvider:       provider,
        paymentCustomerId:     custId,
        paymentSubscriptionId: sub,
        providerEventId:       event.id,
      });
      break;
    }

    // ── Stripe: subscription deleted / cancelled ───────────────────────────
    case 'customer.subscription.deleted': {
      const custId = event.data?.object?.customer;
      const org    = await query(
        'SELECT id FROM organizations WHERE payment_customer_id = $1',
        [custId],
      );
      if (org.rows.length) {
        await cancelSubscription(org.rows[0].id, 'Provider subscription deleted');
      }
      break;
    }

    // ── Stripe: subscription resumed / updated ─────────────────────────────
    case 'customer.subscription.updated': {
      const obj    = event.data?.object;
      const status = obj?.status;
      if (status !== 'active') break;

      const custId = obj?.customer;
      const org    = await query(
        'SELECT id FROM organizations WHERE payment_customer_id = $1',
        [custId],
      );
      if (org.rows.length) {
        await reactivateSubscription(org.rows[0].id, {
          subscriptionEndsAt:    obj?.current_period_end ? new Date(obj.current_period_end * 1000) : null,
          paymentSubscriptionId: obj?.id,
        });
      }
      break;
    }

    // ── Airwallex: payment intent succeeded ───────────────────────────────
    case 'payment_intent.succeeded': {
      const meta   = event.data?.metadata || {};
      const orgId  = meta.org_id;
      if (!orgId) break;

      await activateSubscription(orgId, {
        plan:                  meta.plan || 'starter',
        subscriptionEndsAt:    meta.subscription_ends_at ? new Date(meta.subscription_ends_at) : null,
        paymentProvider:       'airwallex',
        paymentCustomerId:     meta.customer_id || null,
        paymentSubscriptionId: event.data?.id || null,
        providerEventId:       event.id,
      });
      break;
    }

    default:
      logger.debug('Unhandled webhook event', { type: event.type });
  }
}

module.exports = { tenantRouter, webhookRouter };
