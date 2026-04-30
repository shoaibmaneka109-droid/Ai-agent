import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * Encrypts a UTF-8 string with AES-256-GCM (Stripe/Airwallex API keys, webhook secrets, etc.).
 * Persist `ciphertext`, `iv`, and `authTag` separately; never store the plaintext or master key in the DB.
 */
export function encryptUtf8(plaintext: string, masterKey: Buffer): EncryptedPayload {
  assertMasterKey(masterKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

/** Decrypts a payload produced by `encryptUtf8`. Throws if the tag does not verify (tampered ciphertext). */
export function decryptUtf8(payload: EncryptedPayload, masterKey: Buffer): string {
  assertMasterKey(masterKey);
  const decipher = crypto.createDecipheriv(ALGO, masterKey, payload.iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(payload.authTag);
  return decipher.update(payload.ciphertext) + decipher.final("utf8");
}

/** @deprecated Use `encryptUtf8` — alias kept for incremental migration */
export const encryptSecret = encryptUtf8;

/** @deprecated Use `decryptUtf8` — alias kept for incremental migration */
export const decryptSecret = decryptUtf8;

export function assertMasterKey(masterKey: Buffer): void {
  if (masterKey.length !== 32) {
    throw new Error("Master key must be 32 bytes for AES-256-GCM");
  }
}

/** Parse a 64-char hex env string into a 32-byte key (common for `MASTER_KEY_HEX`). */
export function masterKeyFromHex(hex: string): Buffer {
  const normalized = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("MASTER_KEY_HEX must be 64 hexadecimal characters (32 bytes)");
  }
  return Buffer.from(normalized, "hex");
}
