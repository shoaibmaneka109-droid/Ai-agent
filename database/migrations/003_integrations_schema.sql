-- =============================================================================
-- SecurePay — Migration 003: Integrations / Self-Service API Key Management
-- =============================================================================
-- Extends api_keys to support:
--   • key_type  — differentiates card-issuing keys from other key types
--   • webhook_secret — separately encrypted webhook signing secret
--   • connection_test_* — last test result persisted so UI shows live status
--   • provider metadata — mode, display fields
-- Also adds a provider_catalog table so new providers are self-service.
-- =============================================================================

BEGIN;

-- ── New enum: what the key is used for ────────────────────────────────────────
CREATE TYPE api_key_type AS ENUM (
  'secret_key',       -- main API secret (e.g. Stripe sk_live_*)
  'publishable_key',  -- frontend-safe public key
  'webhook_secret',   -- standalone webhook signing secret
  'access_token',     -- OAuth bearer token (e.g. Wise)
  'api_token'         -- generic token (e.g. Airwallex client_secret pair)
);

-- ── Extend api_keys ───────────────────────────────────────────────────────────
ALTER TABLE api_keys
  ADD COLUMN key_type              api_key_type NOT NULL DEFAULT 'secret_key',
  ADD COLUMN encrypted_webhook_secret TEXT,          -- AES-256-GCM bundle (nullable)
  ADD COLUMN webhook_secret_hint      VARCHAR(20),
  ADD COLUMN connection_test_status   VARCHAR(20),   -- 'success' | 'failed' | null
  ADD COLUMN connection_test_message  TEXT,
  ADD COLUMN connection_tested_at     TIMESTAMPTZ,
  ADD COLUMN extra_config             JSONB NOT NULL DEFAULT '{}'; -- provider-specific extras

-- Relax the unique constraint that prevented multiple key types per provider/env
ALTER TABLE api_keys
  DROP CONSTRAINT IF EXISTS uq_api_keys_active;

-- One active key of each (provider, environment, key_type) per org
CREATE UNIQUE INDEX uq_api_keys_per_type
  ON api_keys (organization_id, provider, environment, key_type)
  WHERE is_active = true;

CREATE INDEX idx_api_keys_key_type ON api_keys (organization_id, provider, key_type);

-- ── Provider catalog (self-service — no code changes needed for new providers) ─
CREATE TABLE provider_catalog (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                VARCHAR(50)  NOT NULL UNIQUE,  -- 'stripe', 'airwallex', 'wise'
  display_name        VARCHAR(100) NOT NULL,
  logo_url            TEXT,
  website_url         TEXT,
  docs_url            TEXT,
  supported_key_types api_key_type[] NOT NULL DEFAULT '{}',
  test_endpoint       TEXT,          -- e.g. 'https://api.stripe.com/v1/balance'
  test_method         VARCHAR(10) NOT NULL DEFAULT 'GET',
  auth_scheme         VARCHAR(30) NOT NULL DEFAULT 'bearer', -- bearer | basic | header
  auth_header_name    VARCHAR(60),   -- custom header name if auth_scheme='header'
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
  sort_order          SMALLINT     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_provider_catalog_active ON provider_catalog (is_active, sort_order);

-- ── Seed the catalog ──────────────────────────────────────────────────────────
INSERT INTO provider_catalog
  (slug, display_name, website_url, docs_url, supported_key_types,
   test_endpoint, test_method, auth_scheme, sort_order)
VALUES
  (
    'stripe',
    'Stripe',
    'https://stripe.com',
    'https://docs.stripe.com',
    ARRAY['secret_key','publishable_key','webhook_secret']::api_key_type[],
    'https://api.stripe.com/v1/balance',
    'GET', 'bearer', 1
  ),
  (
    'airwallex',
    'Airwallex',
    'https://airwallex.com',
    'https://www.airwallex.com/docs',
    ARRAY['secret_key','api_token','webhook_secret']::api_key_type[],
    'https://api.airwallex.com/api/v1/authentication/login',
    'POST', 'header', 2
  ),
  (
    'wise',
    'Wise (TransferWise)',
    'https://wise.com',
    'https://docs.wise.com',
    ARRAY['access_token','webhook_secret']::api_key_type[],
    'https://api.wise.com/v1/profiles',
    'GET', 'bearer', 3
  ),
  (
    'paypal',
    'PayPal',
    'https://paypal.com',
    'https://developer.paypal.com/docs',
    ARRAY['secret_key','api_token','webhook_secret']::api_key_type[],
    'https://api.paypal.com/v1/oauth2/token',
    'POST', 'basic', 4
  ),
  (
    'braintree',
    'Braintree',
    'https://braintreepayments.com',
    'https://developer.paybraintree.com/docs',
    ARRAY['secret_key','api_token']::api_key_type[],
    NULL,
    'GET', 'bearer', 5
  );

-- ── Audit log: new action ─────────────────────────────────────────────────────
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'api_key.tested';

COMMIT;
