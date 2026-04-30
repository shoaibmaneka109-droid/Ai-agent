-- Migration: Wise + webhook credential rows (run on DBs created before Wise/webhook support)
BEGIN;

DO $$ BEGIN
  ALTER TYPE credential_provider ADD VALUE IF NOT EXISTS 'wise';
EXCEPTION
  WHEN undefined_object THEN null;
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE credential_kind AS ENUM ('api_secret', 'webhook_secret');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE organization_credentials
  ADD COLUMN IF NOT EXISTS credential_kind credential_kind NOT NULL DEFAULT 'api_secret';

ALTER TABLE organization_credentials DROP CONSTRAINT IF EXISTS organization_credentials_organization_id_provider_key;

DROP INDEX IF EXISTS organization_credentials_org_provider_kind_uniq;

CREATE UNIQUE INDEX organization_credentials_org_provider_kind_uniq
  ON organization_credentials (organization_id, provider, credential_kind);

COMMIT;
