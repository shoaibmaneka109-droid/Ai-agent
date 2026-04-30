/**
 * Unit tests for AES-256-GCM encryption utilities.
 * These tests run without a database or .env file.
 */

// Inject a test key before loading the module
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

const { encrypt, decrypt, maskSecret, generateApiKey } = require('./encryption');

describe('encrypt / decrypt', () => {
  test('round-trips a plaintext string', () => {
    const plaintext = 'sk_live_supersecret1234';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  test('each encryption produces a different ciphertext (random IV)', () => {
    const plaintext = 'same_value';
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  test('decrypts Stripe-style key correctly', () => {
    // Deliberately non-functional test fixture — not a real secret
    const key = 'stripe_test_key_fixture_not_a_real_secret_xxxxxxxxxxx';
    expect(decrypt(encrypt(key))).toBe(key);
  });

  test('decrypts Airwallex-style key correctly', () => {
    const key = 'airwallex_live_token_xxxxxxxxxxxxxxxxxxxxxxxxxxx';
    expect(decrypt(encrypt(key))).toBe(key);
  });

  test('throws on empty input', () => {
    expect(() => encrypt('')).toThrow(TypeError);
    expect(() => decrypt('')).toThrow(TypeError);
  });

  test('throws on tampered ciphertext', () => {
    const encrypted = encrypt('hello');
    const tampered = encrypted.slice(0, -4) + 'XXXX';
    expect(() => decrypt(tampered)).toThrow();
  });

  test('throws on invalid format', () => {
    const notBase64 = 'definitely-not-valid-encrypted-value';
    expect(() => decrypt(notBase64)).toThrow();
  });
});

describe('maskSecret', () => {
  test('masks a long secret', () => {
    const masked = maskSecret('sk_live_1234567890abcdef');
    expect(masked).toMatch(/^sk_l/);
    expect(masked).toMatch(/cdef$/);
    expect(masked).toContain('*');
  });

  test('returns **** for short secrets', () => {
    expect(maskSecret('abc')).toBe('****');
    expect(maskSecret('')).toBe('****');
  });
});

describe('generateApiKey', () => {
  test('generates a key with the given prefix', () => {
    const key = generateApiKey('sp');
    expect(key).toMatch(/^sp_/);
  });

  test('generates unique keys', () => {
    expect(generateApiKey()).not.toBe(generateApiKey());
  });
});
