-- Migration 003: Encrypted API key storage (Stripe, Airwallex, etc.)

BEGIN;

CREATE TYPE api_key_provider AS ENUM ('stripe', 'airwallex', 'custom');
CREATE TYPE api_key_env AS ENUM ('live', 'sandbox');

CREATE TABLE api_keys (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by         UUID NOT NULL REFERENCES users(id),

  -- Human-readable label
  label              VARCHAR(255) NOT NULL,
  provider           api_key_provider NOT NULL,
  environment        api_key_env NOT NULL DEFAULT 'sandbox',

  -- AES-256-GCM encrypted values stored as "<iv_hex>:<ciphertext_hex>:<authTag_hex>"
  -- Secret key (publishable key stored plain-text only for display masking)
  secret_key_enc     TEXT NOT NULL,
  publishable_key    VARCHAR(512),                  -- not sensitive, stored plain

  -- Webhook signing secrets (also encrypted)
  webhook_secret_enc TEXT,

  -- Soft delete support
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at         TIMESTAMPTZ,
  revoked_by         UUID REFERENCES users(id),

  -- Last verified connection
  last_verified_at   TIMESTAMPTZ,
  last_used_at       TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT one_active_key_per_provider_env
    UNIQUE NULLS NOT DISTINCT (tenant_id, provider, environment, is_active)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX idx_api_keys_tenant    ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_provider  ON api_keys(tenant_id, provider, environment);
CREATE INDEX idx_api_keys_active    ON api_keys(tenant_id, is_active) WHERE is_active = TRUE;

CREATE TRIGGER api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
