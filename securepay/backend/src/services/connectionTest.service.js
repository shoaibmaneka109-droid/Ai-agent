/**
 * Connection Test Service
 *
 * Pings each payment provider's API using the tenant's stored (decrypted) credentials
 * to verify the integration is live and the keys are valid.
 *
 * Design goals:
 *   - Self-service: any admin can add their own keys and verify them immediately
 *   - No side effects: test calls use read-only endpoints (account fetch, balance check)
 *   - Results are persisted to api_key_test_log and cached on the api_keys row
 *   - Latency is measured and stored for observability
 *
 * Supported providers:
 *   stripe    — GET /v1/account  (verifies secret key)
 *   airwallex — POST /api/v1/authentication/login → GET /api/v1/accounts  (client_id + api_key)
 *   wise      — GET /v4/profiles  (Bearer token)
 *   custom    — HTTP HEAD/GET against a user-supplied test_url stored in extra_config
 */

const https = require('https');
const { query, getClient } = require('../config/database');
const { decrypt } = require('../utils/encryption');
const logger = require('../utils/logger');

// ─── Low-level HTTP helper (no external deps required) ────────────────────────

function httpRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          latencyMs: Date.now() - start,
        });
      });
    });
    req.on('error', (err) => reject(err));
    req.setTimeout(10000, () => {
      req.destroy(new Error('Request timed out after 10s'));
    });
    if (body) req.write(body);
    req.end();
  });
}

function parseJsonSafe(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

// ─── Provider testers ─────────────────────────────────────────────────────────

/**
 * Stripe: GET https://api.stripe.com/v1/account
 * A successful 200 response confirms the secret key is valid and returns
 * the account name, country, and mode (live / test).
 */
async function testStripe(secretKey) {
  const result = await httpRequest({
    hostname: 'api.stripe.com',
    path: '/v1/account',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'User-Agent': 'SecurePay/1.0',
    },
  });

  const body = parseJsonSafe(result.body);

  if (result.statusCode === 200) {
    return {
      success: true,
      message: `Connected to Stripe account "${body.business_profile?.name || body.display_name || body.id}"`,
      latencyMs: result.latencyMs,
      providerDetail: {
        accountId: body.id,
        displayName: body.business_profile?.name || body.display_name,
        country: body.country,
        currency: body.default_currency,
        livemode: body.livemode,
        chargesEnabled: body.charges_enabled,
        payoutsEnabled: body.payouts_enabled,
      },
    };
  }

  const errorMsg = body.error?.message || `HTTP ${result.statusCode}`;
  return {
    success: false,
    message: `Stripe connection failed: ${errorMsg}`,
    latencyMs: result.latencyMs,
    httpStatus: result.statusCode,
    providerDetail: { error: body.error },
  };
}

/**
 * Airwallex: two-step auth
 *   1. POST /api/v1/authentication/login  (client_id + api_key → access_token)
 *   2. GET  /api/v1/accounts              (verify account details)
 */
async function testAirwallex(clientId, apiKey, environment = 'sandbox') {
  const hostname = environment === 'live'
    ? 'api.airwallex.com'
    : 'api-demo.airwallex.com';

  // Step 1: authenticate
  const loginBody = JSON.stringify({});
  let loginResult;
  try {
    loginResult = await httpRequest({
      hostname,
      path: '/api/v1/authentication/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': clientId,
        'x-api-key': apiKey,
        'User-Agent': 'SecurePay/1.0',
        'Content-Length': Buffer.byteLength(loginBody),
      },
    }, loginBody);
  } catch (err) {
    return { success: false, message: `Airwallex auth request failed: ${err.message}`, latencyMs: 0, providerDetail: {} };
  }

  const loginBody2 = parseJsonSafe(loginResult.body);

  if (loginResult.statusCode !== 200 && loginResult.statusCode !== 201) {
    return {
      success: false,
      message: `Airwallex authentication failed: ${loginBody2.message || `HTTP ${loginResult.statusCode}`}`,
      latencyMs: loginResult.latencyMs,
      httpStatus: loginResult.statusCode,
      providerDetail: { error: loginBody2 },
    };
  }

  const accessToken = loginBody2.token;

  // Step 2: fetch account info
  let accountResult;
  try {
    accountResult = await httpRequest({
      hostname,
      path: '/api/v1/accounts',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'SecurePay/1.0',
      },
    });
  } catch (err) {
    return { success: false, message: `Airwallex account fetch failed: ${err.message}`, latencyMs: loginResult.latencyMs, providerDetail: {} };
  }

  const accountBody = parseJsonSafe(accountResult.body);

  if (accountResult.statusCode === 200) {
    const account = Array.isArray(accountBody) ? accountBody[0] : accountBody;
    return {
      success: true,
      message: `Connected to Airwallex account "${account?.account_name || account?.id || 'unknown'}"`,
      latencyMs: loginResult.latencyMs + accountResult.latencyMs,
      providerDetail: {
        accountId: account?.id,
        accountName: account?.account_name,
        status: account?.status,
        primaryCurrency: account?.primary_currency,
        countryCode: account?.country_code,
      },
    };
  }

  return {
    success: false,
    message: `Airwallex account fetch failed: ${accountBody.message || `HTTP ${accountResult.statusCode}`}`,
    latencyMs: loginResult.latencyMs + accountResult.latencyMs,
    httpStatus: accountResult.statusCode,
    providerDetail: { error: accountBody },
  };
}

