import type { ApiKeyEnvironment, PaymentProvider } from "@securepay/shared";
import type { Pool } from "pg";

import { pool as defaultPool } from "../../db/pool.js";
import type { EncryptedSecret } from "../../security/encryption.js";

export type ProviderIntegrationRecord = {
  id: string;
  organization_id: string;
  provider: PaymentProvider;
  environment: ApiKeyEnvironment;
  label: string;
  key_preview: string;
  card_issuing_enabled: boolean;
  webhook_secret_preview: string | null;
  encrypted_api_key: string;
  api_key_iv: string;
  api_key_tag: string;
  encrypted_webhook_secret: string | null;
  webhook_secret_iv: string | null;
  webhook_secret_tag: string | null;
  encryption_key_version: number;
  last_tested_at: Date | null;
  last_test_status: "success" | "failed" | null;
  last_test_message: string | null;
  created_at: Date;
  updated_at: Date;
};

export type UpsertProviderIntegrationInput = {
  organizationId: string;
  provider: PaymentProvider;
  environment: ApiKeyEnvironment;
  label: string;
  apiKey: EncryptedSecret;
  apiKeyPreview: string;
  cardIssuingEnabled: boolean;
  webhookSecret?: EncryptedSecret;
  webhookSecretPreview?: string;
};

export type ConnectionTestInput = {
  id: string;
  status: "success" | "failed";
  message: string;
};

const selectColumns = `
  id,
  organization_id,
  provider,
  environment,
  label,
  key_preview,
  card_issuing_enabled,
  webhook_secret_preview,
  encode(encrypted_api_key, 'base64') AS encrypted_api_key,
  encode(api_key_iv, 'base64') AS api_key_iv,
  encode(api_key_tag, 'base64') AS api_key_tag,
  CASE WHEN encrypted_webhook_secret IS NULL THEN NULL ELSE encode(encrypted_webhook_secret, 'base64') END AS encrypted_webhook_secret,
  CASE WHEN webhook_secret_iv IS NULL THEN NULL ELSE encode(webhook_secret_iv, 'base64') END AS webhook_secret_iv,
  CASE WHEN webhook_secret_tag IS NULL THEN NULL ELSE encode(webhook_secret_tag, 'base64') END AS webhook_secret_tag,
  encryption_key_version,
  last_tested_at,
  last_test_status,
  last_test_message,
  created_at,
  updated_at
`;

export class ProviderIntegrationRepository {
  constructor(private readonly pool: Pool = defaultPool) {}

  async listByOrganization(organizationId: string): Promise<ProviderIntegrationRecord[]> {
    const result = await this.pool.query<ProviderIntegrationRecord>(
      `
        SELECT ${selectColumns}
        FROM provider_integrations
        WHERE organization_id = $1
        ORDER BY provider ASC, environment ASC, created_at DESC
      `,
      [organizationId]
    );

    return result.rows;
  }

  async findById(organizationId: string, id: string): Promise<ProviderIntegrationRecord | null> {
    const result = await this.pool.query<ProviderIntegrationRecord>(
      `
        SELECT ${selectColumns}
        FROM provider_integrations
        WHERE organization_id = $1
          AND id = $2
        LIMIT 1
      `,
      [organizationId, id]
    );

    return result.rows[0] ?? null;
  }

  async upsert(input: UpsertProviderIntegrationInput): Promise<ProviderIntegrationRecord> {
    const result = await this.pool.query<ProviderIntegrationRecord>(
      `
        INSERT INTO provider_integrations (
          organization_id,
          provider,
          environment,
          label,
          encrypted_api_key,
          api_key_iv,
          api_key_tag,
          encrypted_webhook_secret,
          webhook_secret_iv,
          webhook_secret_tag,
          encryption_key_version,
          key_preview,
          card_issuing_enabled,
          webhook_secret_preview
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          decode($5, 'base64'),
          decode($6, 'base64'),
          decode($7, 'base64'),
          CASE WHEN $8::text IS NULL THEN NULL ELSE decode($8, 'base64') END,
          CASE WHEN $9::text IS NULL THEN NULL ELSE decode($9, 'base64') END,
          CASE WHEN $10::text IS NULL THEN NULL ELSE decode($10, 'base64') END,
          $11,
          $12,
          $13,
          $14
        )
        ON CONFLICT (organization_id, provider, environment)
        DO UPDATE SET
          label = excluded.label,
          encrypted_api_key = excluded.encrypted_api_key,
          api_key_iv = excluded.api_key_iv,
          api_key_tag = excluded.api_key_tag,
          encrypted_webhook_secret = excluded.encrypted_webhook_secret,
          webhook_secret_iv = excluded.webhook_secret_iv,
          webhook_secret_tag = excluded.webhook_secret_tag,
          encryption_key_version = excluded.encryption_key_version,
          key_preview = excluded.key_preview,
          webhook_secret_preview = excluded.webhook_secret_preview,
          card_issuing_enabled = excluded.card_issuing_enabled,
          last_tested_at = NULL,
          last_test_status = NULL,
          last_test_message = NULL,
          updated_at = now()
        RETURNING ${selectColumns}
      `,
      [
        input.organizationId,
        input.provider,
        input.environment,
        input.label,
        input.apiKey.ciphertext,
        input.apiKey.iv,
        input.apiKey.authTag,
        input.webhookSecret?.ciphertext ?? null,
        input.webhookSecret?.iv ?? null,
        input.webhookSecret?.authTag ?? null,
        input.apiKey.keyVersion,
        input.apiKeyPreview,
        input.cardIssuingEnabled,
        input.webhookSecretPreview ?? null
      ]
    );

    return result.rows[0];
  }

  async recordConnectionTest(input: ConnectionTestInput): Promise<void> {
    await this.pool.query(
      `
        UPDATE provider_integrations
        SET
          last_tested_at = now(),
          last_test_status = $2,
          last_test_message = $3,
          updated_at = now()
        WHERE id = $1
      `,
      [input.id, input.status, input.message]
    );
  }
}
