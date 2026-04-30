# SecurePay

Multi-tenant SaaS scaffold: **Node.js/Express** (`apps/api`), **React** (`apps/web`), **PostgreSQL** (`database/schema.sql`), with **AES-256-GCM** for provider API secrets.

## Layout

- **`apps/api`** — Express API: `config/`, `middleware/` (JWT, tenant membership, subscription gates), `lib/crypto`, `lib/jwt`, `lib/billing`, `modules/*` (auth, organizations, billing/credentials, integrations, autofill).
- **`apps/web`** — React (Vite): `app/`, `modules/solo`, `modules/agency`, `shared/`.
- **`packages/shared`** — Types, billing helpers, **provider connection tests** (`testStripeConnection`, `testAirwallexConnection`, `testWiseConnection`).
- **`database/`** — SQL schema and migrations.

## Authentication (JWT)

- **`JWT_SECRET`** — required in production; signing uses HS256 via `jsonwebtoken`.
- **`POST /api/v1/auth/register/solo`** — creates user (`user_type: solo`), **solo** org (`kind: solo_workspace`), **15-day** `trial_ends_at`, owner membership. Returns `accessToken`.
- **`POST /api/v1/auth/register/agency`** — creates **agency** admin (`user_type: agency`), org `kind: agency`, **30-day** trial, first user as **`admin`**. Returns `accessToken`.
- **`POST /api/v1/auth/login`** — returns `accessToken`, `defaultOrganizationId`, `userType`.
- **`GET /api/v1/auth/me`** — bearer token; returns user + **billing** (`accessMode`, `integrationsUnlocked`, trial/subscription dates). **Works in hibernation** so the client can show read-only UI.

## Trials and data hibernation

- **Full access** (`integrationsUnlocked`): trial not expired **or** paid period active (`subscription_ends_at` in the future).
- **Hibernation**: trial and paid period both ended → user can still authenticate and call **`/auth/me`**, but routes that use **`requireFullSubscription`** return **402** with `code: "HIBERNATION"` (e.g. **`POST /api/v1/credentials/:provider`**, **`POST /api/v1/autofill/preview`**, **integration save/test**).
- Shared logic: `packages/shared/src/billing.ts` — `computeOrgBillingState`.

## Agency employees during trial

- While the org is on **agency trial** (trial active and not on paid plan), at most **9** users with role **`member`** may exist (`AGENCY_TRIAL_MAX_EMPLOYEES`).
- **`POST /api/v1/organizations/:orgId/members/employees`** — admin/owner; body **`email`**, **`password`**, **`virtualCardId`** (UUID in org), **`allowedVpsIp`** (IPv4/IPv6). Headers: **`Authorization`**, **`X-Organization-Id`**.

## Agency dashboard & VPS IP for card access

- **`organization_virtual_cards`** — per-org registry of issued cards (`external_ref`, `last4`, `label`).
- **`organization_members.virtual_card_id`** + **`allowed_vps_ip`** — each employee must be mapped to a card and a **mandatory VPS IP**.
- **Admin UI**: **`/agency/dashboard`** — register cards, add employees, edit mappings.
- **Employee UI**: **`/agency/my-card`** — calls **`GET /api/v1/virtual-cards/my-virtual-card/details`** (requires active subscription/trial). For **`role = member`**, middleware **`requireEmployeeVpsIpForCardAccess`** compares **`getRequestClientIp(req)`** to the DB IP; mismatch → **403** `VPS_IP_MISMATCH`. Owners/admins skip IP check (they do not receive simulated full PAN).
- **Production**: set **`TRUST_PROXY=1`** and place Express behind a proxy that sets **`X-Forwarded-For`** so the client IP reflects the employee’s VPS. See `apps/api/src/lib/requestIp.ts` and `apps/api/src/index.ts` (`app.set('trust proxy', 1)`).

Upgrade: if your DB predates these columns, run **`database/migrations/003_employee_vps_virtual_cards.sql`**.

## Admin integrations (self-service)

Tenants configure their own **Stripe**, **Airwallex**, and **Wise** API keys and **webhook secrets**; values are **encrypted (AES-256-GCM)** before insert into **`organization_credentials`** (`credential_kind`: `api_secret` | `webhook_secret`).

- **`GET /api/v1/integrations`** — admin/owner; lists configured `(provider, kind)` rows (no secret values).
- **`PUT /api/v1/integrations/:provider`** — admin/owner; **requires active trial or subscription**. Body shapes:
  - **Stripe**: `{ "apiSecret": "sk_...", "webhookSecret": "whsec_..." }` (webhook optional).
  - **Airwallex**: `{ "clientId", "apiKey", "baseUrl"?, "webhookSecret"? }` — API pair stored as encrypted JSON.
  - **Wise**: `{ "apiSecret": "<token>", "live": boolean, "webhookSecret"? }` — token + environment stored as encrypted JSON.
- **Connection test**
  - **`POST /api/v1/integrations/:provider/connection-test`** — admin/owner; body same as save (tests **without** persisting).
  - **`GET /api/v1/integrations/:provider/connection-test`** — uses **saved** decrypted API secret to ping Stripe (`GET /v1/balance`), Airwallex (`POST …/authentication/login`), Wise (`GET /v1/me` on live or sandbox host).
  - **Webhook secrets** are not sent to third-party APIs; responses include a short **format / sanity** note only.

UI: **`/agency/login`** then **`/agency/settings/integrations`**. Set **`VITE_API_URL`** if the API is not same-origin (defaults to relative `/api` via Vite proxy).

Legacy: **`POST /api/v1/credentials/:provider`** with `{ "secret" }` still upserts **`api_secret`** only.

## Database upgrades

If you created the DB from an older schema, run **`database/migrations/002_credentials_wise_webhook.sql`** after pulling.

## Local setup

1. Create a Postgres database and run `database/schema.sql` (and migration above if upgrading).
2. Copy `apps/api/.env.example` to `apps/api/.env` and fill values (`SECUREPAY_MASTER_KEY_BASE64`, `JWT_SECRET`, `DATABASE_URL`).
3. `npm install` at repo root, then `npm run dev:api` / `npm run dev:web`.
