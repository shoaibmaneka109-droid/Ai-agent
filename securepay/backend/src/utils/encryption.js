/**
 * AES-256-GCM encryption utility for sensitive data (API keys, tokens).
 *
 * Stored format:  <hex_iv>:<hex_ciphertext>:<hex_authTag>
 *
 * GCM mode provides both confidentiality (AES-256) and integrity / authenticity
 * (128-bit auth tag), so tampering with ciphertext is detectable.
 */

const crypto = require('crypto');
const config = require('../config/encryption');

function getKey() {
  if (!config.keyHex || config.keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(config.keyHex, 'hex');
}

/**
 * Encrypt a plaintext string.
 * @param {string} plaintext
 * @returns {string}  "<iv_hex>:<ciphertext_hex>:<authTag_hex>"
 */
function encrypt(plaintext) {
  if (typeof plaintext !== 'string' || !plaintext) {
    throw new Error('plaintext must be a non-empty string');
  }

  const key = getKey();
  const iv = crypto.randomBytes(config.ivLength);
  const cipher = crypto.createCipheriv(config.algorithm, key, iv, {
    authTagLength: config.authTagLength,
  });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString('hex'), encrypted.toString('hex'), authTag.toString('hex')].join(':');
}

/**
 * Decrypt a value produced by encrypt().
 * @param {string} encryptedValue  "<iv_hex>:<ciphertext_hex>:<authTag_hex>"
 * @returns {string} original plaintext
 */
function decrypt(encryptedValue) {
  if (typeof encryptedValue !== 'string') {
    throw new Error('encryptedValue must be a string');
  }

  const parts = encryptedValue.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format');
  }

  const [ivHex, ciphertextHex, authTagHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(config.algorithm, key, iv, {
    authTagLength: config.authTagLength,
  });
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('Decryption failed: ciphertext may be tampered or key is incorrect');
  }
}

/**
 * Produce a masked display version of sensitive strings (e.g. "sk_live_••••••abcd").
 */
function mask(plaintext, visibleSuffix = 4) {
  if (!plaintext || plaintext.length <= visibleSuffix) return '••••••••';
  return '••••••••' + plaintext.slice(-visibleSuffix);
}

module.exports = { encrypt, decrypt, mask };
