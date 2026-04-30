const crypto = require("crypto");

const { encryptSecret, decryptSecret } = require("../../shared/crypto/aes256");

function buildSecretPayload({ tenantId, provider, apiKey, createdByUserId, accountLabel }) {
  const aad = `${tenantId}:${provider}:${accountLabel}`;
  const encrypted = encryptSecret(apiKey, aad);
  const fingerprint = crypto
    .createHash("sha256")
    .update(String(apiKey))
    .digest("hex")
    .slice(0, 16);

  return {
    tenantId,
    provider,
    accountLabel,
    createdByUserId,
    keyVersion: "v1",
    keyFingerprint: fingerprint,
    algorithm: encrypted.algorithm,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
  };
}

function hydrateSecret(record) {
  const aad = `${record.tenant_id}:${record.provider}:${record.account_label}`;

  return {
    id: record.id,
    tenantId: record.tenant_id,
    provider: record.provider,
    accountLabel: record.account_label,
    keyVersion: record.key_version,
    apiKey: decryptSecret(
      {
        algorithm: record.algorithm,
        ciphertext: Buffer.isBuffer(record.encrypted_secret)
          ? record.encrypted_secret.toString("base64")
          : record.encrypted_secret,
        iv: Buffer.isBuffer(record.iv) ? record.iv.toString("base64") : record.iv,
        authTag: Buffer.isBuffer(record.auth_tag)
          ? record.auth_tag.toString("base64")
          : record.auth_tag,
      },
      aad,
    ),
  };
}

module.exports = {
  buildSecretPayload,
  hydrateSecret,
};
