/**
 * Wise (TransferWise) Connection Adapter
 *
 * Connection test: GET /v1/profiles
 * A successful 200 response confirms the API token is valid and returns
 * the list of Wise profiles (personal/business) linked to the account.
 *
 * Credentials expected:
 *   secretKey          — Wise API token (UUID format)  (required)
 *   extraCredential    — Wise Profile ID               (optional, verified if provided)
 *   webhookSecret      — PEM public key for webhook verification (optional)
 *
 * Wise sandbox base: https://api.sandbox.transferwise.tech
 * Wise live base:    https://api.wise.com
 */
const { get } = require('./httpPing');
const logger = require('../logger');

const BASE_URLS = {
  live: 'https://api.wise.com',
  test: 'https://api.sandbox.transferwise.tech',
};

// Rough UUID validation — Wise API tokens are UUIDs
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const test = async ({ secretKey, extraCredential, environment = 'test' }) => {
  const start = Date.now();

  if (!secretKey) {
    return {
      success: false, latencyMs: 0, httpStatus: null,
      summary: 'API Token is required.',
      errorCode: 'MISSING_KEY',
    };
  }

  if (!UUID_RE.test(secretKey)) {
    return {
      success: false, latencyMs: 0, httpStatus: null,
      summary: 'Invalid token format. Wise API tokens are UUID strings (xxxxxxxx-xxxx-...).',
      errorCode: 'INVALID_KEY_FORMAT',
    };
  }

  const base = BASE_URLS[environment] || BASE_URLS.test;

  try {
    const { status, body, latencyMs } = await get(
      `${base}/v1/profiles`,
      { Authorization: `Bearer ${secretKey}` }
    );

    if (status === 200) {
      let profiles = [];
      try { profiles = JSON.parse(body); } catch {}
      const count = Array.isArray(profiles) ? profiles.length : '?';
      const types = Array.isArray(profiles)
        ? [...new Set(profiles.map((p) => p.type))].join(', ')
        : '—';

      // If caller supplied a profile ID, verify it appears in the list
      if (extraCredential) {
        const found = Array.isArray(profiles) &&
          profiles.some((p) => String(p.id) === String(extraCredential));
        if (!found) {
          return {
            success: false, latencyMs, httpStatus: status,
            summary: `API token valid but Profile ID "${extraCredential}" not found in account. Available: ${count} profile(s).`,
            errorCode: 'PROFILE_ID_MISMATCH',
          };
        }
      }

      return {
        success: true, latencyMs, httpStatus: status,
        summary: `Connected successfully (${environment} mode). Found ${count} profile(s): ${types}.`,
        errorCode: null,
      };
    }

    let errMsg = `Wise API returned HTTP ${status}.`;
    try {
      const parsed = JSON.parse(body);
      if (parsed?.errors?.[0]?.message) errMsg = parsed.errors[0].message;
      else if (parsed?.error_description) errMsg = parsed.error_description;
    } catch {}

    return {
      success: false, latencyMs, httpStatus: status,
      summary: errMsg,
      errorCode: status === 401 ? 'AUTH_FAILED' : 'API_ERROR',
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    logger.warn('Wise connection test error', { message: err.message });
    return {
      success: false, latencyMs, httpStatus: null,
      summary: `Connection error: ${err.message}`,
      errorCode: 'NETWORK_ERROR',
    };
  }
};

module.exports = { test };
