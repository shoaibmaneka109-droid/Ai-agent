const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey() {
  const rawKey = process.env.ENCRYPTION_MASTER_KEY || "";
  const keyBuffer = Buffer.from(rawKey, "base64");

  if (keyBuffer.length !== 32) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY must be a base64-encoded 32-byte key for AES-256-GCM.",
    );
  }

  return keyBuffer;
}

function encryptSecret(plainText, aad = "") {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  if (aad) {
    cipher.setAAD(Buffer.from(aad, "utf8"));
  }

  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final(),
  ]);

  return {
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64"),
  };
}

function decryptSecret(payload, aad = "") {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    payload.algorithm || ALGORITHM,
    key,
    Buffer.from(payload.iv, "base64"),
    { authTagLength: AUTH_TAG_LENGTH },
  );

  if (aad) {
    decipher.setAAD(Buffer.from(aad, "utf8"));
  }

  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  ALGORITHM,
  encryptSecret,
  decryptSecret,
};
