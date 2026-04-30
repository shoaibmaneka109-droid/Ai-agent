-- SecurePay Migration: 003_provider_connections
-- Self-service payment-provider integration management.
-- Each organization can configure its own keys for Stripe, Airwallex, and Wise
-- independently. All secret material is AES-256-GCM encrypted at the application
-- layer before reaching this table.

-- ============================================================
-- PROVIDER ENUM (extends existing api_key_provider, separate so we
-- can evolve independently)
-- ============================================================
CREATE TYPE integration_provider AS ENUM ('stripe', 'airwallex', 'wise');
CREATE TYPE connection_status AS ENUM ('unconfigured', 'configured', 'verified', 'failed');

-- ============================================================
-- PROVIDER_CONNECTIONS
-- One row per (organization, provider, environment) combination.
-- Clients self-service their own credentials — no manual admin step needed.
-- ============================================================
CREATE TABLE provider_connections (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Which provider + which mode
    provider                integration_provider NOT NULL,
    environment             api_key_env NOT NULL DEFAULT 'test',

    -- Human-readable label the admin gives this connection
    display_name            VARCHAR(255) NOT NULL,

    -- ── Secret fields (all AES-256-GCM encrypted, format: iv:authTag:ct) ──
    -- Primary API secret key (required for all providers)
    encrypted_secret_key    TEXT NOT NULL,
    -- Publishable / client key (Stripe pk_*, optional for others)
    encrypted_publishable_key TEXT,
    -- Webhook signing secret  (e.g. Stripe whsec_*, Airwallex webhook_secret)
    encrypted_webhook_secret  TEXT,
    -- Extra provider-specific credential (Wise: Profile ID; Airwallex: client_id)
    encrypted_extra_credential TEXT,

    -- ── Non-sensitive display metadata ──
    -- First 12 chars of the secret key, safe to show in UI
    key_prefix              VARCHAR(30),
    -- Webhook endpoint URL registered at the provider (informational)
    webhook_endpoint_url    VARCHAR(500),

    -- ── Connection status ──
    status                  connection_status NOT NULL DEFAULT 'unconfigured',
    last_test_at            TIMESTAMPTZ,
    last_test_success       BOOLEAN,
    last_test_message       TEXT,
    last_test_latency_ms    INTEGER,

    -- ── Audit ──
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_by              UUID NOT NULL REFERENCES users(id),
    updated_by              UUID REFERENCES users(id),
    last_rotated_at         TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Only one active connection per (org, provider, environment)
    UNIQUE (organization_id, provider, environment)
);

CREATE INDEX idx_pconn_org_id   ON provider_connections(organization_id);
CREATE INDEX idx_pconn_provider ON provider_connections(provider);
CREATE INDEX idx_pconn_status   ON provider_connections(status);

COMMENT ON TABLE provider_connections IS
  'Self-service payment provider integrations. All secret fields are AES-256-GCM encrypted.';
COMMENT ON COLUMN provider_connections.encrypted_secret_key IS
  'AES-256-GCM encrypted. Format: iv:authTag:ciphertext (hex). Never returned to clients.';
COMMENT ON COLUMN provider_connections.encrypted_webhook_secret IS
  'AES-256-GCM encrypted webhook signing secret used to verify incoming webhooks.';

-- ── updated_at trigger ──────────────────────────────────────────────────────
CREATE TRIGGER trg_pconn_updated_at
    BEFORE UPDATE ON provider_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row-Level Security ──────────────────────────────────────────────────────
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_pconn ON provider_connections
    USING (organization_id = current_setting('app.current_org_id', TRUE)::UUID);

-- ── CONNECTION_TEST_LOGS
-- Immutable history of every test run for debugging.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE connection_test_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    connection_id       UUID NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    triggered_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    success             BOOLEAN NOT NULL,
    latency_ms          INTEGER,
    http_status         INTEGER,
    response_summary    TEXT,    -- sanitised, no secrets
    error_code          VARCHAR(100),
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ctlogs_connection_id ON connection_test_logs(connection_id);
CREATE INDEX idx_ctlogs_org_id        ON connection_test_logs(organization_id);
CREATE INDEX idx_ctlogs_created_at    ON connection_test_logs(created_at DESC);

ALTER TABLE connection_test_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_ctlogs ON connection_test_logs
    USING (organization_id = current_setting('app.current_org_id', TRUE)::UUID);

-- ── migration record ────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES ('003_provider_connections')
ON CONFLICT DO NOTHING;
