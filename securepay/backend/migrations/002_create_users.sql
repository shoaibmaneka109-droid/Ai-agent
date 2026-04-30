-- Migration 002: Users & roles

BEGIN;

-- ─── User role ────────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'locked');

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  email              VARCHAR(255) NOT NULL,
  password_hash      TEXT NOT NULL,
  first_name         VARCHAR(100) NOT NULL,
  last_name          VARCHAR(100) NOT NULL,

  role               user_role   NOT NULL DEFAULT 'member',
  status             user_status NOT NULL DEFAULT 'active',

  -- MFA
  mfa_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  mfa_secret         TEXT,                          -- TOTP secret (encrypted at app layer)

  -- Session management
  refresh_token_hash TEXT,
  last_login_at      TIMESTAMPTZ,
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until       TIMESTAMPTZ,

  -- Profile
  avatar_url         TEXT,
  timezone           VARCHAR(100) DEFAULT 'UTC',
  preferences        JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  email_verified_at  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, email)
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email     ON users(email);
CREATE INDEX idx_users_role      ON users(tenant_id, role);
CREATE INDEX idx_users_status    ON users(status);

-- ─── Email verification tokens ────────────────────────────────────────────────
CREATE TABLE email_verifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Password reset tokens ────────────────────────────────────────────────────
CREATE TABLE password_resets (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Back-fill invitation FK ──────────────────────────────────────────────────
ALTER TABLE tenant_invitations
  ADD CONSTRAINT fk_invited_by FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;

-- ─── Audit trigger ────────────────────────────────────────────────────────────
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
