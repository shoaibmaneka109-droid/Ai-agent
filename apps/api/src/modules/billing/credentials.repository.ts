import type { CredentialProvider } from "@securepay/shared";
import { getPool } from "../../lib/db/pool.js";
import { env } from "../../config/env.js";
import { encryptSecret } from "../../lib/crypto/tenantSecrets.js";

export interface UpsertOrgCredentialInput {
  organizationId: string;
  provider: CredentialProvider;
  plaintextSecret: string;
  label?: string | null;
}

/**
 * Persists provider API secrets using AES-256-GCM; only ciphertext/iv/auth_tag hit PostgreSQL.
 */
export async function upsertEncryptedCredential(input: UpsertOrgCredentialInput): Promise<void> {
  const key = env.masterKey();
  const { ciphertext, iv, authTag } = encryptSecret(input.plaintextSecret, key);
  const pool = getPool();
  await pool.query(
    `INSERT INTO organization_credentials
      (organization_id, provider, label, ciphertext, iv, auth_tag)
     VALUES ($1, $2::credential_provider, $3, $4, $5, $6)
     ON CONFLICT (organization_id, provider)
     DO UPDATE SET
       label = EXCLUDED.label,
       ciphertext = EXCLUDED.ciphertext,
       iv = EXCLUDED.iv,
       auth_tag = EXCLUDED.auth_tag,
       updated_at = now()`,
    [input.organizationId, input.provider, input.label ?? null, ciphertext, iv, authTag]
  );
}
