-- Merchant hostnames allowed for SecurePay extension checkout autofill (per organization)

BEGIN;

CREATE TABLE organization_checkout_allowed_merchants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  hostname          TEXT NOT NULL,
  label             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checkout_hostname_lower CHECK (hostname = lower(hostname)),
  CONSTRAINT checkout_hostname_format CHECK (hostname ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' AND length(hostname) <= 253),
  UNIQUE (organization_id, hostname)
);

CREATE INDEX idx_checkout_allowed_org ON organization_checkout_allowed_merchants (organization_id);

COMMENT ON TABLE organization_checkout_allowed_merchants IS
  'Main admin adds hostnames (e.g. pay.example.com). Extension only autofill-fetches card when document location hostname matches a row.';

COMMIT;
