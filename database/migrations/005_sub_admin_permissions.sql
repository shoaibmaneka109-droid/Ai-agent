-- Sub-admins (managers): granular permissions on organization_members

BEGIN;

ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;

ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'sub_admin', 'member'));

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS can_manage_employees BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_cards_hide_keys BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_card_admin_fund_transfer BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organization_members.can_manage_employees IS 'Sub-admin: invite/map employees, VPS IP, payment auth window.';
COMMENT ON COLUMN organization_members.can_view_cards_hide_keys IS 'Sub-admin: virtual card registry and freeze; no integration API secrets.';
COMMENT ON COLUMN organization_members.can_card_admin_fund_transfer IS 'Sub-admin: simulated card-to-admin fund transfers.';

UPDATE organization_members
SET
  can_manage_employees = true,
  can_view_cards_hide_keys = true,
  can_card_admin_fund_transfer = true
WHERE role IN ('owner', 'admin');

CREATE TABLE IF NOT EXISTS organization_card_fund_transfers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  from_virtual_card_id UUID NOT NULL REFERENCES organization_virtual_cards (id) ON DELETE CASCADE,
  amount_cents          INTEGER NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 100000000),
  initiated_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  note                  TEXT,
  status                TEXT NOT NULL DEFAULT 'simulated_completed',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_card_fund_transfers_org ON organization_card_fund_transfers (organization_id);

COMMIT;
