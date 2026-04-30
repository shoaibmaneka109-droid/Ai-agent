-- Freeze issued cards (Stripe/Airwallex issuing refs) and time-bound employee payment authorization

BEGIN;

ALTER TABLE organization_virtual_cards
  ADD COLUMN IF NOT EXISTS card_frozen_at TIMESTAMPTZ;

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS payments_authorized_until TIMESTAMPTZ;

COMMENT ON COLUMN organization_virtual_cards.card_frozen_at IS
  'When set, card details and authorized simulated charges are blocked for holders of this card.';
COMMENT ON COLUMN organization_members.payments_authorized_until IS
  'Employees may only trigger in-app authorized payments while now() < this timestamp (agency admin sets).';

COMMIT;
