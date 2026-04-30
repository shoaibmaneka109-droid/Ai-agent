/**
 * Connection Test Service
 *
 * Pings each payment provider's API using the stored credentials
 * and returns a structured result. Uses the built-in `https` module
 * so no additional SDK dependencies are required.
 *
 * Each provider tester:
 *  - Makes a lightweight, read-only API call (list / retrieve account info)
 *  - Returns { ok, message, latencyMs, detail }
 *  - Never throws — errors are caught and returned as failed results
 */

const https = require('https');
const http = require('http');

/**
 * Perform an HTTP(S) request and return the parsed response.
 * Resolves with { statusCode, body, latencyMs }.
 */
const httpRequest = ({ hostname, path, method = 'GET', headers = {}, body = null, port = 443 }) => {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const lib = port === 443 ? https : http;

    const options = { hostname, path, method, port, headers };
    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const latencyMs = Date.now() - start;
        let parsed = null;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ statusCode: res.statusCode, body: parsed, latencyMs });
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timed out after 10s'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

// ─── Provider Testers ─────────────────────────────────────────────────────────

/**
 * Stripe: GET /v1/balance — requires secret key, returns live/test mode flag.
 * https://stripe.com/docs/api/balance/balance_retrieve
 */
const testStripe = async ({ secretKey, publicKey }) => {
  const keyPrefix = secretKey?.split('_')[1] ?? '';
  const expectedMode = keyPrefix === 'live' ? 'live' : 'test';

  const { statusCode, body, latencyMs } = await httpRequest({
    hostname: 'api.stripe.com',
    path: '/v1/balance',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'User-Agent': 'SecurePay/1.0',
    },
  });

  if (statusCode === 200) {
    const available = body?.available?.[0];
    const currency = available?.currency?.toUpperCase() ?? 'N/A';
    const livemode = body?.livemode === true ? 'live' : 'test';
    return {
      ok: true,
      message: `Connected (${livemode} mode). Balance currency: ${currency}.`,
      latencyMs,
      detail: {
        livemode: body?.livemode,
        currency,
        keyMode: expectedMode,
        modeMatch: livemode === expectedMode,
      },
    };
  }

  if (statusCode === 401) {
    return {
      ok: false,
      message: 'Authentication failed. Check that the Secret Key is correct.',
      latencyMs,
      detail: { statusCode, stripeError: body?.error?.message },
    };
  }

  return {
    ok: false,
    message: `Stripe returned unexpected status ${statusCode}.`,
    latencyMs,
    detail: { statusCode, body },
  };
};

/**
 * Airwallex: POST /api/v1/authentication/login — returns JWT on success.
 * https://www.airwallex.com/docs/api#/Authentication/Authentication/post-api-v1-authentication-login
 */
const testAirwallex = async ({ secretKey, publicKey, extraConfig = {} }) => {
  const clientId = publicKey || extraConfig?.clientId;
  if (!clientId) {
    return {
      ok: false,
      message: 'Airwallex requires both a Client ID (public key) and API Key (secret key).',
      latencyMs: 0,
      detail: { hint: 'Set publicKey to your Airwallex Client ID.' },
    };
  }

  const { statusCode, body, latencyMs } = await httpRequest({
    hostname: 'api.airwallex.com',
    path: '/api/v1/authentication/login',
    method: 'POST',
    headers: {
      'x-client-id': clientId,
      'x-api-key': secretKey,
    },
  });

  if (statusCode === 201 && body?.token) {
    const expires = body?.expires_at
      ? new Date(body.expires_at).toISOString()
      : 'N/A';
    return {
      ok: true,
      message: `Connected. Token issued, expires at ${expires}.`,
      latencyMs,
      detail: { tokenExpiresAt: body?.expires_at },
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      ok: false,
      message: 'Authentication failed. Verify your Client ID and API Key.',
      latencyMs,
      detail: { statusCode, message: body?.message },
    };
  }

  return {
    ok: false,
    message: `Airwallex returned unexpected status ${statusCode}.`,
    latencyMs,
    detail: { statusCode, body },
  };
};

