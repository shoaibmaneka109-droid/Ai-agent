-- Migration 001: Tenants (organizations)
-- Supports two plan types: 'solo' (individual) and 'agency' (company)

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Plan type ────────────────────────────────────────────────────────────────
CREATE TYPE tenant_plan AS ENUM ('solo', 'agency');

-- ─── Tenant status ────────────────────────────────────────────────────────────
CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'cancelled', 'pending_verification');

-- ─── Tenants ──────────────────────────────────────────────────────────────────
CREATE TABLE tenants (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug              VARCHAR(63)  NOT NULL UNIQUE,   -- URL-safe identifier
  name              VARCHAR(255) NOT NULL,
  plan              tenant_plan  NOT NULL DEFAULT 'solo',
  status            tenant_status NOT NULL DEFAULT 'pending_verification',

  -- Company details (agency plan)
  company_name      VARCHAR(255),
  company_tax_id    VARCHAR(100),
  company_address   JSONB,                          -- { line1, line2, city, state, country, postal_code }

  -- Contact
  contact_email     VARCHAR(255) NOT NULL,
  contact_phone     VARCHAR(50),

  -- Limits per plan
  max_users         INT NOT NULL DEFAULT 1,         -- solo=1, agency=unlimited(-1)
  max_api_keys      INT NOT NULL DEFAULT 2,

  -- Billing
  stripe_customer_id VARCHAR(255),

  -- Metadata
  settings          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{1,61}[a-z0-9]$')
);

CREATE INDEX idx_tenants_slug   ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_plan   ON tenants(plan);

-- ─── Tenant invitations ───────────────────────────────────────────────────────
CREATE TABLE tenant_invitations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(50)  NOT NULL DEFAULT 'member',
  token       VARCHAR(255) NOT NULL UNIQUE,
  invited_by  UUID,                                 -- FK to users added after users table
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, email)
);

-- ─── Audit trigger: auto-update updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
