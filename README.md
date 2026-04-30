# SecurePay

Initial scaffold for a modular multi-tenant SaaS platform built with:

- Node.js + Express backend
- React frontend powered by Vite
- PostgreSQL database schema with tenant isolation primitives
- AES-256-GCM encryption utilities for sensitive payment-provider credentials
- JWT authentication with tenant-scoped sessions and subscription-aware feature gates
- Self-service admin integration settings for Stripe, Airwallex, and Wise

## Workspace structure

```text
.
├── apps
│   ├── api
│   │   └── src
│   │       ├── config
│   │       ├── modules
│   │       │   ├── health
│   │       │   ├── secrets
│   │       │   └── tenants
│   │       └── shared
│   │           ├── crypto
│   │           └── middleware
│   └── web
│       ├── src
│       └── vite.config.js
├── database
│   └── schema.sql
└── docs
    └── architecture.md
```

## Tenant model

SecurePay supports two tenant types:

- `solo`: individual operator with a single-owner style account
- `agency`: company account with multiple memberships and delegated roles

All tenant-aware business tables carry `tenant_id`, and the schema includes PostgreSQL
row-level security helpers based on `app.current_tenant_id`.

## Secret encryption

Sensitive provider credentials like Stripe and Airwallex API keys are encrypted before
storage with AES-256-GCM using:

- a 32-byte base64-encoded `ENCRYPTION_MASTER_KEY`
- a per-secret random IV
- an authentication tag for tamper detection
- tenant/provider/account label as additional authenticated data

## Authentication and subscription rules

The backend now includes JWT-based authentication and subscription lifecycle logic:

- access tokens for authenticated API requests
- refresh tokens persisted in `auth_refresh_sessions`
- `solo` tenants receive a 15-day free trial
- `agency` tenants receive a 30-day free trial
- agency trials can include up to 9 employees in addition to the admin account
- once a trial or paid period expires, the tenant enters a hibernated read-only state

During hibernation:

- users can still log in
- users can still view tenant data
- API write features are locked
- Auto-fill is locked until billing is restored

## Self-service provider settings

Admins can now manage provider integration settings directly for each tenant:

- Stripe API key + webhook secret
- Airwallex client ID + API key + webhook secret
- Wise API token + webhook secret

The backend stores each secret encrypted with AES-256-GCM in
`tenant_integration_credentials`. Admins can:

- save provider credentials without platform intervention
- view masked summaries of stored values
- run connection tests against provider APIs
- see the latest connection-test status and error preview

Connection tests use lightweight authenticated endpoints:

- Stripe: `GET /v1/balance`
- Airwallex: `POST /api/v1/authentication/login`
- Wise: `GET /v1/profiles`

## Key files

- `docs/architecture.md`: modular architecture and tenancy design
- `database/schema.sql`: initial PostgreSQL schema and RLS policies
- `apps/api/src/shared/crypto/aes256.js`: encryption helper
- `apps/api/src/modules/secrets`: secret-management module scaffold
- `apps/api/src/modules/auth`: JWT authentication, registration, login, refresh, and session endpoints
- `apps/api/src/modules/subscriptions/subscriptions.service.js`: trial expiration and hibernation logic
- `apps/api/src/modules/integrations`: encrypted self-service integration settings and provider connection tests

## Local setup

1. Copy `.env.example` to `.env`.
2. Install workspace dependencies with `npm install`.
3. Start the API with `npm run dev:api`.
4. Start the frontend with `npm run dev:web`.

### Required environment variables

- `DATABASE_URL`
- `ENCRYPTION_MASTER_KEY`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_TTL`
- `JWT_REFRESH_TTL`
- `CONNECTION_TEST_TIMEOUT_MS`

## Notes

The current environment used for this scaffold did not have Node.js/npm installed, so
dependency installation and runtime verification should be completed in a Node-enabled
environment.
