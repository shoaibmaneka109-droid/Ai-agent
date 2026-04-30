CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_type') THEN
    CREATE TYPE tenant_type AS ENUM ('solo', 'agency');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'membership_role') THEN
    CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'member', 'billing');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_name') THEN
    CREATE TYPE provider_name AS ENUM ('stripe', 'airwallex');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'expired', 'hibernated', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  tenant_type tenant_type NOT NULL,
  display_name TEXT NOT NULL,
  owner_user_id UUID,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role membership_role NOT NULL,
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

ALTER TABLE tenants
  ADD CONSTRAINT tenants_owner_user_fk
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS payment_provider_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider provider_name NOT NULL,
  account_label TEXT NOT NULL,
  public_key TEXT,
  algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  key_fingerprint TEXT NOT NULL,
  encrypted_secret BYTEA NOT NULL,
  iv BYTEA NOT NULL,
  auth_tag BYTEA NOT NULL,
  key_version TEXT NOT NULL DEFAULT 'v1',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider, account_label)
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL DEFAULT 'starter',
  status subscription_status NOT NULL,
  lifecycle_state TEXT NOT NULL DEFAULT 'trial',
  is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  current_period_starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_ends_at TIMESTAMPTZ,
  hibernates_at TIMESTAMPTZ,
  seat_limit INTEGER NOT NULL DEFAULT 1,
  feature_lock_state TEXT NOT NULL DEFAULT 'full_access',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  ip_address INET,
  user_agent TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_id
  ON tenant_memberships (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user_id
  ON tenant_memberships (user_id);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_tenant_id
  ON payment_provider_accounts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_tenant_id_created_at
  ON tenant_subscriptions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_user_id
  ON auth_refresh_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id_created_at
  ON audit_logs (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenants_set_updated_at ON tenants;
CREATE TRIGGER tenants_set_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS payment_provider_accounts_set_updated_at ON payment_provider_accounts;
CREATE TRIGGER payment_provider_accounts_set_updated_at
BEFORE UPDATE ON payment_provider_accounts
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS tenant_subscriptions_set_updated_at ON tenant_subscriptions;
CREATE TRIGGER tenant_subscriptions_set_updated_at
BEFORE UPDATE ON tenant_subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_provider_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

DROP POLICY IF EXISTS tenants_isolation_policy ON tenants;
CREATE POLICY tenants_isolation_policy
  ON tenants
  USING (id = current_tenant_id());

DROP POLICY IF EXISTS memberships_isolation_policy ON tenant_memberships;
CREATE POLICY memberships_isolation_policy
  ON tenant_memberships
  USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS provider_accounts_isolation_policy ON payment_provider_accounts;
CREATE POLICY provider_accounts_isolation_policy
  ON payment_provider_accounts
  USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS tenant_subscriptions_isolation_policy ON tenant_subscriptions;
CREATE POLICY tenant_subscriptions_isolation_policy
  ON tenant_subscriptions
  USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS audit_logs_isolation_policy ON audit_logs;
CREATE POLICY audit_logs_isolation_policy
  ON audit_logs
  USING (tenant_id = current_tenant_id());
