/**
 * Unit tests for the connection test service.
 *
 * All HTTP calls are intercepted via Jest module mocking so no real network
 * requests are made. Tests verify:
 *  - Correct interpretation of provider HTTP responses
 *  - Graceful error handling (timeouts, wrong status codes, missing config)
 *  - runConnectionTest dispatch to correct provider tester
 */

const { runConnectionTest } = require('./connectionTest.service');

// ─── Mock the internal httpRequest helper ────────────────────────────────────
// We need to intercept the https.request calls.  The simplest approach is to
// mock the whole connectionTest.service module's httpRequest by re-requiring
// it after a partial mock.  Instead, we inject a controllable mock via
// Jest's module factory.

jest.mock('./connectionTest.service', () => {
  const original = jest.requireActual('./connectionTest.service');
  return {
    ...original,
    // Re-export runConnectionTest but allow individual tester overrides per test
    runConnectionTest: original.runConnectionTest,
    TESTERS: original.TESTERS,
  };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a mock httpRequest response and inject it into the module */
const mockHttpWith = (moduleRef, response) => {
  // Patch the https module used inside connectionTest.service
  const https = require('https');
  jest.spyOn(https, 'request').mockImplementationOnce((options, callback) => {
    const chunks = [JSON.stringify(response.body)];
    const mockRes = {
      statusCode: response.statusCode,
      on: (event, handler) => {
        if (event === 'data') chunks.forEach((c) => handler(c));
        if (event === 'end') handler();
        return mockRes;
      },
    };
    process.nextTick(() => callback(mockRes));
    return {
      on: jest.fn(),
      setTimeout: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
  });
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runConnectionTest — provider dispatch', () => {
  test('returns failed result for unknown provider', async () => {
    const result = await runConnectionTest('unknown_provider', { secretKey: 'x' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No connection tester available');
  });

  test('catches thrown errors and returns failed result', async () => {
    const result = await runConnectionTest('stripe', { secretKey: null });
    expect(result.ok).toBe(false);
    expect(typeof result.message).toBe('string');
  });
});

describe('Stripe tester', () => {
  const https = require('https');

  afterEach(() => jest.restoreAllMocks());

  test('returns ok=true for HTTP 200 with balance data', async () => {
    jest.spyOn(https, 'request').mockImplementation((options, cb) => {
      const body = JSON.stringify({
        object: 'balance',
        livemode: false,
        available: [{ currency: 'usd', amount: 10000 }],
      });
      const mockRes = {
        statusCode: 200,
        on: (e, fn) => { if (e === 'data') fn(body); if (e === 'end') fn(); return mockRes; },
      };
      process.nextTick(() => cb(mockRes));
      return { on: jest.fn(), setTimeout: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const result = await runConnectionTest('stripe', { secretKey: 'sk_test_abc' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Connected');
    expect(result.message).toContain('test mode');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.detail.currency).toBe('USD');
  });

  test('returns ok=false with auth message for HTTP 401', async () => {
    jest.spyOn(https, 'request').mockImplementation((options, cb) => {
      const body = JSON.stringify({
        error: { message: 'No such API key: sk_bad', type: 'invalid_request_error' },
      });
      const mockRes = {
        statusCode: 401,
        on: (e, fn) => { if (e === 'data') fn(body); if (e === 'end') fn(); return mockRes; },
      };
      process.nextTick(() => cb(mockRes));
      return { on: jest.fn(), setTimeout: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const result = await runConnectionTest('stripe', { secretKey: 'sk_bad' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Authentication failed');
  });

  test('returns ok=false with status message for unexpected HTTP code', async () => {
    jest.spyOn(https, 'request').mockImplementation((options, cb) => {
      const mockRes = {
        statusCode: 500,
        on: (e, fn) => { if (e === 'data') fn('{}'); if (e === 'end') fn(); return mockRes; },
      };
      process.nextTick(() => cb(mockRes));
      return { on: jest.fn(), setTimeout: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const result = await runConnectionTest('stripe', { secretKey: 'sk_test_abc' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('500');
  });
});

describe('Airwallex tester', () => {
  const https = require('https');

  afterEach(() => jest.restoreAllMocks());

  test('returns ok=false when clientId is missing', async () => {
    const result = await runConnectionTest('airwallex', {
      secretKey: 'some_api_key',
      publicKey: '', // empty
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Client ID');
  });

  test('returns ok=true for HTTP 201 with token', async () => {
    jest.spyOn(https, 'request').mockImplementation((options, cb) => {
      const body = JSON.stringify({ token: 'eyJhbGci...', expires_at: '2026-05-01T00:00:00Z' });
      const mockRes = {
        statusCode: 201,
        on: (e, fn) => { if (e === 'data') fn(body); if (e === 'end') fn(); return mockRes; },
      };
      process.nextTick(() => cb(mockRes));
      return { on: jest.fn(), setTimeout: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const result = await runConnectionTest('airwallex', {
      secretKey: 'valid_key',
      publicKey: 'valid-client-id',
    });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Connected');
  });

  test('returns ok=false for HTTP 401', async () => {
    jest.spyOn(https, 'request').mockImplementation((options, cb) => {
      const mockRes = {
        statusCode: 401,
        on: (e, fn) => { if (e === 'data') fn('{}'); if (e === 'end') fn(); return mockRes; },
      };
      process.nextTick(() => cb(mockRes));
      return { on: jest.fn(), setTimeout: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const result = await runConnectionTest('airwallex', {
      secretKey: 'bad_key',
      publicKey: 'client-id',
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Authentication failed');
  });
});

describe('Wise tester', () => {
  const https = require('https');

  afterEach(() => jest.restoreAllMocks());

  test('returns ok=true for HTTP 200 with profiles array', async () => {
    jest.spyOn(https, 'request').mockImplementation((options, cb) => {
      const body = JSON.stringify([{ id: 12345, type: 'business' }]);
      const mockRes = {
        statusCode: 200,
        on: (e, fn) => { if (e === 'data') fn(body); if (e === 'end') fn(); return mockRes; },
      };
      process.nextTick(() => cb(mockRes));
      return { on: jest.fn(), setTimeout: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const result = await runConnectionTest('wise', { secretKey: 'wise_token' });
    expect(result.ok).toBe(true);
    expect(result.message).toContain('business');
    expect(result.detail.profileCount).toBe(1);
  });

  test('uses sandbox hostname when extraConfig.sandbox is true', async () => {
    let capturedOptions = null;
    jest.spyOn(https, 'request').mockImplementation((options, cb) => {
      capturedOptions = options;
      const mockRes = {
        statusCode: 200,
        on: (e, fn) => { if (e === 'data') fn('[]'); if (e === 'end') fn(); return mockRes; },
      };
      process.nextTick(() => cb(mockRes));
      return { on: jest.fn(), setTimeout: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    await runConnectionTest('wise', {
      secretKey: 'sandbox_token',
      extraConfig: { sandbox: true },
    });

    expect(capturedOptions?.hostname).toContain('sandbox');
  });

  test('returns ok=false for HTTP 401', async () => {
    jest.spyOn(https, 'request').mockImplementation((options, cb) => {
      const mockRes = {
        statusCode: 401,
        on: (e, fn) => { if (e === 'data') fn('{}'); if (e === 'end') fn(); return mockRes; },
      };
      process.nextTick(() => cb(mockRes));
      return { on: jest.fn(), setTimeout: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const result = await runConnectionTest('wise', { secretKey: 'bad_token' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Authentication failed');
  });
});

describe('Custom provider tester', () => {
  const https = require('https');

  afterEach(() => jest.restoreAllMocks());

  test('returns ok=false when no testEndpoint provided', async () => {
    const result = await runConnectionTest('custom', { secretKey: 'key', extraConfig: {} });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('testEndpoint');
  });

  test('returns ok=false for invalid URL', async () => {
    const result = await runConnectionTest('custom', {
      secretKey: 'key',
      extraConfig: { testEndpoint: 'not-a-url' },
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Invalid');
  });

  test('returns ok=true for 200 response', async () => {
    jest.spyOn(https, 'request').mockImplementation((options, cb) => {
      const mockRes = {
        statusCode: 200,
        on: (e, fn) => { if (e === 'data') fn('{}'); if (e === 'end') fn(); return mockRes; },
      };
      process.nextTick(() => cb(mockRes));
      return { on: jest.fn(), setTimeout: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const result = await runConnectionTest('custom', {
      secretKey: 'key',
      extraConfig: { testEndpoint: 'https://api.example.com/health' },
    });
    expect(result.ok).toBe(true);
  });

  test('returns ok=false for 404 response', async () => {
    jest.spyOn(https, 'request').mockImplementation((options, cb) => {
      const mockRes = {
        statusCode: 404,
        on: (e, fn) => { if (e === 'data') fn('{}'); if (e === 'end') fn(); return mockRes; },
      };
      process.nextTick(() => cb(mockRes));
      return { on: jest.fn(), setTimeout: jest.fn(), write: jest.fn(), end: jest.fn() };
    });

    const result = await runConnectionTest('custom', {
      secretKey: 'key',
      extraConfig: { testEndpoint: 'https://api.example.com/health' },
    });
    expect(result.ok).toBe(false);
  });
});
