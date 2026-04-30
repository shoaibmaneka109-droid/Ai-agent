-- Allow system-style audit rows (e.g. Guard-Dog before user resolution)

BEGIN;

ALTER TABLE audit_logs ALTER COLUMN actor_user_id DROP NOT NULL;

COMMIT;