/**
 * Wise (formerly TransferWise): GET https://api.wise.com/v4/profiles
 * Uses a personal API token (Bearer).
 */
async function testWise(apiToken, environment = 'sandbox') {
  const hostname = environment === 'live' ? 'api.wise.com' : 'api.sandbox.transferwise.tech';

  let result;
  try {
    result = await httpRequest({
      hostname,
      path: '/v4/profiles',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'User-Agent': 'SecurePay/1.0',
      },
    });
  } catch (err) {
    return { success: false, message: `Wise request failed: ${err.message}`, latencyMs: 0, providerDetail: {} };
  }

  const body = parseJsonSafe(result.body);

  if (result.statusCode === 200) {
    const profiles = Array.isArray(body) ? body : [];
    const personal = profiles.find((p) => p.type === 'PERSONAL');
    const business = profiles.find((p) => p.type === 'BUSINESS');
    const primary = business || personal || profiles[0];

    return {
      success: true,
      message: `Connected to Wise — ${profiles.length} profile(s) found${primary ? ` (${primary.type.toLowerCase()}: ${primary.details?.firstName || primary.details?.name || primary.id})` : ''}`,
      latencyMs: result.latencyMs,
      providerDetail: {
        profileCount: profiles.length,
        profiles: profiles.map((p) => ({
          id: p.id,
          type: p.type,
          name: p.details?.firstName
            ? `${p.details.firstName} ${p.details.lastName}`
            : p.details?.name || p.id,
        })),
      },
    };
  }

  const errorMsg = body.errors?.[0]?.message || body.error_description || body.message || `HTTP ${result.statusCode}`;
  return {
    success: false,
    message: `Wise connection failed: ${errorMsg}`,
    latencyMs: result.latencyMs,
    httpStatus: result.statusCode,
    providerDetail: { error: body },
  };
}

/**
 * Custom provider: HTTP GET/HEAD against a user-supplied URL stored in extra_config.test_url
 */
async function testCustom(secretKey, extraConfig = {}) {
  const testUrl = extraConfig.test_url;
  if (!testUrl) {
    return {
      success: false,
      message: 'No test_url configured in extra_config for custom provider',
      latencyMs: 0,
      providerDetail: {},
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(testUrl);
  } catch {
    return { success: false, message: `Invalid test_url: ${testUrl}`, latencyMs: 0, providerDetail: {} };
  }

  if (parsedUrl.protocol !== 'https:') {
    return { success: false, message: 'test_url must use HTTPS', latencyMs: 0, providerDetail: {} };
  }

  let result;
  try {
    result = await httpRequest({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + (parsedUrl.search || ''),
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'User-Agent': 'SecurePay/1.0',
      },
    });
  } catch (err) {
    return { success: false, message: `Custom provider request failed: ${err.message}`, latencyMs: 0, providerDetail: {} };
  }

  const ok = result.statusCode >= 200 && result.statusCode < 300;
  return {
    success: ok,
    message: ok
      ? `Custom provider responded with HTTP ${result.statusCode}`
      : `Custom provider returned HTTP ${result.statusCode}`,
    latencyMs: result.latencyMs,
    httpStatus: result.statusCode,
    providerDetail: { url: testUrl, statusCode: result.statusCode },
  };
}

// ─── Main dispatch ─────────────────────────────────────────────────────────────

