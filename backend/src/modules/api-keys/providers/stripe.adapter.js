/**
 * Stripe Connection Test Adapter
 *
 * Pings GET /v1/balance — the simplest authenticated Stripe endpoint.
 * Returns a standardised TestResult object.
 *
 * Stripe uses HTTP Basic Auth: secret key as username, empty password.
 * Or equivalently: Authorization: Bearer sk_live_...
 */
const fetch = require('node-fetch');

const TEST_URL = 'https://api.stripe.com/v1/balance';
const TIMEOUT  = 8000;

async function testConnection({ secretKey }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(TEST_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Version': '2024-04-10',
      },
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));

    if (res.status === 200) {
      const currency = body.available?.[0]?.currency?.toUpperCase() || '';
      return {
        success: true,
        message: `Connected — live balance available${currency ? ` (${currency})` : ''}.`,
        httpStatus: 200,
        detail: {
          accountCurrency: currency,
          livemode: !secretKey.startsWith('sk_test'),
        },
      };
    }

    if (res.status === 401) {
      return {
        success: false,
        message: 'Authentication failed — check your Stripe secret key.',
        httpStatus: 401,
        detail: { error: body.error?.message },
      };
    }

    if (res.status === 403) {
      return {
        success: false,
        message: 'Access denied — this key may lack read permissions.',
        httpStatus: 403,
        detail: { error: body.error?.message },
      };
    }

    return {
      success: false,
      message: `Stripe returned HTTP ${res.status}.`,
      httpStatus: res.status,
      detail: { error: body.error?.message },
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Connection timed out (8 s).', httpStatus: null, detail: {} };
    }
    return { success: false, message: `Network error: ${err.message}`, httpStatus: null, detail: {} };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { testConnection };
