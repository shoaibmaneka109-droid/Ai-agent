-- Master full-time freeze per card; agency-wide emergency lockdown

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS emergency_lockdown_at TIMESTAMPTZ;

COMMENT ON COLUMN organizations.emergency_lockdown_at IS
  'When set, all agency virtual cards are treated as frozen for employees and extension autofill until cleared.';

ALTER TABLE organization_virtual_cards
  ADD COLUMN IF NOT EXISTS full_time_freeze BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organization_virtual_cards.full_time_freeze IS
  'Master freeze: when true, card cannot be used for extension autofill or employee PAN access regardless of session freeze.';

COMMIT;
