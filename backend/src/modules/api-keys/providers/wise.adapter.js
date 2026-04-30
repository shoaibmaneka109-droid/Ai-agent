/**
 * Wise (TransferWise) Connection Test Adapter
 *
 * Wise Personal/Business API:
 *   GET /v1/profiles — returns the user's profiles list.
 *   Requires: Authorization: Bearer <api_token>
 *
 * Wise Sandbox: api.sandbox.transferwise.tech
 * Wise Live:    api.wise.com
 */
const fetch = require('node-fetch');

const LIVE_URL    = 'https://api.wise.com/v1/profiles';
const SANDBOX_URL = 'https://api.sandbox.transferwise.tech/v1/profiles';
const TIMEOUT     = 8000;

async function testConnection({ secretKey, environment = 'live' }) {
  const url        = environment === 'sandbox' ? SANDBOX_URL : LIVE_URL;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ([]));

    if (res.status === 200) {
      const profileCount = Array.isArray(body) ? body.length : 1;
      const personal     = body.find?.((p) => p.type === 'PERSONAL');
      const business     = body.find?.((p) => p.type === 'BUSINESS');
      return {
        success: true,
        message: `Connected to Wise${environment === 'sandbox' ? ' (Sandbox)' : ''} — ${profileCount} profile(s) found.`,
        httpStatus: 200,
        detail: {
          profileCount,
          hasPersonal: !!personal,
          hasBusiness: !!business,
        },
      };
    }

    if (res.status === 401) {
      return {
        success: false,
        message: 'Authentication failed — check your Wise API token.',
        httpStatus: 401,
        detail: {},
      };
    }

    return {
      success: false,
      message: `Wise returned HTTP ${res.status}.`,
      httpStatus: res.status,
      detail: {},
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
