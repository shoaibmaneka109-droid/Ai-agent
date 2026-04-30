/**
 * Webhook endpoints for payment provider callbacks.
 * These routes bypass tenant resolution (no auth header) and validate
 * requests using provider-specific signature verification.
 */
const { Router } = require('express');
const crypto = require('crypto');
const { query } = require('../config/database');
const { getDecryptedKey } = require('../services/apiKey.service');
const paymentService = require('../services/payment.service');
const logger = require('../utils/logger');

const router = Router();

// Stripe webhooks require raw body for signature verification
router.post('/stripe/:tenantId', express.raw({ type: 'application/json' }), async (req, res) => {
  const tenantId = req.params.tenantId;
  const signature = req.headers['stripe-signature'];

  try {
    const { webhookSecret } = await getDecryptedKey(tenantId, 'stripe', 'live');
    if (!webhookSecret) {
      return res.status(400).json({ error: 'No webhook secret configured' });
    }

    // Stripe signature verification
    const parts = signature.split(',');
    const timestamp = parts.find((p) => p.startsWith('t=')).slice(2);
    const v1Sig = parts.find((p) => p.startsWith('v1=')).slice(3);

    const signedPayload = `${timestamp}.${req.body.toString()}`;
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(v1Sig), Buffer.from(expected))) {
      logger.warn(`Invalid Stripe webhook signature for tenant ${tenantId}`);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(req.body.toString());
    await handleStripeEvent(tenantId, event);
    res.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook error:', err);
    res.status(400).json({ error: err.message });
  }
});

async function handleStripeEvent(tenantId, event) {
  const { type, data } = event;
  logger.info(`Stripe webhook: ${type} for tenant ${tenantId}`);

  switch (type) {
    case 'payment_intent.succeeded': {
      const pi = data.object;
      await query(
        `UPDATE payments SET status = 'succeeded', paid_at = NOW(),
         last_webhook_event = $1, last_webhook_at = NOW()
         WHERE tenant_id = $2 AND provider_payment_id = $3`,
        [type, tenantId, pi.id],
      );
      break;
    }
    case 'payment_intent.payment_failed': {
      const pi = data.object;
      await query(
        `UPDATE payments SET status = 'failed', failed_at = NOW(),
         last_webhook_event = $1, last_webhook_at = NOW()
         WHERE tenant_id = $2 AND provider_payment_id = $3`,
        [type, tenantId, pi.id],
      );
      break;
    }
    case 'charge.refunded': {
      const charge = data.object;
      await query(
        `UPDATE payments SET status = 'refunded', last_webhook_event = $1, last_webhook_at = NOW()
         WHERE tenant_id = $2 AND provider_charge_id = $3`,
        [type, tenantId, charge.id],
      );
      break;
    }
    default:
      logger.debug(`Unhandled Stripe event type: ${type}`);
  }
}

// Need to require express for raw body middleware
const express = require('express');

module.exports = router;
