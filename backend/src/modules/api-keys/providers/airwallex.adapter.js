/**
 * Airwallex Connection Test Adapter
 *
 * Airwallex uses a 2-step flow:
 *   POST /api/v1/authentication/login  { client_id, api_key }
 *   → returns { token, expires_at }
 *
 * We treat a successful token issuance as "connection verified".
 * We never persist or return the token — it's only used for the test.
 */
const fetch = require('node-fetch');

const LOGIN_URL  = 'https://api.airwallex.com/api/v1/authentication/login';
const DEMO_URL   = 'https://api-demo.airwallex.com/api/v1/authentication/login';
const TIMEOUT    = 10000;

async function testConnection({ secretKey, clientId, environment = 'live' }) {
  if (!clientId) {
    return {
      success: false,
      message: 'Airwallex requires both a Client ID and an API Key.',
      httpStatus: null,
      detail: {},
    };
  }

  const url        = environment === 'sandbox' ? DEMO_URL : LOGIN_URL;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': clientId,
        'x-api-key':   secretKey,
      },
      body: '{}',
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));

    if (res.status === 201 && body.token) {
      return {
        success: true,
        message: `Connected to Airwallex${environment === 'sandbox' ? ' (Demo)' : ''} — token issued successfully.`,
        httpStatus: 201,
        detail: {
          tokenExpiresAt: body.expires_at,
          environment,
        },
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        message: 'Authentication failed — check your Airwallex Client ID and API Key.',
        httpStatus: res.status,
        detail: { error: body.message || body.error },
      };
    }

    return {
      success: false,
      message: `Airwallex returned HTTP ${res.status}.`,
      httpStatus: res.status,
      detail: { raw: JSON.stringify(body).slice(0, 200) },
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { success: false, message: 'Connection timed out (10 s).', httpStatus: null, detail: {} };
    }
    return { success: false, message: `Network error: ${err.message}`, httpStatus: null, detail: {} };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { testConnection };
