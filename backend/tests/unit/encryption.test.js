const { encrypt, decrypt, reEncrypt, generateKey } = require('../../src/services/encryption');

// Set a valid 64-char hex key for tests
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

describe('AES-256-GCM Encryption Service', () => {
  test('encrypts plaintext to a non-equal ciphertext', () => {
    const plain = 'sk_live_supersecretkey123';
    const encrypted = encrypt(plain);
    expect(encrypted).not.toBe(plain);
    expect(encrypted.split(':')).toHaveLength(3);
  });

  test('decrypts back to original plaintext', () => {
    const plain = 'sk_live_supersecretkey123';
    const encrypted = encrypt(plain);
    expect(decrypt(encrypted)).toBe(plain);
  });

  test('produces different ciphertexts for same input (random IV)', () => {
    const plain = 'same_input';
    const c1 = encrypt(plain);
    const c2 = encrypt(plain);
    expect(c1).not.toBe(c2);
    expect(decrypt(c1)).toBe(plain);
    expect(decrypt(c2)).toBe(plain);
  });

  test('reEncrypt produces a different token that still decrypts correctly', () => {
    const plain = 'airwallex_secret_key';
    const original = encrypt(plain);
    const rotated = reEncrypt(original);
    expect(rotated).not.toBe(original);
    expect(decrypt(rotated)).toBe(plain);
  });

  test('throws on tampered ciphertext', () => {
    const plain = 'tamper_test';
    const encrypted = encrypt(plain);
    const parts = encrypted.split(':');
    // Corrupt last byte of ciphertext
    parts[2] = parts[2].slice(0, -2) + '00';
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  test('throws on invalid format', () => {
    expect(() => decrypt('onlyone')).toThrow('Invalid encrypted data format');
    expect(() => decrypt('')).toThrow();
  });

  test('throws on empty plaintext', () => {
    expect(() => encrypt('')).toThrow('non-empty string');
  });

  test('generateKey returns a 64-char hex string', () => {
    const key = generateKey();
    expect(typeof key).toBe('string');
    expect(key).toHaveLength(64);
    expect(/^[0-9a-f]+$/i.test(key)).toBe(true);
  });
});
