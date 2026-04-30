# SecurePay

Multi-tenant SaaS scaffold: **Node.js/Express** (`apps/api`), **React** (`apps/web`), **PostgreSQL** (`database/schema.sql`), with **AES-256-GCM** for provider API secrets.

## Layout

- **`apps/api`** — Express API: `config/`, `middleware/` (JWT, tenant membership, subscription gates), `lib/crypto`, `lib/jwt`, `lib/billing`, `modules/*` (auth, organizations, billing/credentials, autofill).
- **`apps/web`** — React (Vite): `app/`, `modules/solo`, `modules/agency`, `shared/`.
- **`packages/shared`** — Types and **billing helpers** (`computeOrgBillingState`, trial constants).
- **`database/`** — SQL schema.

## Authentication (JWT)

- **`JWT_SECRET`** — required in production; signing uses HS256 via `jsonwebtoken`.
- **`POST /api/v1/auth/register/solo`** — creates user (`user_type: solo`), **solo** org (`kind: solo_workspace`), **15-day** `trial_ends_at`, owner membership. Returns `accessToken`.
- **`POST /api/v1/auth/register/agency`** — creates **agency** admin (`user_type: agency`), org `kind: agency`, **30-day** trial, first user as **`admin`**. Returns `accessToken`.
- **`POST /api/v1/auth/login`** — returns `accessToken`, `defaultOrganizationId`, `userType`.
- **`GET /api/v1/auth/me`** — bearer token; returns user + **billing** (`accessMode`, `integrationsUnlocked`, trial/subscription dates). **Works in hibernation** so the client can show read-only UI.

## Trials and data hibernation

- **Full access** (`integrationsUnlocked`): trial not expired **or** paid period active (`subscription_ends_at` in the future).
- **Hibernation**: trial and paid period both ended → user can still authenticate and call **`/auth/me`**, but routes that use **`requireFullSubscription`** return **402** with `code: "HIBERNATION"` (e.g. **`POST /api/v1/credentials/:provider`**, **`POST /api/v1/autofill/preview`**).
- Shared logic: `packages/shared/src/billing.ts` — `computeOrgBillingState`.

## Agency employees during trial

- While the org is on **agency trial** (trial active and not on paid plan), at most **9** users with role **`member`** may exist (`AGENCY_TRIAL_MAX_EMPLOYEES`).
- **`POST /api/v1/organizations/:orgId/members/employees`** — admin/owner only; headers: **`Authorization: Bearer <token>`**, **`X-Organization-Id: <same org uuid>`**.

## Encrypted API keys

- **`POST /api/v1/credentials/:provider`** (`stripe` | `airwallex`) — requires JWT, tenant membership, and **active trial or subscription** (hibernation blocks writes).

## Local setup

1. Create a Postgres database and run `database/schema.sql` (adds `organizations.kind`, `trial_ends_at`, `subscription_ends_at`).
2. Copy `apps/api/.env.example` to `apps/api/.env` and fill values (`SECUREPAY_MASTER_KEY_BASE64`, `JWT_SECRET`, `DATABASE_URL`).
3. `npm install` at repo root, then `npm run dev:api` / `npm run dev:web`.
