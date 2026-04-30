/**
 * Unit tests for the three provider connection adapters.
 * The httpPing module is mocked so no real network calls are made.
 */

jest.mock('../../src/services/providers/httpPing', () => ({
  get:  jest.fn(),
  post: jest.fn(),
}));
jest.mock('../../src/services/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const httpPing       = require('../../src/services/providers/httpPing');
const stripeAdapter   = require('../../src/services/providers/stripe.adapter');
const airwallexAdapter = require('../../src/services/providers/airwallex.adapter');
const wiseAdapter     = require('../../src/services/providers/wise.adapter');
const { getAdapter, PROVIDER_META } = require('../../src/services/providers');

// ── PROVIDER_META ──────────────────────────────────────────────────────────

describe('PROVIDER_META', () => {
  test('contains entries for stripe, airwallex, wise', () => {
    expect(PROVIDER_META).toHaveProperty('stripe');
    expect(PROVIDER_META).toHaveProperty('airwallex');
    expect(PROVIDER_META).toHaveProperty('wise');
  });

  test('each entry has required display fields', () => {
    ['stripe', 'airwallex', 'wise'].forEach((p) => {
      expect(PROVIDER_META[p]).toHaveProperty('label');
      expect(PROVIDER_META[p]).toHaveProperty('keyLabel');
      expect(PROVIDER_META[p]).toHaveProperty('docsUrl');
    });
  });

  test('getAdapter throws for unknown provider', () => {
    expect(() => getAdapter('paypal')).toThrow('Unsupported provider: paypal');
  });

  test('getAdapter returns correct adapters', () => {
    expect(getAdapter('stripe')).toBe(stripeAdapter);
    expect(getAdapter('airwallex')).toBe(airwallexAdapter);
    expect(getAdapter('wise')).toBe(wiseAdapter);
  });
});

// ── Stripe adapter ────────────────────────────────────────────────────────

describe('Stripe adapter', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns success on HTTP 200 with balance response', async () => {
    httpPing.get.mockResolvedValueOnce({
      status: 200,
      latencyMs: 120,
      body: JSON.stringify({ available: [{ currency: 'usd', amount: 5000 }] }),
    });
    const r = await stripeAdapter.test({ secretKey: 'sk_test_abc123', environment: 'test' });
    expect(r.success).toBe(true);
    expect(r.latencyMs).toBe(120);
    expect(r.summary).toMatch(/Connected successfully/);
    expect(r.errorCode).toBeNull();
  });

  test('returns failure on HTTP 401 (bad key)', async () => {
    httpPing.get.mockResolvedValueOnce({
      status: 401, latencyMs: 80,
      body: JSON.stringify({ error: { message: 'No such API key.' } }),
    });
    const r = await stripeAdapter.test({ secretKey: 'sk_test_invalid', environment: 'test' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('AUTH_FAILED');
    expect(r.summary).toMatch(/No such API key/);
  });

  test('rejects invalid key format without making HTTP call', async () => {
    const r = await stripeAdapter.test({ secretKey: 'notastripekey', environment: 'test' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('INVALID_KEY_FORMAT');
    expect(httpPing.get).not.toHaveBeenCalled();
  });

  test('rejects invalid publishable key format', async () => {
    const r = await stripeAdapter.test({ secretKey: 'sk_test_valid', publishableKey: 'bad_pk' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('INVALID_PUBLISHABLE_KEY_FORMAT');
    expect(httpPing.get).not.toHaveBeenCalled();
  });

  test('rejects invalid webhook secret format', async () => {
    const r = await stripeAdapter.test({ secretKey: 'sk_test_valid', webhookSecret: 'not_a_whsec' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('INVALID_WEBHOOK_SECRET_FORMAT');
    expect(httpPing.get).not.toHaveBeenCalled();
  });

  test('handles network error gracefully', async () => {
    httpPing.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const r = await stripeAdapter.test({ secretKey: 'sk_test_abc', environment: 'test' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('NETWORK_ERROR');
    expect(r.summary).toMatch(/ECONNREFUSED/);
  });
});

// ── Airwallex adapter ─────────────────────────────────────────────────────

describe('Airwallex adapter', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns success on HTTP 201 auth response', async () => {
    httpPing.post.mockResolvedValueOnce({
      status: 201, latencyMs: 200,
      body: JSON.stringify({ token: 'jwt_abc', account_id: 'acct_123' }),
    });
    const r = await airwallexAdapter.test({
      secretKey: 'myapikey', extraCredential: 'client_123', environment: 'test',
    });
    expect(r.success).toBe(true);
    expect(r.summary).toMatch(/acct_123/);
  });

  test('returns failure on HTTP 401', async () => {
    httpPing.post.mockResolvedValueOnce({
      status: 401, latencyMs: 90,
      body: JSON.stringify({ message: 'Invalid credentials' }),
    });
    const r = await airwallexAdapter.test({ secretKey: 'bad_key', environment: 'test' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('AUTH_FAILED');
  });

  test('returns failure when secretKey is missing', async () => {
    const r = await airwallexAdapter.test({ secretKey: '', environment: 'test' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('MISSING_KEY');
    expect(httpPing.post).not.toHaveBeenCalled();
  });

  test('handles network error gracefully', async () => {
    httpPing.post.mockRejectedValueOnce(new Error('timeout'));
    const r = await airwallexAdapter.test({ secretKey: 'key', environment: 'test' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('NETWORK_ERROR');
  });
});

// ── Wise adapter ──────────────────────────────────────────────────────────

describe('Wise adapter', () => {
  beforeEach(() => jest.clearAllMocks());

  const VALID_TOKEN = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  test('returns success on HTTP 200 with profiles', async () => {
    httpPing.get.mockResolvedValueOnce({
      status: 200, latencyMs: 150,
      body: JSON.stringify([
        { id: 11, type: 'personal' },
        { id: 22, type: 'business' },
      ]),
    });
    const r = await wiseAdapter.test({ secretKey: VALID_TOKEN, environment: 'test' });
    expect(r.success).toBe(true);
    expect(r.summary).toMatch(/2 profile/);
  });

  test('returns PROFILE_ID_MISMATCH when profile ID not found', async () => {
    httpPing.get.mockResolvedValueOnce({
      status: 200, latencyMs: 100,
      body: JSON.stringify([{ id: 11, type: 'personal' }]),
    });
    const r = await wiseAdapter.test({ secretKey: VALID_TOKEN, extraCredential: '999', environment: 'test' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('PROFILE_ID_MISMATCH');
  });

  test('returns success when profile ID matches', async () => {
    httpPing.get.mockResolvedValueOnce({
      status: 200, latencyMs: 110,
      body: JSON.stringify([{ id: 42, type: 'business' }]),
    });
    const r = await wiseAdapter.test({ secretKey: VALID_TOKEN, extraCredential: '42', environment: 'test' });
    expect(r.success).toBe(true);
  });

  test('rejects non-UUID token without making HTTP call', async () => {
    const r = await wiseAdapter.test({ secretKey: 'not-a-uuid', environment: 'test' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('INVALID_KEY_FORMAT');
    expect(httpPing.get).not.toHaveBeenCalled();
  });

  test('returns failure on HTTP 401', async () => {
    httpPing.get.mockResolvedValueOnce({
      status: 401, latencyMs: 70,
      body: JSON.stringify({ error_description: 'Unauthorised' }),
    });
    const r = await wiseAdapter.test({ secretKey: VALID_TOKEN, environment: 'test' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('AUTH_FAILED');
  });

  test('handles network error gracefully', async () => {
    httpPing.get.mockRejectedValueOnce(new Error('DNS lookup failed'));
    const r = await wiseAdapter.test({ secretKey: VALID_TOKEN, environment: 'test' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('NETWORK_ERROR');
  });

  test('returns MISSING_KEY when no token provided', async () => {
    const r = await wiseAdapter.test({ secretKey: '', environment: 'test' });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('MISSING_KEY');
  });
});
