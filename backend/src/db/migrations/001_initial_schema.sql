-- SecurePay Initial Database Schema
-- Migration: 001_initial_schema
-- Multi-tenant architecture with Row-Level Security (RLS)

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE org_plan AS ENUM ('solo', 'agency');
CREATE TYPE org_status AS ENUM ('active', 'suspended', 'cancelled');
CREATE TYPE api_key_provider AS ENUM ('stripe', 'airwallex', 'custom');
CREATE TYPE api_key_env AS ENUM ('live', 'test');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded', 'cancelled');
CREATE TYPE payment_currency AS ENUM ('USD', 'EUR', 'GBP', 'AUD', 'SGD', 'HKD');

-- ============================================================
-- ORGANIZATIONS (Tenants)
-- ============================================================
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    plan_type       org_plan NOT NULL DEFAULT 'solo',
    status          org_status NOT NULL DEFAULT 'active',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    -- Solo plan: individual details
    individual_name VARCHAR(255),
    tax_id          VARCHAR(100),

    -- Agency plan: company details
    company_name    VARCHAR(255),
    company_reg_no  VARCHAR(100),
    company_address TEXT,
    company_website VARCHAR(500),

    -- Limits per plan
    max_members     INTEGER NOT NULL DEFAULT 1,  -- 1 for solo, unlimited for agency
    max_api_keys    INTEGER NOT NULL DEFAULT 2,

    -- Billing
    billing_email   VARCHAR(255),
    stripe_customer_id VARCHAR(255),

    -- Metadata
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organizations IS 'Top-level tenants. Each org is fully isolated via RLS.';
COMMENT ON COLUMN organizations.plan_type IS 'solo = Individual, agency = Company/Team';

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'member',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at   TIMESTAMPTZ,
    avatar_url      VARCHAR(500),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);

COMMENT ON TABLE users IS 'Users belong to exactly one organization/tenant.';

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked         BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at      TIMESTAMPTZ,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- ============================================================
-- API KEYS (Encrypted at rest with AES-256-GCM)
-- ============================================================
CREATE TABLE api_keys (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name                VARCHAR(255) NOT NULL,
    provider            api_key_provider NOT NULL,
    environment         api_key_env NOT NULL DEFAULT 'test',

    -- Encrypted with AES-256-GCM; format: iv:authTag:ciphertext (hex)
    encrypted_secret_key TEXT NOT NULL,
    encrypted_publishable_key TEXT,  -- Optional (Stripe public key)

    -- Non-sensitive display metadata
    key_prefix          VARCHAR(20),   -- e.g. "sk_live_..." truncated for UI display
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at        TIMESTAMPTZ,
    last_rotated_at     TIMESTAMPTZ,

    created_by          UUID NOT NULL REFERENCES users(id),
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(organization_id, provider, environment)
);

CREATE INDEX idx_api_keys_organization_id ON api_keys(organization_id);

COMMENT ON TABLE api_keys IS 'Payment provider API keys. Secrets are AES-256-GCM encrypted at application layer.';
COMMENT ON COLUMN api_keys.encrypted_secret_key IS 'AES-256-GCM encrypted; never returned to clients in plaintext.';

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by          UUID NOT NULL REFERENCES users(id),

    -- Provider reference
    provider            api_key_provider NOT NULL,
    provider_payment_id VARCHAR(255),          -- e.g. Stripe charge ID
    provider_metadata   JSONB DEFAULT '{}',

    -- Payment details
    amount              BIGINT NOT NULL,        -- Amount in smallest currency unit (cents)
    currency            payment_currency NOT NULL DEFAULT 'USD',
    status              payment_status NOT NULL DEFAULT 'pending',
    description         TEXT,

    -- Customer info (nullable for anonymous)
    customer_email      VARCHAR(255),
    customer_name       VARCHAR(255),

    -- Refund tracking
    refunded_amount     BIGINT NOT NULL DEFAULT 0,
    refunded_at         TIMESTAMPTZ,

    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_organization_id ON payments(organization_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_payments_provider_payment_id ON payments(provider_payment_id);

-- ============================================================
-- AUDIT LOG
-- ============================================================
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,    -- e.g. 'api_key.created', 'user.invited'
    resource_type   VARCHAR(100),
    resource_id     UUID,
    ip_address      INET,
    user_agent      TEXT,
    old_values      JSONB,
    new_values      JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_organization_id ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================
-- INVITATIONS (Agency plan: invite team members)
-- ============================================================
CREATE TABLE invitations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invited_by      UUID NOT NULL REFERENCES users(id),
    email           VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'member',
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    accepted        BOOLEAN NOT NULL DEFAULT FALSE,
    accepted_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(organization_id, email)
);

CREATE INDEX idx_invitations_organization_id ON invitations(organization_id);
CREATE INDEX idx_invitations_token_hash ON invitations(token_hash);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW-LEVEL SECURITY (RLS)
-- Enforces tenant isolation at the database layer.
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: rows are visible only within the current tenant session
CREATE POLICY tenant_isolation_users ON users
    USING (organization_id = current_setting('app.current_org_id', TRUE)::UUID);

CREATE POLICY tenant_isolation_api_keys ON api_keys
    USING (organization_id = current_setting('app.current_org_id', TRUE)::UUID);

CREATE POLICY tenant_isolation_payments ON payments
    USING (organization_id = current_setting('app.current_org_id', TRUE)::UUID);

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    USING (organization_id = current_setting('app.current_org_id', TRUE)::UUID);

CREATE POLICY tenant_isolation_invitations ON invitations
    USING (organization_id = current_setting('app.current_org_id', TRUE)::UUID);

CREATE POLICY tenant_isolation_refresh_tokens ON refresh_tokens
    USING (user_id IN (
        SELECT id FROM users
        WHERE organization_id = current_setting('app.current_org_id', TRUE)::UUID
    ));

-- ============================================================
-- MIGRATIONS TRACKING TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(50) PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO schema_migrations (version) VALUES ('001_initial_schema');
