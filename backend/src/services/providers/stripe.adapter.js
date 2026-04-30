/**
 * Stripe Connection Adapter
 *
 * Connection test: GET /v1/balance
 * A successful response (HTTP 200) confirms the secret key is valid and
 * the account has balance-read permission. The balance object also tells
 * us whether the account is in live or test mode.
 *
 * Credentials expected:
 *   secretKey       — sk_live_... or sk_test_...  (required)
 *   publishableKey  — pk_live_... or pk_test_...  (optional, validated by prefix)
 *   webhookSecret   — whsec_...                   (optional, verified by prefix)
 */
const { get } = require('./httpPing');
const logger = require('../logger');

const test = async ({ secretKey, publishableKey, webhookSecret }) => {
  const start = Date.now();

  // ── Client-side validation ────────────────────────────────────────────────
  if (!secretKey || !secretKey.startsWith('sk_')) {
    return {
      success: false, latencyMs: 0, httpStatus: null,
      summary: 'Invalid secret key format. Stripe secret keys start with "sk_".',
      errorCode: 'INVALID_KEY_FORMAT',
    };
  }

  if (publishableKey && !publishableKey.startsWith('pk_')) {
    return {
      success: false, latencyMs: 0, httpStatus: null,
      summary: 'Invalid publishable key format. Stripe publishable keys start with "pk_".',
      errorCode: 'INVALID_PUBLISHABLE_KEY_FORMAT',
    };
  }

  if (webhookSecret && !webhookSecret.startsWith('whsec_')) {
    return {
      success: false, latencyMs: 0, httpStatus: null,
      summary: 'Invalid webhook secret format. Stripe webhook secrets start with "whsec_".',
      errorCode: 'INVALID_WEBHOOK_SECRET_FORMAT',
    };
  }

  // ── Live API ping ─────────────────────────────────────────────────────────
  try {
    const { status, body, latencyMs } = await get(
      'https://api.stripe.com/v1/balance',
      { Authorization: `Bearer ${secretKey}` }
    );

    if (status === 200) {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch {}
      const mode = secretKey.startsWith('sk_live_') ? 'live' : 'test';
      const currency = parsed?.available?.[0]?.currency?.toUpperCase() || '—';
      return {
        success: true, latencyMs, httpStatus: status,
        summary: `Connected successfully (${mode} mode). Account currency: ${currency}.`,
        errorCode: null,
      };
    }

    let errMsg = `Stripe API returned HTTP ${status}.`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.error?.message) errMsg = parsed.error.message;
    } catch {}

    return {
      success: false, latencyMs, httpStatus: status,
      summary: errMsg,
      errorCode: status === 401 ? 'AUTH_FAILED' : 'API_ERROR',
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.warn('Stripe connection test error', { message: err.message });
    return {
      success: false, latencyMs, httpStatus: null,
      summary: `Connection error: ${err.message}`,
      errorCode: 'NETWORK_ERROR',
    };
  }
};

module.exports = { test };
