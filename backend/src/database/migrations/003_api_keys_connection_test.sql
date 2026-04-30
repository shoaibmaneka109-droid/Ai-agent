-- ============================================================
--  SecurePay – API Keys: Connection Test & Wise Provider
--  Migration: 003_api_keys_connection_test
-- ============================================================

-- ─── Add 'wise' to the api_provider enum ─────────────────────
-- PostgreSQL requires ALTER TYPE for enum additions.
ALTER TYPE api_provider ADD VALUE IF NOT EXISTS 'wise';

-- ─── Add metadata columns to organization_api_keys ───────────
ALTER TABLE organization_api_keys
    -- Last connection test result: 'ok' | 'failed' | 'pending' | null (never tested)
    ADD COLUMN last_test_status  VARCHAR(20)  DEFAULT NULL,
    -- Human-readable message from the last test ('Connected', error description, etc.)
    ADD COLUMN last_test_message TEXT         DEFAULT NULL,
    -- When the last test was performed
    ADD COLUMN last_tested_at    TIMESTAMPTZ  DEFAULT NULL,
    -- Latency of the last test in milliseconds
    ADD COLUMN last_test_latency INTEGER      DEFAULT NULL,
    -- Extra metadata column for the provider-specific fields (e.g. Wise profile id)
    ADD COLUMN extra_config      JSONB        NOT NULL DEFAULT '{}';

-- Index for quickly finding keys by their last test status
CREATE INDEX idx_api_keys_test_status ON organization_api_keys (organization_id, last_test_status);

INSERT INTO schema_migrations (version) VALUES ('003_api_keys_connection_test');
