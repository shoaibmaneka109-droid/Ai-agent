-- SecurePay: PostgreSQL schema for multi-tenant organizations
-- Run against your database: psql $DATABASE_URL -f database/schema.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Application roles: Solo (individual) vs Agency (company-style multi-user org)
CREATE TYPE user_type AS ENUM ('solo', 'agency');

-- Payment / payout providers whose API secrets we store encrypted per tenant
CREATE TYPE credential_provider AS ENUM ('stripe', 'airwallex');

CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  billing_email   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  user_type       user_type NOT NULL DEFAULT 'solo',
  default_org_id  UUID REFERENCES organizations (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Links users to tenants; enforces isolation for Agency; Solo typically has one membership
CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at       TIMESTAMPTZ,
  PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX idx_organization_members_user ON organization_members (user_id);

-- Encrypted at rest: ciphertext + IV + auth tag (AES-256-GCM); never store plaintext keys
CREATE TABLE organization_credentials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  provider        credential_provider NOT NULL,
  label           TEXT,
  ciphertext      BYTEA NOT NULL,
  iv              BYTEA NOT NULL,
  auth_tag        BYTEA NOT NULL,
  key_version     SMALLINT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider)
);

CREATE INDEX idx_org_credentials_org ON organization_credentials (organization_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER organization_credentials_updated_at
  BEFORE UPDATE ON organization_credentials
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

COMMIT;
