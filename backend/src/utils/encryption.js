/**
 * AES-256-GCM symmetric encryption utilities.
 *
 * Each ciphertext bundle is stored as a colon-delimited string:
 *   <iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * A unique 12-byte IV is generated for every encrypt() call, so the same
 * plaintext will always produce a different ciphertext (IND-CCA2 property).
 */
const crypto = require('crypto');
const config  = require('../config');

const ALGORITHM   = 'aes-256-gcm';
const IV_BYTES    = 12; // 96-bit IV recommended for GCM
const TAG_BYTES   = 16;

function masterKeyBuffer() {
  return Buffer.from(config.encryption.masterKey, 'hex');
}

/**
 * Encrypt `plaintext` and return an opaque ciphertext bundle string.
 * @param {string} plaintext
 * @returns {string}
 */
function encrypt(plaintext) {
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKeyBuffer(), iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

/**
 * Decrypt a ciphertext bundle produced by `encrypt`.
 * @param {string} bundle
 * @returns {string}
 */
function decrypt(bundle) {
  const parts = bundle.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext bundle format');
  }

  const [ivHex, tagHex, ctHex] = parts;

  const iv         = Buffer.from(ivHex, 'hex');
  const authTag    = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ctHex, 'hex');

  if (iv.length !== IV_BYTES) throw new Error('Invalid IV length');
  if (authTag.length !== TAG_BYTES) throw new Error('Invalid auth tag length');

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKeyBuffer(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Re-encrypt a bundle under a new master key during key rotation.
 * Both keys are supplied as hex strings.
 */
function reEncrypt(bundle, oldKeyHex, newKeyHex) {
  const oldKey  = Buffer.from(oldKeyHex, 'hex');
  const parts   = bundle.split(':');
  const iv      = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const ct      = Buffer.from(parts[2], 'hex');

  const dec = crypto.createDecipheriv(ALGORITHM, oldKey, iv);
  dec.setAuthTag(authTag);
  const plain = Buffer.concat([dec.update(ct), dec.final()]).toString('utf8');

  const newIv     = crypto.randomBytes(IV_BYTES);
  const enc       = crypto.createCipheriv(ALGORITHM, Buffer.from(newKeyHex, 'hex'), newIv);
  const newCt     = Buffer.concat([enc.update(plain, 'utf8'), enc.final()]);
  const newTag    = enc.getAuthTag();

  return [newIv.toString('hex'), newTag.toString('hex'), newCt.toString('hex')].join(':');
}

module.exports = { encrypt, decrypt, reEncrypt };
