-- =============================================================================
-- SecurePay — Initial Database Schema
-- Migration: 001_initial_schema
-- =============================================================================
-- Multi-tenant design: every tenant row is scoped by organization_id.
-- Row-level isolation is enforced in the application layer (service files)
-- and should be augmented with PostgreSQL RLS in production.
-- =============================================================================

BEGIN;

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enum types ────────────────────────────────────────────────────────────────

CREATE TYPE org_type AS ENUM ('solo', 'agency');

CREATE TYPE org_plan AS ENUM ('free', 'starter', 'professional', 'enterprise');

CREATE TYPE user_role AS ENUM ('superadmin', 'owner', 'admin', 'member');

CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'disputed');

CREATE TYPE payment_provider AS ENUM ('stripe', 'airwallex', 'paypal', 'braintree');

CREATE TYPE key_environment AS ENUM ('live', 'sandbox');

CREATE TYPE audit_action AS ENUM (
  'user.login', 'user.logout', 'user.created', 'user.updated', 'user.deleted',
  'org.created', 'org.updated', 'org.plan_changed',
  'api_key.created', 'api_key.rotated', 'api_key.deleted',
  'payment.created', 'payment.refunded'
);

-- =============================================================================
-- ORGANIZATIONS (tenants)
-- =============================================================================

CREATE TABLE organizations (
  id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         VARCHAR(255) NOT NULL,
  slug         VARCHAR(100) NOT NULL UNIQUE,          -- URL-safe identifier
  type         org_type     NOT NULL DEFAULT 'solo',  -- 'solo' | 'agency'
  plan         org_plan     NOT NULL DEFAULT 'free',
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  settings     JSONB        NOT NULL DEFAULT '{}',    -- tenant-level feature flags / preferences
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT organizations_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{1,98}[a-z0-9]$')
);

CREATE INDEX idx_organizations_slug      ON organizations (slug);
CREATE INDEX idx_organizations_is_active ON organizations (is_active);

COMMENT ON TABLE  organizations          IS 'Top-level tenant entity. One row per customer account.';
COMMENT ON COLUMN organizations.type     IS 'solo = individual freelancer; agency = company with multiple members';
COMMENT ON COLUMN organizations.settings IS 'Arbitrary tenant configuration stored as JSONB';

-- =============================================================================
-- USERS
-- =============================================================================

CREATE TABLE users (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  email            VARCHAR(320) NOT NULL UNIQUE,
  password_hash    TEXT         NOT NULL,
  first_name       VARCHAR(100),
  last_name        VARCHAR(100),
  role             user_role    NOT NULL DEFAULT 'member',
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_format CHECK (email = lower(email))
);

CREATE INDEX idx_users_organization_id ON users (organization_id);
CREATE INDEX idx_users_email           ON users (email);
CREATE INDEX idx_users_role            ON users (organization_id, role);

COMMENT ON TABLE  users       IS 'Platform users, always scoped to an organization.';
COMMENT ON COLUMN users.role  IS 'superadmin: platform staff; owner: org creator; admin: can manage members; member: standard access';

-- =============================================================================
-- API KEYS  (encrypted at rest using AES-256-GCM)
-- =============================================================================

CREATE TABLE api_keys (
  id               UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID             NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  provider         payment_provider NOT NULL,
  label            VARCHAR(255)     NOT NULL,           -- human-readable name
  encrypted_key    TEXT             NOT NULL,           -- AES-256-GCM bundle: iv:tag:ciphertext
  key_hint         VARCHAR(20)      NOT NULL,           -- e.g. "sk_l****ve" — safe to display
  environment      key_environment  NOT NULL DEFAULT 'live',
  is_active        BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  -- One active key per (org, provider, environment) pair
  CONSTRAINT uq_api_keys_active UNIQUE (organization_id, provider, environment)
);

CREATE INDEX idx_api_keys_organization_id ON api_keys (organization_id);
CREATE INDEX idx_api_keys_provider        ON api_keys (organization_id, provider, environment);

COMMENT ON TABLE  api_keys               IS 'Payment provider API keys, AES-256-GCM encrypted. Raw values never stored.';
COMMENT ON COLUMN api_keys.encrypted_key IS 'Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>';
COMMENT ON COLUMN api_keys.key_hint      IS 'Non-sensitive prefix+suffix shown in UI (e.g. sk_l****ve)';

-- =============================================================================
-- PAYMENTS
-- =============================================================================

CREATE TABLE payments (
  id                      UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id         UUID             NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  provider                payment_provider NOT NULL,
  amount                  BIGINT           NOT NULL CHECK (amount > 0),  -- smallest currency unit (e.g. cents)
  currency                CHAR(3)          NOT NULL,                      -- ISO 4217
  status                  payment_status   NOT NULL DEFAULT 'pending',
  provider_transaction_id VARCHAR(255),                                   -- external txn ID from provider
  environment             key_environment  NOT NULL DEFAULT 'live',
  metadata                JSONB            NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_organization_id ON payments (organization_id);
CREATE INDEX idx_payments_status          ON payments (organization_id, status);
CREATE INDEX idx_payments_provider        ON payments (organization_id, provider);
CREATE INDEX idx_payments_created_at      ON payments (organization_id, created_at DESC);

COMMENT ON TABLE  payments        IS 'Payment transactions for each tenant.';
COMMENT ON COLUMN payments.amount IS 'Always stored in the smallest currency unit (e.g. USD cents).';

-- =============================================================================
-- AUDIT LOG
-- =============================================================================

CREATE TABLE audit_logs (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id          UUID         REFERENCES users (id) ON DELETE SET NULL,
  action           audit_action NOT NULL,
  target_type      VARCHAR(50),                  -- e.g. 'user', 'payment', 'api_key'
  target_id        UUID,
  ip_address       INET,
  user_agent       TEXT,
  payload          JSONB        NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_organization_id ON audit_logs (organization_id);
CREATE INDEX idx_audit_logs_user_id         ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_action          ON audit_logs (organization_id, action);
CREATE INDEX idx_audit_logs_created_at      ON audit_logs (organization_id, created_at DESC);

COMMENT ON TABLE audit_logs IS 'Immutable audit trail. Rows are never updated or deleted.';

-- =============================================================================
-- REFRESH TOKENS  (server-side invalidation support)
-- =============================================================================

CREATE TABLE refresh_tokens (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  token_hash       TEXT        NOT NULL UNIQUE,   -- SHA-256 of the JWT refresh token
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash);

COMMENT ON TABLE refresh_tokens IS 'Allows server-side revocation of refresh tokens.';

-- =============================================================================
-- updated_at trigger function
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_api_keys
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_payments
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMIT;