/**
 * Run a connection test for a given api_key row.
 * Decrypts credentials server-side, pings the provider, persists results.
 *
 * @param {string} tenantId
 * @param {string} keyId
 * @param {string} userId   – who triggered the test
 * @returns {object}        – { success, message, latencyMs, providerDetail, logId }
 */
async function runConnectionTest(tenantId, keyId, userId) {
  // Fetch the key row (with encrypted fields)
  const { rows } = await query(
    `SELECT id, provider, environment, secret_key_enc, client_id_enc, extra_config
     FROM api_keys
     WHERE id = $1 AND tenant_id = $2 AND is_active = TRUE`,
    [keyId, tenantId],
  );

  if (!rows.length) {
    throw Object.assign(new Error('API key not found or inactive'), { statusCode: 404 });
  }

  const keyRow = rows[0];
  let testResult;

  try {
    switch (keyRow.provider) {
      case 'stripe': {
        const secretKey = decrypt(keyRow.secret_key_enc);
        testResult = await testStripe(secretKey);
        break;
      }
      case 'airwallex': {
        // Airwallex uses client_id + api_key (= secret_key_enc)
        const clientId = keyRow.client_id_enc ? decrypt(keyRow.client_id_enc) : null;
        const apiKey = decrypt(keyRow.secret_key_enc);
        if (!clientId) {
          testResult = { success: false, message: 'Airwallex requires a Client ID. Please update your key.', latencyMs: 0, providerDetail: {} };
        } else {
          testResult = await testAirwallex(clientId, apiKey, keyRow.environment);
        }
        break;
      }
      case 'wise': {
        const apiToken = decrypt(keyRow.secret_key_enc);
        testResult = await testWise(apiToken, keyRow.environment);
        break;
      }
      case 'custom': {
        const secretKey = decrypt(keyRow.secret_key_enc);
        testResult = await testCustom(secretKey, keyRow.extra_config || {});
        break;
      }
      default:
        testResult = { success: false, message: `No test implementation for provider: ${keyRow.provider}`, latencyMs: 0, providerDetail: {} };
    }
  } catch (err) {
    logger.warn(`Connection test error for key ${keyId}:`, err.message);
    testResult = {
      success: false,
      message: `Test failed with error: ${err.message}`,
      latencyMs: 0,
      providerDetail: {},
    };
  }

  const status = testResult.success ? 'success' : 'failure';

  // Persist result to test log and update the api_keys row (single transaction)
  const client = await getClient();
  let logId;
  try {
    await client.query('BEGIN');

    // Update last_test_* columns on the key
    await client.query(
      `UPDATE api_keys
       SET last_test_at = NOW(),
           last_test_status = $1,
           last_test_message = $2,
           last_test_latency_ms = $3,
           last_verified_at = CASE WHEN $1 = 'success' THEN NOW() ELSE last_verified_at END
       WHERE id = $4`,
      [status, testResult.message, testResult.latencyMs, keyId],
    );

    // Insert log entry
    const logResult = await client.query(
      `INSERT INTO api_key_test_log
         (api_key_id, tenant_id, tested_by, status, http_status, message, latency_ms, provider_detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        keyId,
        tenantId,
        userId,
        status,
        testResult.httpStatus || (testResult.success ? 200 : null),
        testResult.message,
        testResult.latencyMs,
        JSON.stringify(testResult.providerDetail || {}),
      ],
    );
    logId = logResult.rows[0].id;

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Failed to persist connection test result:', err);
    // Still return the test result even if persistence failed
  } finally {
    client.release();
  }

  logger.info(`Connection test [${keyRow.provider}/${keyRow.environment}] → ${status} (${testResult.latencyMs}ms) for tenant ${tenantId}`);

  return { ...testResult, logId, status };
}

/**
 * Fetch the test log for a given api key.
 */
async function getTestLog(tenantId, keyId, limit = 20) {
  const { rows } = await query(
    `SELECT l.id, l.status, l.http_status, l.message, l.latency_ms, l.provider_detail, l.created_at,
            u.first_name || ' ' || u.last_name AS tested_by_name
     FROM api_key_test_log l
     LEFT JOIN users u ON u.id = l.tested_by
     WHERE l.api_key_id = $1 AND l.tenant_id = $2
     ORDER BY l.created_at DESC
     LIMIT $3`,
    [keyId, tenantId, limit],
  );
  return rows;
}

module.exports = { runConnectionTest, getTestLog };