/**
 * Wise (TransferWise): GET /v1/profiles — returns list of business/personal profiles.
 * https://docs.wise.com/api-docs/api-reference/profile
 */
const testWise = async ({ secretKey, extraConfig = {} }) => {
  const isSandbox = extraConfig?.sandbox === true;
  const hostname = isSandbox ? 'api.sandbox.transferwise.tech' : 'api.transferwise.com';

  const { statusCode, body, latencyMs } = await httpRequest({
    hostname,
    path: '/v1/profiles',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'User-Agent': 'SecurePay/1.0',
    },
  });

  if (statusCode === 200 && Array.isArray(body)) {
    const profile = body[0];
    const profileType = profile?.type ?? 'unknown';
    const profileId = profile?.id ?? 'N/A';
    return {
      ok: true,
      message: `Connected${isSandbox ? ' (sandbox)' : ''}. Profile: ${profileType} (id: ${profileId}).`,
      latencyMs,
      detail: {
        profileCount: body.length,
        firstProfileType: profileType,
        firstProfileId: profileId,
        sandbox: isSandbox,
      },
    };
  }

  if (statusCode === 401) {
    return {
      ok: false,
      message: 'Authentication failed. Check your Wise API token.',
      latencyMs,
      detail: { statusCode },
    };
  }

  return {
    ok: false,
    message: `Wise returned unexpected status ${statusCode}.`,
    latencyMs,
    detail: { statusCode, body },
  };
};

/**
 * Custom provider — basic HTTPS reachability check against a configured endpoint.
 */
const testCustom = async ({ secretKey, extraConfig = {} }) => {
  const endpoint = extraConfig?.testEndpoint;
  if (!endpoint) {
    return {
      ok: false,
      message: 'Custom provider requires a testEndpoint in extra_config.',
      latencyMs: 0,
      detail: { hint: 'Add { "testEndpoint": "https://api.example.com/health" } to extra_config.' },
    };
  }

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return {
      ok: false,
      message: `Invalid testEndpoint URL: ${endpoint}`,
      latencyMs: 0,
      detail: {},
    };
  }

  const headers = { 'User-Agent': 'SecurePay/1.0' };
  if (secretKey) headers['Authorization'] = `Bearer ${secretKey}`;

  const { statusCode, latencyMs } = await httpRequest({
    hostname: url.hostname,
    path: url.pathname + url.search,
    port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
    headers,
  });

  const ok = statusCode >= 200 && statusCode < 300;
  return {
    ok,
    message: ok
      ? `Endpoint reachable (HTTP ${statusCode}).`
      : `Endpoint returned HTTP ${statusCode}.`,
    latencyMs,
    detail: { statusCode, endpoint },
  };
};

// ─── Provider dispatch map ────────────────────────────────────────────────────

const TESTERS = {
  stripe: testStripe,
  airwallex: testAirwallex,
  wise: testWise,
  custom: testCustom,
};

/**
 * Run a connection test for a decrypted key config.
 * Returns a normalised result object — never throws.
 *
 * @param {string} provider
 * @param {{ secretKey, publicKey, webhookSecret, extraConfig }} credentials
 * @returns {{ ok, message, latencyMs, detail }}
 */
const runConnectionTest = async (provider, credentials) => {
  const tester = TESTERS[provider];
  if (!tester) {
    return {
      ok: false,
      message: `No connection tester available for provider: ${provider}`,
      latencyMs: 0,
      detail: { supportedProviders: Object.keys(TESTERS) },
    };
  }

  try {
    return await tester(credentials);
  } catch (err) {
    return {
      ok: false,
      message: `Connection test failed: ${err.message}`,
      latencyMs: 0,
      detail: { error: err.message },
    };
  }
};

module.exports = { runConnectionTest, TESTERS };
