-- Migration 006: Trial periods, Data Hibernation, and Team Invite limits
--
-- Business rules implemented here:
--   Solo plan   → 15-day free trial,  1 user max
--   Agency plan → 30-day free trial,  9 employees max during trial (owner + 9 = 10 seats)
--   Hibernation → subscription expired/unpaid → data visible, API/autofill locked

BEGIN;

-- ─── 1. Extend subscription_status with 'hibernating' ─────────────────────────
-- Postgres can only ADD values to an enum, not reorder.
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'hibernating';

-- ─── 2. Trial metadata columns on subscriptions ───────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_days         INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_started_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_expired_at   TIMESTAMPTZ, -- set when trial expires
  ADD COLUMN IF NOT EXISTS hibernation_started_at TIMESTAMPTZ,
  -- grace period after trial before hard-locking features (hours)
  ADD COLUMN IF NOT EXISTS grace_period_hours INT          NOT NULL DEFAULT 24,
  -- cached access flags updated by the expiry job (denormalized for fast reads)
  ADD COLUMN IF NOT EXISTS api_access         BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS autofill_access    BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS data_read_only     BOOLEAN      NOT NULL DEFAULT FALSE;

-- ─── 3. Team invite cap: agency trial capped at 9 employees ───────────────────
-- We track this separately so it survives the trial→paid upgrade.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS trial_employee_cap INT,         -- NULL = no cap (paid plan)
  ADD COLUMN IF NOT EXISTS current_employee_count INT NOT NULL DEFAULT 0;

-- Back-fill employee counts for existing rows
UPDATE tenants t
   SET current_employee_count = (
         SELECT COUNT(*) - 1            -- minus the owner
         FROM users u
         WHERE u.tenant_id = t.id
           AND u.role != 'owner'
           AND u.status = 'active'
       );

-- ─── 4. Subscription history / audit trail ────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id UUID        REFERENCES subscriptions(id) ON DELETE SET NULL,
  event_type      VARCHAR(80) NOT NULL,  -- trial_started, trial_expired, hibernated,
                                         -- reactivated, payment_received, etc.
  old_status      VARCHAR(50),
  new_status      VARCHAR(50),
  metadata        JSONB       NOT NULL DEFAULT '{}',
  triggered_by    VARCHAR(80) NOT NULL DEFAULT 'system', -- 'system' | user-id
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_events_tenant ON subscription_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_events_type   ON subscription_events(event_type);

-- ─── 5. API / autofill access log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_denied_log (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  feature     VARCHAR(80) NOT NULL,   -- 'api_access' | 'autofill'
  reason      VARCHAR(80) NOT NULL,   -- 'trial_expired' | 'hibernated' | 'cancelled'
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_denied_tenant ON access_denied_log(tenant_id, created_at DESC);

-- ─── 6. Update subscription_plans with trial lengths ──────────────────────────
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS trial_days INT NOT NULL DEFAULT 0;

UPDATE subscription_plans SET trial_days = 15 WHERE plan_type = 'solo';
UPDATE subscription_plans SET trial_days = 30 WHERE plan_type = 'agency';

-- ─── 7. Helper view: current tenant access state ──────────────────────────────
CREATE OR REPLACE VIEW tenant_access_state AS
SELECT
  t.id                        AS tenant_id,
  t.slug,
  t.plan,
  t.status                    AS tenant_status,
  t.trial_employee_cap,
  t.current_employee_count,
  s.id                        AS subscription_id,
  s.status                    AS subscription_status,
  s.trial_days,
  s.trial_started_at,
  s.trial_end,
  s.trial_expired_at,
  s.hibernation_started_at,
  s.grace_period_hours,
  s.api_access,
  s.autofill_access,
  s.data_read_only,
  s.current_period_end,
  -- Days remaining in trial (negative = overdue)
  CASE WHEN s.trial_end IS NOT NULL
       THEN EXTRACT(EPOCH FROM (s.trial_end - NOW())) / 86400
       ELSE NULL
  END                         AS trial_days_remaining,
  -- Is currently in grace period (expired but not yet hibernated)
  CASE WHEN s.status = 'trialing' AND s.trial_end < NOW()
            AND NOW() < s.trial_end + (s.grace_period_hours * INTERVAL '1 hour')
       THEN TRUE ELSE FALSE
  END                         AS in_grace_period,
  s.cancelled_at,
  s.updated_at                AS subscription_updated_at
FROM tenants t
LEFT JOIN subscriptions s ON s.tenant_id = t.id;

COMMIT;
