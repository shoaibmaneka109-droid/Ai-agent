-- ============================================================
--  SecurePay – Demo Seed Data (development only)
-- ============================================================

-- Solo organization (individual freelancer)
INSERT INTO organizations (id, name, slug, type, plan) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alice Freelance', 'alice-freelance-demo', 'solo', 'starter');

-- Agency organization (company with multiple members)
INSERT INTO organizations (id, name, slug, type, plan) VALUES
  ('22222222-2222-2222-2222-222222222222', 'Acme Agency', 'acme-agency-demo', 'agency', 'growth');

-- Users — passwords are bcrypt hashes of 'Password1' (for demo only)
INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'alice@example.com',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeM3ZoNBBR2klYyge',
   'Alice', 'Smith', 'owner'),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222',
   'bob@acme.com',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeM3ZoNBBR2klYyge',
   'Bob', 'Jones', 'owner'),

  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '22222222-2222-2222-2222-222222222222',
   'carol@acme.com',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeM3ZoNBBR2klYyge',
   'Carol', 'Davis', 'admin');

-- Note: No real API keys are seeded — they contain sensitive material and
-- must be inserted at runtime via the application with real ENCRYPTION_KEY.
