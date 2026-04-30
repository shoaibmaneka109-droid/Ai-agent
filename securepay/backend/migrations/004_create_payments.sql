-- Migration 004: Payments & transactions

BEGIN;

CREATE TYPE payment_status AS ENUM (
  'pending', 'processing', 'succeeded', 'failed', 'cancelled',
  'refunded', 'partially_refunded', 'disputed'
);

CREATE TYPE payment_provider AS ENUM ('stripe', 'airwallex', 'manual');

CREATE TABLE payments (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by           UUID REFERENCES users(id),

  -- Provider details
  provider             payment_provider NOT NULL,
  provider_payment_id  VARCHAR(255),               -- e.g. Stripe PaymentIntent ID
  provider_charge_id   VARCHAR(255),

  -- Amount (store in smallest currency unit, e.g. cents)
  amount               BIGINT NOT NULL,
  currency             CHAR(3) NOT NULL DEFAULT 'USD',
  net_amount           BIGINT,                     -- after fees
  fee_amount           BIGINT,

  -- Status
  status               payment_status NOT NULL DEFAULT 'pending',

  -- Customer / payer info
  customer_email       VARCHAR(255),
  customer_name        VARCHAR(255),
  customer_metadata    JSONB NOT NULL DEFAULT '{}',

  -- Payment method
  payment_method_type  VARCHAR(100),               -- card, bank_transfer, etc.
  payment_method_last4 CHAR(4),
  payment_method_brand VARCHAR(50),

  -- Description / metadata
  description          TEXT,
  statement_descriptor VARCHAR(255),
  metadata             JSONB NOT NULL DEFAULT '{}',

  -- Refunds
  refunded_amount      BIGINT NOT NULL DEFAULT 0,

  -- Webhook tracking
  last_webhook_event   VARCHAR(255),
  last_webhook_at      TIMESTAMPTZ,

  -- Timestamps
  paid_at              TIMESTAMPTZ,
  failed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_tenant      ON payments(tenant_id);
CREATE INDEX idx_payments_status      ON payments(tenant_id, status);
CREATE INDEX idx_payments_provider_id ON payments(provider, provider_payment_id);
CREATE INDEX idx_payments_created     ON payments(tenant_id, created_at DESC);
CREATE INDEX idx_payments_customer    ON payments(tenant_id, customer_email);

-- ─── Refunds ──────────────────────────────────────────────────────────────────
CREATE TABLE refunds (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id          UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  initiated_by        UUID REFERENCES users(id),

  provider_refund_id  VARCHAR(255),
  amount              BIGINT NOT NULL,
  reason              TEXT,
  status              VARCHAR(50) NOT NULL DEFAULT 'pending',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refunds_payment  ON refunds(payment_id);
CREATE INDEX idx_refunds_tenant   ON refunds(tenant_id);

-- ─── Audit log ────────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(255) NOT NULL,
  resource    VARCHAR(100),
  resource_id UUID,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant   ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_user     ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(tenant_id, resource, resource_id);

-- ─── Triggers ─────────────────────────────────────────────────────────────────
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
