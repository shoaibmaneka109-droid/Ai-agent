CREATE TYPE subscription_status AS ENUM (
  'trialing',
  'active',
  'past_due',
  'expired',
  'canceled'
);

ALTER TABLE tenants
  ADD COLUMN trial_started_at TIMESTAMPTZ,
  ADD COLUMN trial_ends_at TIMESTAMPTZ,
  ADD COLUMN subscription_status subscription_status NOT NULL DEFAULT 'trialing',
  ADD COLUMN subscription_current_period_end TIMESTAMPTZ,
  ADD COLUMN hibernated_at TIMESTAMPTZ,
  ADD COLUMN payment_required_at TIMESTAMPTZ;

UPDATE tenants
SET
  trial_started_at = created_at,
  trial_ends_at = created_at + CASE
    WHEN account_type = 'agency' THEN INTERVAL '30 days'
    ELSE INTERVAL '15 days'
  END
WHERE trial_started_at IS NULL
  OR trial_ends_at IS NULL;

ALTER TABLE tenants
  ALTER COLUMN trial_started_at SET NOT NULL,
  ALTER COLUMN trial_ends_at SET NOT NULL;

ALTER TABLE users
  ADD COLUMN last_login_at TIMESTAMPTZ;

CREATE INDEX idx_tenants_subscription_status ON tenants(subscription_status);
CREATE INDEX idx_tenants_trial_ends_at ON tenants(trial_ends_at);
CREATE INDEX idx_tenants_payment_required_at ON tenants(payment_required_at);
