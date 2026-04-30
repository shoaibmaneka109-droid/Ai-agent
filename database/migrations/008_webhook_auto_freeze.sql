-- Auto-freeze card after successful payment (webhook-driven)

BEGIN;

ALTER TABLE organization_virtual_cards
  ADD COLUMN IF NOT EXISTS is_auto_freeze_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organization_virtual_cards.is_auto_freeze_enabled IS
  'When true, payment_intent.succeeded (Stripe) or equivalent Airwallex webhook may freeze the card at the provider and set card_frozen_at.';

COMMIT;
