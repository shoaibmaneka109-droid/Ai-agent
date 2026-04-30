-- Migration 005: Tenant subscription / billing plans

BEGIN;

CREATE TYPE subscription_status AS ENUM (
  'trialing', 'active', 'past_due', 'cancelled', 'unpaid'
);

CREATE TABLE subscription_plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code          VARCHAR(50) NOT NULL UNIQUE,          -- 'solo_monthly', 'agency_annual', etc.
  name          VARCHAR(255) NOT NULL,
  plan_type     tenant_plan NOT NULL,
  price_cents   INT NOT NULL,
  currency      CHAR(3) NOT NULL DEFAULT 'USD',
  interval      VARCHAR(20) NOT NULL DEFAULT 'month', -- 'month' | 'year'
  max_users     INT NOT NULL DEFAULT 1,
  max_api_keys  INT NOT NULL DEFAULT 2,
  features      JSONB NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_plans (code, name, plan_type, price_cents, interval, max_users, max_api_keys, features)
VALUES
  ('solo_monthly',  'Solo Monthly',   'solo',   2900,  'month', 1,  2,  '{"payments":true,"analytics":"basic"}'),
  ('solo_annual',   'Solo Annual',    'solo',   29000, 'year',  1,  2,  '{"payments":true,"analytics":"basic"}'),
  ('agency_monthly','Agency Monthly', 'agency', 9900,  'month', -1, 10, '{"payments":true,"analytics":"advanced","team":true,"webhooks":true}'),
  ('agency_annual', 'Agency Annual',  'agency', 99000, 'year',  -1, 10, '{"payments":true,"analytics":"advanced","team":true,"webhooks":true}');

CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id                UUID NOT NULL REFERENCES subscription_plans(id),

  status                 subscription_status NOT NULL DEFAULT 'trialing',

  -- Stripe subscription references
  stripe_subscription_id VARCHAR(255),
  stripe_price_id        VARCHAR(255),

  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  trial_end              TIMESTAMPTZ,
  cancelled_at           TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT FALSE,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id)   -- one active subscription per tenant
);

CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
