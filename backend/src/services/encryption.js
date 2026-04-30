/**
 * AES-256-GCM encryption service for sensitive data (API keys, tokens).
 * GCM mode provides authenticated encryption, preventing tampering.
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_LENGTH = 16;

const getKey = () => {
  const hexKey = process.env.ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hexKey, 'hex');
};

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a colon-delimited string: iv:authTag:ciphertext (all hex-encoded).
 */
const encrypt = (plaintext) => {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Plaintext must be a non-empty string');
  }

  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
};

/**
 * Decrypts an AES-256-GCM encrypted string produced by `encrypt`.
 */
const decrypt = (encryptedData) => {
  if (typeof encryptedData !== 'string') {
    throw new Error('Encrypted data must be a string');
  }

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('Decryption failed: data may be tampered or key is incorrect');
  }
};

/**
 * Re-encrypts a value — useful for key rotation workflows.
 */
const reEncrypt = (encryptedData) => {
  const plaintext = decrypt(encryptedData);
  return encrypt(plaintext);
};

/**
 * Generates a cryptographically secure random hex key (suitable for ENCRYPTION_KEY).
 */
const generateKey = () => crypto.randomBytes(32).toString('hex');

module.exports = { encrypt, decrypt, reEncrypt, generateKey };
