-- =============================================================================
-- SecurePay — Migration 002: Subscription & Trial System
-- =============================================================================
-- Business rules encoded here:
--   • solo  org → 15-day free trial
--   • agency org → 30-day free trial, max 9 employee seats during trial
--   • subscription_status drives Data Hibernation:
--       'trialing'  → full access
--       'active'    → full access
--       'expired'   → hibernated: read-only, API & auto-fill locked
--       'cancelled' → hibernated
--       'suspended' → hibernated (admin action)
-- =============================================================================

BEGIN;

-- ── New enum: subscription lifecycle states ────────────────────────────────
CREATE TYPE subscription_status AS ENUM (
  'trialing',    -- within the free-trial window
  'active',      -- paid and current
  'past_due',    -- payment failed, grace period
  'expired',     -- trial ended or subscription lapsed — hibernated
  'cancelled',   -- user cancelled — hibernated
  'suspended'    -- platform-level suspension — hibernated
);

-- ── Extend organizations with subscription columns ─────────────────────────
ALTER TABLE organizations
  ADD COLUMN subscription_status subscription_status NOT NULL DEFAULT 'trialing',
  ADD COLUMN trial_ends_at        TIMESTAMPTZ,          -- set on registration
  ADD COLUMN subscription_ends_at TIMESTAMPTZ,          -- set on payment activation
  ADD COLUMN max_seats            SMALLINT    NOT NULL DEFAULT 1,  -- seat limit during trial
  ADD COLUMN subscribed_at        TIMESTAMPTZ,          -- first successful payment
  ADD COLUMN payment_provider     VARCHAR(50),          -- e.g. 'stripe'
  ADD COLUMN payment_customer_id  VARCHAR(255),         -- provider customer ID
  ADD COLUMN payment_subscription_id VARCHAR(255);      -- provider subscription ID

-- ── Back-fill existing rows with sensible defaults ─────────────────────────
-- (solo orgs get 15-day trial, agency get 30-day trial)
UPDATE organizations
SET
  trial_ends_at = CASE
    WHEN type = 'solo'   THEN created_at + INTERVAL '15 days'
    WHEN type = 'agency' THEN created_at + INTERVAL '30 days'
    ELSE                      created_at + INTERVAL '15 days'
  END,
  max_seats = CASE
    WHEN type = 'agency' THEN 9
    ELSE 1
  END,
  subscription_status = CASE
    WHEN (type = 'solo'   AND created_at + INTERVAL '15 days' > NOW()) THEN 'trialing'
    WHEN (type = 'agency' AND created_at + INTERVAL '30 days' > NOW()) THEN 'trialing'
    ELSE 'expired'
  END;

-- ── Index for expiration background jobs ──────────────────────────────────
CREATE INDEX idx_organizations_sub_status
  ON organizations (subscription_status);

CREATE INDEX idx_organizations_trial_ends
  ON organizations (trial_ends_at)
  WHERE subscription_status = 'trialing';

CREATE INDEX idx_organizations_sub_ends
  ON organizations (subscription_ends_at)
  WHERE subscription_status = 'active';

-- ── Extend audit_log action enum ──────────────────────────────────────────
-- PostgreSQL does not support DROP VALUE, so we add new values only.
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'subscription.trial_started';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'subscription.activated';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'subscription.expired';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'subscription.cancelled';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'subscription.reactivated';

-- ── subscription_events (immutable payment/subscription lifecycle log) ────
CREATE TABLE subscription_events (
  id               UUID               PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID               NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  event_type       VARCHAR(80)        NOT NULL,   -- e.g. 'trial.started', 'payment.succeeded'
  provider         VARCHAR(50),
  provider_event_id VARCHAR(255),                 -- idempotency key from payment provider
  payload          JSONB              NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_events_org  ON subscription_events (organization_id, created_at DESC);
CREATE INDEX idx_sub_events_type ON subscription_events (event_type);

COMMENT ON TABLE subscription_events IS
  'Immutable log of subscription lifecycle events. Used for audit, support, and billing reconciliation.';

COMMIT;
