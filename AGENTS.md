# AGENTS.md

## Cursor Cloud specific instructions

### Overview

SecurePay is a multi-tenant SaaS platform for virtual card management. It is an npm workspaces monorepo with three required services: PostgreSQL, Express API (`apps/api` on port 4000), and React/Vite frontend (`apps/web` on port 5173). See `README.md` for full architecture.

### Prerequisites

- **Node.js >= 20** and **PostgreSQL 16** must be installed.
- Shared packages (`packages/core`, `packages/shared`) must be built before the API or web app can start: `npm run build -w @securepay/core && npm run build -w @securepay/shared`.

### Database setup

1. Start PostgreSQL: `pg_ctlcluster 16 main start`
2. Database/user: `securepay` / `securepay` on `localhost:5432`
3. Schema: `PGPASSWORD=securepay psql -h localhost -U securepay -d securepay -f database/schema.sql`
4. Migrations: run all files in `database/migrations/` in numeric order (002–011).

### Environment

The API needs `apps/api/.env` (see `apps/api/.env.example`). Required variables:
- `DATABASE_URL` — PostgreSQL connection string
- `SECUREPAY_MASTER_KEY_BASE64` — 32-byte AES key, base64-encoded (`openssl rand -base64 32`)
- `JWT_SECRET` — defaults to a dev value in development mode

### Running services

- **API**: `npm run dev:api` (runs `tsx watch` on port 4000)
- **Web**: `npm run dev:web` (Vite dev server on port 5173, proxies `/api` and `/socket.io` to `:4000`)
- Both must run concurrently for end-to-end testing.

### Testing notes

- No automated test framework is configured (no jest/vitest/mocha).
- The web frontend is largely a placeholder scaffold — registration and most functionality is API-first via REST endpoints.
- Registration endpoints: `POST /api/v1/auth/register/solo` and `POST /api/v1/auth/register/agency`.
- Stripe/Airwallex/Wise integrations default to simulated mode; no real API keys needed for dev.
- No lint configuration (ESLint) is set up in the project.
- TypeScript type-checking: `tsc --noEmit` can be run in `apps/api` or `apps/web` for type checks.
