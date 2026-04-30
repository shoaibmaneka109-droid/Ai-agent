-- SecurePay Migration: 002_subscription_trials
-- Adds trial periods, subscription lifecycle, and Data Hibernation support.

-- ============================================================
-- SUBSCRIPTION STATUS ENUM
-- trialing    → within trial window, full features enabled
-- active      → paid and current, full features enabled
-- hibernating → trial/subscription expired; login allowed,
--               API & autofill features LOCKED (Data Hibernation)
-- cancelled   → permanently cancelled by owner/admin
-- ============================================================
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'hibernating', 'cancelled');

-- ============================================================
-- EXTEND organizations TABLE
-- ============================================================
ALTER TABLE organizations
  -- Core subscription state
  ADD COLUMN subscription_status     subscription_status NOT NULL DEFAULT 'trialing',

  -- Trial window
  ADD COLUMN trial_duration_days     INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN trial_ends_at           TIMESTAMPTZ,

  -- Paid subscription window
  ADD COLUMN subscription_started_at TIMESTAMPTZ,
  ADD COLUMN subscription_ends_at    TIMESTAMPTZ,

  -- Agency-plan trial cap: max employees (excluding owner) during trial
  -- 0 = no cap (post-trial active). Defaults per plan set by application layer.
  ADD COLUMN trial_member_limit      INTEGER NOT NULL DEFAULT 0,

  -- Audit: when hibernation was entered
  ADD COLUMN hibernated_at           TIMESTAMPTZ,

  -- Audit: last time subscription was reactivated
  ADD COLUMN last_activated_at       TIMESTAMPTZ;

-- Backfill trial_ends_at for any pre-existing rows
UPDATE organizations
SET trial_ends_at = created_at + (trial_duration_days || ' days')::INTERVAL
WHERE trial_ends_at IS NULL;

-- ============================================================
-- SUBSCRIPTION EVENTS TABLE
-- Immutable ledger of every subscription state change.
-- ============================================================
CREATE TABLE subscription_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    event_type          VARCHAR(60) NOT NULL,
    -- e.g. 'trial_started', 'trial_expired', 'subscription_activated',
    --      'subscription_renewed', 'subscription_expired', 'hibernation_entered',
    --      'subscription_cancelled', 'subscription_reactivated'
    from_status         subscription_status,
    to_status           subscription_status NOT NULL,
    triggered_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    note                TEXT,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_events_org_id ON subscription_events(organization_id);
CREATE INDEX idx_sub_events_created_at ON subscription_events(created_at DESC);

-- ============================================================
-- RLS for subscription_events
-- ============================================================
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_sub_events ON subscription_events
    USING (organization_id = current_setting('app.current_org_id', TRUE)::UUID);

-- ============================================================
-- MIGRATIONS RECORD
-- ============================================================
INSERT INTO schema_migrations (version) VALUES ('002_subscription_trials')
ON CONFLICT DO NOTHING;
