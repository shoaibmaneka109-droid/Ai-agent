-- =============================================================================
-- SecurePay — Development Seed Data
-- Run ONLY in development / CI environments.
-- =============================================================================
-- Passwords are bcrypt hashes of "Password123!" (12 rounds)
-- =============================================================================

BEGIN;

-- Solo organization (individual freelancer)
INSERT INTO organizations (id, name, slug, type, plan) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Alice Freelance', 'alice-freelance', 'solo', 'starter');

-- Agency organization (company)
INSERT INTO organizations (id, name, slug, type, plan) VALUES
  ('00000000-0000-0000-0000-000000000002', 'Acme Payments Agency', 'acme-agency', 'agency', 'professional');

-- Users for solo org — owner only
INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, role) VALUES
  ('00000000-0000-0000-0001-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'alice@example.com',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2NVa4SCXK2',  -- Password123!
   'Alice', 'Smith', 'owner');

-- Users for agency org — owner + admin + member
INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, role) VALUES
  ('00000000-0000-0000-0002-000000000001',
   '00000000-0000-0000-0000-000000000002',
   'bob@acme.com',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2NVa4SCXK2',
   'Bob', 'Johnson', 'owner'),

  ('00000000-0000-0000-0002-000000000002',
   '00000000-0000-0000-0000-000000000002',
   'carol@acme.com',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2NVa4SCXK2',
   'Carol', 'Davis', 'admin'),

  ('00000000-0000-0000-0002-000000000003',
   '00000000-0000-0000-0000-000000000002',
   'dave@acme.com',
   '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2NVa4SCXK2',
   'Dave', 'Wilson', 'member');

COMMIT;
