/**
 * PayPal Connection Test Adapter
 *
 * PayPal uses OAuth2 client-credentials:
 *   POST /v1/oauth2/token  (HTTP Basic: clientId:clientSecret)
 *   → returns { access_token, token_type, app_id, expires_in, scope }
 *
 * A successful token issuance confirms credentials are valid.
 */
const fetch = require('node-fetch');

const LIVE_URL    = 'https://api-m.paypal.com/v1/oauth2/token';
const SANDBOX_URL = 'https://api-m.sandbox.paypal.com/v1/oauth2/token';
const TIMEOUT     = 10000;

async function testConnection({ secretKey, clientId, environment = 'live' }) {
  if (!clientId) {
    return {
      success: false,
      message: 'PayPal requires both a Client ID and a Client Secret.',
      httpStatus: null,
      detail: {},
    };
  }

  const url      = environment === 'sandbox' ? SANDBOX_URL : LIVE_URL;
  const creds    = Buffer.from(`${clientId}:${secretKey}`).toString('base64');
  const controller = new AbortController();
  const timer    = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization:  `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));

    if (res.status === 200 && body.access_token) {
      return {
        success: true,
        message: `Connected to PayPal${environment === 'sandbox' ? ' (Sandbox)' : ''} — token issued.`,
        httpStatus: 200,
        detail: {
          appId:    body.app_id,
          tokenType: body.token_type,
          scope:    body.scope?.split(' ').slice(0, 3).join(', '),
        },
      };
    }

    if (res.status === 401) {
      return {
        success: false,
        message: 'Authentication failed — check your PayPal Client ID and Secret.',
        httpStatus: 401,
        detail: { error: body.error_description },
      };
    }

    return {
      success: false,
      message: `PayPal returned HTTP ${res.status}.`,
      httpStatus: res.status,
      detail: { error: body.error_description || body.message },
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
