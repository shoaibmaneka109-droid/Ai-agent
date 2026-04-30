-- Guard-Dog: org-level security monitoring (audit + optional auto emergency lockdown)

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS guard_dog_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS guard_dog_auto_lockdown BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.guard_dog_enabled IS
  'When true, suspicious access attempts are audit-logged, emitted to admins, and optionally trigger emergency lockdown.';
COMMENT ON COLUMN organizations.guard_dog_auto_lockdown IS
  'When true with guard_dog_enabled, Guard-Dog events set emergency_lockdown_at (agency-wide freeze).';

COMMIT;
