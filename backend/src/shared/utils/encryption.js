const crypto = require('crypto');
const config = require('../../config');

const ALGORITHM = config.encryption.algorithm; // aes-256-gcm
const IV_LENGTH = 16;   // 128-bit IV for GCM
const TAG_LENGTH = 16;  // 128-bit auth tag

/**
 * Derive a 32-byte Buffer from the hex ENCRYPTION_KEY config value.
 * Throws early at module load time if the key is missing or malformed.
 */
function getKeyBuffer() {
  const keyHex = config.encryption.key;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Output format (base64-encoded, colon-separated):
 *   <iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * Using hex segments inside a single base64 envelope keeps the result
 * self-describing and easy to split deterministically.
 */
function encrypt(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new TypeError('encrypt() requires a non-empty string');
  }

  const key = getKeyBuffer();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Encode as "<iv_hex>:<authTag_hex>:<ciphertext_hex>" then base64 the whole thing
  const payload = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  return Buffer.from(payload, 'utf8').toString('base64');
}

/**
 * Decrypt a value produced by encrypt().
 * Returns the original plaintext string.
 */
function decrypt(encryptedValue) {
  if (typeof encryptedValue !== 'string' || encryptedValue.length === 0) {
    throw new TypeError('decrypt() requires a non-empty string');
  }

  const key = getKeyBuffer();
  const payload = Buffer.from(encryptedValue, 'base64').toString('utf8');
  const parts = payload.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('Decryption failed: authentication tag mismatch or corrupted data');
  }
}

/**
 * Mask a secret for safe display (e.g. logs, UI).
 * Shows first 4 and last 4 chars, replaces the rest with asterisks.
 */
function maskSecret(secret) {
  if (!secret || secret.length <= 8) return '****';
  return `${secret.slice(0, 4)}${'*'.repeat(Math.min(secret.length - 8, 20))}${secret.slice(-4)}`;
}

/**
 * Generate a cryptographically secure random API key.
 */
function generateApiKey(prefix = 'sp') {
  const random = crypto.randomBytes(24).toString('base64url');
  return `${prefix}_${random}`;
}

module.exports = { encrypt, decrypt, maskSecret, generateApiKey };
