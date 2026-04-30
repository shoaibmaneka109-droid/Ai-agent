-- Virtual cards and per-employee VPS IP (upgrade path)
BEGIN;

CREATE TABLE IF NOT EXISTS organization_virtual_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  external_ref     TEXT NOT NULL,
  last4            CHAR(4) NOT NULL,
  label            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_ref)
);

CREATE INDEX IF NOT EXISTS idx_org_virtual_cards_org ON organization_virtual_cards (organization_id);

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS virtual_card_id UUID REFERENCES organization_virtual_cards (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allowed_vps_ip INET;

CREATE INDEX IF NOT EXISTS idx_org_members_virtual_card ON organization_members (virtual_card_id);

COMMIT;
