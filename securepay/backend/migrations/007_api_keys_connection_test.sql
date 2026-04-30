-- Migration 007: Add Wise provider, connection test tracking, extra credential fields

BEGIN;

-- ─── Add 'wise' to api_key_provider enum ─────────────────────────────────────
ALTER TYPE api_key_provider ADD VALUE IF NOT EXISTS 'wise';

-- ─── Connection test tracking columns ────────────────────────────────────────
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS last_test_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_test_status   VARCHAR(20),   -- 'success' | 'failure'
  ADD COLUMN IF NOT EXISTS last_test_message  TEXT,
  ADD COLUMN IF NOT EXISTS last_test_latency_ms INT;

-- ─── Provider-specific extra encrypted credential fields ──────────────────────
-- Airwallex uses client_id + api_key (not a plain secret key)
-- Wise uses an API token (Bearer) and optionally a profile ID
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS client_id_enc      TEXT,          -- Airwallex: client_id (encrypted)
  ADD COLUMN IF NOT EXISTS extra_config       JSONB NOT NULL DEFAULT '{}';
  -- extra_config stores non-sensitive provider metadata:
  --   Stripe:    { account_id, dashboard_url }
  --   Airwallex: { account_name }
  --   Wise:      { profile_id, profile_type }

-- ─── Connection test history table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_key_test_log (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id      UUID        NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tested_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL,    -- 'success' | 'failure'
  http_status     INT,                     -- HTTP status returned by provider
  message         TEXT,
  latency_ms      INT,
  provider_detail JSONB NOT NULL DEFAULT '{}',   -- parsed response metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_test_log_key    ON api_key_test_log(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_key_test_log_tenant ON api_key_test_log(tenant_id, created_at DESC);

-- ─── Update unique constraint to allow one active key per provider+env ────────
-- The existing DEFERRABLE constraint remains; no schema change needed.

COMMIT;
