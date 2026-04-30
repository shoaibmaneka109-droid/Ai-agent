import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "../config/env.js";

const algorithm = "aes-256-gcm";
const keyLength = 32;
const ivLength = 12;
const authTagLength = 16;

export type EncryptedSecret = {
  algorithm: "aes-256-gcm";
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

export class EncryptionService {
  private readonly key: Buffer;

  constructor(
    base64Key = env.encryptionKey,
    private readonly keyVersion = env.encryptionKeyVersion,
  ) {
    this.key = Buffer.from(base64Key, "base64");

    if (this.key.length !== keyLength) {
      throw new Error("ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes for AES-256");
    }
  }

  encrypt(plaintext: string): EncryptedSecret {
    const iv = randomBytes(ivLength);
    const cipher = createCipheriv(algorithm, this.key, iv, {
      authTagLength,
    });

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    return {
      algorithm,
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion: this.keyVersion,
    };
  }

  decrypt(encrypted: EncryptedSecret): string {
    if (encrypted.algorithm !== algorithm) {
      throw new Error(`Unsupported encryption algorithm: ${encrypted.algorithm}`);
    }

    const decipher = createDecipheriv(
      algorithm,
      this.key,
      Buffer.from(encrypted.iv, "base64"),
      { authTagLength },
    );
    decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}

export const encryptionService = new EncryptionService();
export const encryptSecret = (plaintext: string): EncryptedSecret =>
  encryptionService.encrypt(plaintext);

export const decryptSecret = (encrypted: EncryptedSecret): string =>
  encryptionService.decrypt(encrypted);
