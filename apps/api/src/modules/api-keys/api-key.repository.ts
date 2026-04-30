import type { ApiKeyEnvironment, PaymentProvider } from "@securepay/shared";
import type { Pool } from "pg";
import { pool as defaultPool } from "../../db/pool.js";

export interface ApiKeyRecord {
  id: string;
  organization_id: string;
  provider: PaymentProvider;
  environment: ApiKeyEnvironment;
  label: string;
  encrypted_secret: string;
  encryption_iv: string;
  encryption_tag: string;
  encryption_key_version: number;
  key_preview: string;
  created_at: string;
  updated_at: string;
}

export type CreateApiKeyInput = {
  organizationId: string;
  provider: PaymentProvider;
  environment: ApiKeyEnvironment;
  label: string;
  encryptedKey: string;
  encryptionIv: string;
  encryptionTag: string;
  encryptionKeyVersion: number;
  keyPreview: string;
};

export class ApiKeyRepository {
  constructor(private readonly pool: Pool = defaultPool) {}

  async create(input: CreateApiKeyInput): Promise<ApiKeyRecord> {
    const result = await this.pool.query<ApiKeyRecord>(
      `
        INSERT INTO provider_api_keys (
          organization_id,
          provider,
          environment,
          label,
          encrypted_secret,
          encryption_iv,
          encryption_tag,
          encryption_key_version,
          key_preview
        )
        VALUES ($1, $2, $3, $4, decode($5, 'base64'), decode($6, 'base64'), decode($7, 'base64'), $8, $9)
        RETURNING
          id,
          organization_id,
          provider,
          environment,
          label,
          encode(encrypted_secret, 'base64') AS encrypted_secret,
          encode(encryption_iv, 'base64') AS encryption_iv,
          encode(encryption_tag, 'base64') AS encryption_tag,
          encryption_key_version,
          key_preview,
          created_at,
          updated_at
      `,
      [
        input.organizationId,
        input.provider,
        input.environment,
        input.label,
        input.encryptedKey,
        input.encryptionIv,
        input.encryptionTag,
        input.encryptionKeyVersion,
        input.keyPreview,
      ],
    );

    return result.rows[0];
  }

  async listByOrganization(organizationId: string): Promise<ApiKeyRecord[]> {
    const result = await this.pool.query<ApiKeyRecord>(
      `
        SELECT
          id,
          organization_id,
          provider,
          environment,
          label,
          encode(encrypted_secret, 'base64') AS encrypted_secret,
          encode(encryption_iv, 'base64') AS encryption_iv,
          encode(encryption_tag, 'base64') AS encryption_tag,
          encryption_key_version,
          key_preview,
          created_at,
          updated_at
        FROM provider_api_keys
        WHERE organization_id = $1
        ORDER BY created_at DESC
      `,
      [organizationId],
    );

    return result.rows;
  }
}
