-- ============================================================
--  SecurePay – Subscription & Trial System
--  Migration: 002_subscriptions
-- ============================================================

-- ─── New Enums ────────────────────────────────────────────────
CREATE TYPE subscription_status AS ENUM (
    'trialing',       -- within free trial window, full access
    'active',         -- paid subscription, full access
    'hibernating',    -- trial/subscription expired; read-only, API locked
    'cancelled'       -- owner explicitly cancelled; same restrictions as hibernating
);

-- ─── Extend organizations ─────────────────────────────────────
ALTER TABLE organizations
    ADD COLUMN subscription_status  subscription_status  NOT NULL DEFAULT 'trialing',
    ADD COLUMN trial_starts_at      TIMESTAMPTZ,
    ADD COLUMN trial_ends_at        TIMESTAMPTZ,
    -- When status transitions to hibernating this is stamped
    ADD COLUMN hibernated_at        TIMESTAMPTZ,
    -- Max employees allowed during trial (1 = solo-only, 9 = agency trial cap)
    ADD COLUMN trial_member_limit   SMALLINT             NOT NULL DEFAULT 1;

-- Backfill existing rows: treat them as active (pre-migration orgs skip trial)
UPDATE organizations SET subscription_status = 'active' WHERE subscription_status = 'trialing';

-- Index for scheduled expiry sweeps
CREATE INDEX idx_org_trial_ends ON organizations (trial_ends_at)
    WHERE subscription_status = 'trialing';

CREATE INDEX idx_org_sub_status ON organizations (subscription_status);

-- ─── subscriptions ────────────────────────────────────────────
-- Keeps a full history of every paid period so data is never lost.
CREATE TABLE subscriptions (
    id               UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID            NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    plan             org_plan        NOT NULL,
    status           subscription_status NOT NULL DEFAULT 'active',
    -- Payment provider reference (Stripe subscription id, etc.)
    external_id      VARCHAR(255),
    current_period_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end    TIMESTAMPTZ NOT NULL,
    cancelled_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_org_id    ON subscriptions (organization_id);
CREATE INDEX idx_subscriptions_status    ON subscriptions (status);
CREATE INDEX idx_subscriptions_period    ON subscriptions (organization_id, current_period_end DESC);

CREATE TRIGGER set_updated_at_subscriptions
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── subscription_events ─────────────────────────────────────
-- Immutable audit trail: every status transition is recorded.
CREATE TABLE subscription_events (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    subscription_id  UUID        REFERENCES subscriptions (id) ON DELETE SET NULL,
    event_type       VARCHAR(60) NOT NULL,  -- e.g. 'trial_started', 'trial_expired', 'reactivated'
    from_status      subscription_status,
    to_status        subscription_status,
    metadata         JSONB       NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sub_events_org_id ON subscription_events (organization_id);
CREATE INDEX idx_sub_events_type   ON subscription_events (event_type);

-- Record migration
INSERT INTO schema_migrations (version) VALUES ('002_subscriptions');
