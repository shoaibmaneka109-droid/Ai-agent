-- ============================================================
--  SecurePay – Initial Multi-Tenant Schema
--  Migration: 001_initial_schema
--  PostgreSQL 14+
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────────
CREATE TYPE org_type    AS ENUM ('solo', 'agency');
CREATE TYPE org_plan    AS ENUM ('free', 'starter', 'growth', 'enterprise');
CREATE TYPE user_role   AS ENUM ('owner', 'admin', 'member');
CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded', 'cancelled');
CREATE TYPE api_provider   AS ENUM ('stripe', 'airwallex', 'custom');

-- ─── organizations ───────────────────────────────────────────
-- Root tenant entity. Every other table references this via organization_id.
CREATE TABLE organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255)  NOT NULL,
    slug        VARCHAR(63)   NOT NULL,
    type        org_type      NOT NULL,
    plan        org_plan      NOT NULL DEFAULT 'free',
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    settings    JSONB         NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT organizations_slug_unique UNIQUE (slug),
    CONSTRAINT organizations_name_length CHECK (char_length(name) >= 2)
);

CREATE INDEX idx_organizations_slug ON organizations (slug);
CREATE INDEX idx_organizations_type ON organizations (type);

-- ─── users ───────────────────────────────────────────────────
-- Scoped to one organization; role drives RBAC within that org.
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    email           VARCHAR(320)  NOT NULL,
    password_hash   TEXT          NOT NULL,
    first_name      VARCHAR(100)  NOT NULL,
    last_name       VARCHAR(100)  NOT NULL,
    role            user_role     NOT NULL DEFAULT 'member',
    is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- Email is unique globally (a person cannot join two orgs with the same address)
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_email_format CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

CREATE INDEX idx_users_organization_id ON users (organization_id);
CREATE INDEX idx_users_email          ON users (email);
CREATE INDEX idx_users_role           ON users (organization_id, role);

-- ─── refresh_tokens ──────────────────────────────────────────
CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id    ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens (expires_at);

-- ─── organization_invitations ─────────────────────────────────
CREATE TABLE organization_invitations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    email           VARCHAR(320) NOT NULL,
    role            user_role   NOT NULL DEFAULT 'member',
    invited_by      UUID        REFERENCES users (id) ON DELETE SET NULL,
    token           TEXT        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT invitations_org_email_unique UNIQUE (organization_id, email)
);

CREATE INDEX idx_invitations_org_id ON organization_invitations (organization_id);
CREATE INDEX idx_invitations_token  ON organization_invitations (token);

-- ─── organization_api_keys ────────────────────────────────────
-- Stores AES-256-GCM encrypted payment provider credentials.
-- Plaintext key material NEVER persists; only the encrypted blob.
CREATE TABLE organization_api_keys (
    id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id          UUID         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    provider                 api_provider NOT NULL,
    label                    VARCHAR(100) NOT NULL,
    public_key               TEXT,                       -- publishable / client key (not secret)
    encrypted_secret_key     TEXT         NOT NULL,      -- AES-256-GCM ciphertext
    encrypted_webhook_secret TEXT,                       -- AES-256-GCM ciphertext (optional)
    is_active                BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT api_keys_label_org_unique UNIQUE (organization_id, provider, label)
);

CREATE INDEX idx_api_keys_org_id   ON organization_api_keys (organization_id);
CREATE INDEX idx_api_keys_provider ON organization_api_keys (organization_id, provider);
CREATE INDEX idx_api_keys_active   ON organization_api_keys (organization_id, is_active);

-- ─── payments ─────────────────────────────────────────────────
-- Tenant-scoped payment records. Linked to the provider key used.
CREATE TABLE payments (
    id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID           NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    provider        api_provider   NOT NULL,
    amount          BIGINT         NOT NULL CHECK (amount > 0),  -- smallest currency unit (cents)
    currency        CHAR(3)        NOT NULL,                     -- ISO 4217 e.g. 'USD'
    status          payment_status NOT NULL DEFAULT 'pending',
    external_id     VARCHAR(255),                                -- provider-side transaction ID
    api_key_id      UUID           REFERENCES organization_api_keys (id) ON DELETE SET NULL,
    metadata        JSONB          NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT payments_currency_format CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX idx_payments_org_id      ON payments (organization_id);
CREATE INDEX idx_payments_status      ON payments (organization_id, status);
CREATE INDEX idx_payments_provider    ON payments (organization_id, provider);
CREATE INDEX idx_payments_external_id ON payments (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_payments_created_at  ON payments (created_at DESC);

-- ─── audit_logs ───────────────────────────────────────────────
-- Immutable append-only log for security-sensitive actions.
CREATE TABLE audit_logs (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         UUID         REFERENCES users (id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,   -- e.g. 'api_key.created', 'payment.refunded'
    resource_type   VARCHAR(50),
    resource_id     UUID,
    metadata        JSONB        NOT NULL DEFAULT '{}',
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_org_id     ON audit_logs (organization_id);
CREATE INDEX idx_audit_logs_user_id    ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_action     ON audit_logs (action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- ─── updated_at trigger ───────────────────────────────────────
-- Automatically maintain updated_at on mutable tables.
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_organizations
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_api_keys
    BEFORE UPDATE ON organization_api_keys
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_payments
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── schema_migrations tracking ──────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(50)  PRIMARY KEY,
    applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('001_initial_schema');
