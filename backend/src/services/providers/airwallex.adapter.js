/**
 * Airwallex Connection Adapter
 *
 * Connection test: POST /api/v1/authentication/login
 * Airwallex uses a client-credentials-style flow where you exchange
 * (client_id, api_key) for a short-lived JWT.  A 201 response with a
 * token confirms both credentials are valid.
 *
 * Credentials expected:
 *   secretKey          — Airwallex API Key  (required)
 *   extraCredential    — Airwallex Client ID (required for auth)
 *   webhookSecret      — Webhook secret     (optional, stored encrypted)
 */
const { post } = require('./httpPing');
const logger = require('../logger');

// Airwallex environments
const BASE_URLS = {
  live: 'https://api.airwallex.com',
  test: 'https://api-demo.airwallex.com',
};

const test = async ({ secretKey, extraCredential, webhookSecret, environment = 'test' }) => {
  const start = Date.now();

  if (!secretKey) {
    return {
      success: false, latencyMs: 0, httpStatus: null,
      summary: 'API Key is required.',
      errorCode: 'MISSING_KEY',
    };
  }

  const base = BASE_URLS[environment] || BASE_URLS.test;
  const headers = {
    'x-client-id': extraCredential || '',
    'x-api-key': secretKey,
  };

  try {
    const { status, body, latencyMs } = await post(
      `${base}/api/v1/authentication/login`,
      {},
      headers
    );

    if (status === 201 || status === 200) {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch {}
      const accountId = parsed?.account_id || '(unknown)';
      return {
        success: true, latencyMs, httpStatus: status,
        summary: `Connected successfully (${environment} mode). Account: ${accountId}.`,
        errorCode: null,
      };
    }

    let errMsg = `Airwallex API returned HTTP ${status}.`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.message) errMsg = parsed.message;
      else if (parsed?.error) errMsg = parsed.error;
    } catch {}

    return {
      success: false, latencyMs, httpStatus: status,
      summary: errMsg,
      errorCode: status === 401 || status === 403 ? 'AUTH_FAILED' : 'API_ERROR',
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.warn('Airwallex connection test error', { message: err.message });
    return {
      success: false, latencyMs, httpStatus: null,
      summary: `Connection error: ${err.message}`,
      errorCode: 'NETWORK_ERROR',
    };
  }
};

module.exports = { test };
