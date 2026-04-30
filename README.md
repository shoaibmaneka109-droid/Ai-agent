# SecurePay

Initial scaffold for a modular multi-tenant SaaS platform built with:

- Node.js + Express backend
- React frontend powered by Vite
- PostgreSQL database schema with tenant isolation primitives
- AES-256-GCM encryption utilities for sensitive payment-provider credentials

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

## Key files

- `docs/architecture.md`: modular architecture and tenancy design
- `database/schema.sql`: initial PostgreSQL schema and RLS policies
- `apps/api/src/shared/crypto/aes256.js`: encryption helper
- `apps/api/src/modules/secrets`: secret-management module scaffold

## Local setup

1. Copy `.env.example` to `.env`.
2. Install workspace dependencies with `npm install`.
3. Start the API with `npm run dev:api`.
4. Start the frontend with `npm run dev:web`.

## Notes

The current environment used for this scaffold did not have Node.js/npm installed, so
dependency installation and runtime verification should be completed in a Node-enabled
environment.
