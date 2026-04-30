-- SUPER_ADMIN role, MASTER_CARD type, fund recall audit trail

BEGIN;

ALTER TABLE organization_virtual_cards
  ADD COLUMN IF NOT EXISTS card_kind TEXT NOT NULL DEFAULT 'STANDARD';

ALTER TABLE organization_virtual_cards DROP CONSTRAINT IF EXISTS organization_virtual_cards_card_kind_check;
ALTER TABLE organization_virtual_cards
  ADD CONSTRAINT organization_virtual_cards_card_kind_check
  CHECK (card_kind IN ('STANDARD', 'MASTER_CARD'));

DROP INDEX IF EXISTS idx_one_master_card_per_org;
CREATE UNIQUE INDEX idx_one_master_card_per_org
  ON organization_virtual_cards (organization_id)
  WHERE card_kind = 'MASTER_CARD';

ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'admin', 'super_admin', 'sub_admin', 'member'));

UPDATE organization_members om
SET role = 'super_admin'
FROM (
  SELECT DISTINCT ON (organization_id) organization_id, user_id
  FROM organization_members
  WHERE role = 'admin'
  ORDER BY organization_id, joined_at ASC NULLS LAST, user_id
) x
WHERE om.organization_id = x.organization_id AND om.user_id = x.user_id;

CREATE TABLE IF NOT EXISTS audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  action            TEXT NOT NULL,
  actor_user_id     UUID REFERENCES users (id) ON DELETE SET NULL,
  payload           JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs (organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);

COMMENT ON TABLE audit_logs IS 'Security-sensitive actions (e.g. fund_recall) for transparency.';
COMMENT ON COLUMN organization_virtual_cards.card_kind IS 'MASTER_CARD hidden from APIs except SUPER_ADMIN.';

COMMIT;
