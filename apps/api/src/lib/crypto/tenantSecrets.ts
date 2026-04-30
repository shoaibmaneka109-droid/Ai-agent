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
 * Encrypts a UTF-8 secret with AES-256-GCM using a 32-byte master key.
 * Store ciphertext, iv, and auth_tag separately (see database schema).
 */
export function encryptSecret(plaintext: string, masterKey: Buffer): EncryptedPayload {
  if (masterKey.length !== 32) {
    throw new Error("Master key must be 32 bytes for AES-256");
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, masterKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, iv, authTag };
}

export function decryptSecret(payload: EncryptedPayload, masterKey: Buffer): string {
  if (masterKey.length !== 32) {
    throw new Error("Master key must be 32 bytes for AES-256");
  }
  const decipher = crypto.createDecipheriv(ALGO, masterKey, payload.iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(payload.authTag);
  return decipher.update(payload.ciphertext) + decipher.final("utf8");
}
