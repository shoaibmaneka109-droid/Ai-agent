ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'wise';

CREATE TABLE provider_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider payment_provider NOT NULL,
  environment api_key_environment NOT NULL,
  label TEXT NOT NULL,
  card_issuing_enabled BOOLEAN NOT NULL DEFAULT true,
  key_preview TEXT NOT NULL,
  webhook_secret_preview TEXT,
  encrypted_api_key BYTEA NOT NULL,
  api_key_iv BYTEA NOT NULL,
  api_key_tag BYTEA NOT NULL,
  encrypted_webhook_secret BYTEA,
  webhook_secret_iv BYTEA,
  webhook_secret_tag BYTEA,
  encryption_key_version INTEGER NOT NULL,
  last_tested_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_message TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider, environment)
);

CREATE INDEX idx_provider_integrations_organization_id
  ON provider_integrations(organization_id);

CREATE TRIGGER set_provider_integrations_updated_at
BEFORE UPDATE ON provider_integrations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
