import type { CredentialKind, CredentialProvider } from "@securepay/shared";
import { getPool } from "../../lib/db/pool.js";
import { env } from "../../config/env.js";
import { decryptSecret, encryptSecret, type EncryptedPayload } from "@securepay/core";

export interface UpsertOrgCredentialInput {
  organizationId: string;
  provider: CredentialProvider;
  kind: CredentialKind;
  plaintextSecret: string;
  label?: string | null;
}

function rowToPayload(row: {
  ciphertext: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
}): EncryptedPayload {
  return {
    ciphertext: row.ciphertext,
    iv: row.iv,
    authTag: row.auth_tag,
  };
}

/**
 * Persists secrets using AES-256-GCM; only ciphertext/iv/auth_tag hit PostgreSQL.
 */
export async function upsertEncryptedCredential(input: UpsertOrgCredentialInput): Promise<void> {
  const key = env.masterKey();
  const { ciphertext, iv, authTag } = encryptSecret(input.plaintextSecret, key);
  const pool = getPool();
  await pool.query(
    `INSERT INTO organization_credentials
      (organization_id, provider, credential_kind, label, ciphertext, iv, auth_tag)
     VALUES ($1, $2::credential_provider, $3::credential_kind, $4, $5, $6, $7)
     ON CONFLICT (organization_id, provider, credential_kind)
     DO UPDATE SET
       label = EXCLUDED.label,
       ciphertext = EXCLUDED.ciphertext,
       iv = EXCLUDED.iv,
       auth_tag = EXCLUDED.auth_tag,
       updated_at = now()`,
    [
      input.organizationId,
      input.provider,
      input.kind,
      input.label ?? null,
      ciphertext,
      iv,
      authTag,
    ]
  );
}

export async function getDecryptedCredential(
  organizationId: string,
  provider: CredentialProvider,
  kind: CredentialKind
): Promise<string | null> {
  const pool = getPool();
  const { rows } = await pool.query<{
    ciphertext: Buffer;
    iv: Buffer;
    auth_tag: Buffer;
  }>(
    `SELECT ciphertext, iv, auth_tag FROM organization_credentials
     WHERE organization_id = $1 AND provider = $2::credential_provider AND credential_kind = $3::credential_kind`,
    [organizationId, provider, kind]
  );
  const row = rows[0];
  if (!row) return null;
  return decryptSecret(rowToPayload(row), env.masterKey());
}

export interface IntegrationCredentialRow {
  provider: CredentialProvider;
  credential_kind: CredentialKind;
  updated_at: Date;
}

export async function listCredentialRows(organizationId: string): Promise<IntegrationCredentialRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<IntegrationCredentialRow>(
    `SELECT provider, credential_kind, updated_at FROM organization_credentials
     WHERE organization_id = $1`,
    [organizationId]
  );
  return rows;
}
