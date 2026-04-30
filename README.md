# SecurePay

Multi-tenant SaaS scaffold: **Node.js/Express** (`apps/api`), **React** (`apps/web`), **PostgreSQL** (`database/schema.sql`), with **AES-256-GCM** for provider API secrets.

## Layout

- **`apps/api`** — Express API: `config/`, `middleware/` (JWT, tenant membership, subscription gates), `lib/crypto`, `lib/jwt`, `lib/billing`, `modules/*` (auth, organizations, billing/credentials, integrations, autofill).
- **`apps/web`** — React (Vite): `app/`, `modules/solo`, `modules/agency`, `shared/`.
- **`packages/core`** — AES-256-GCM helpers (`encryptUtf8` / `decryptUtf8`) for provider secrets.
- **`packages/shared`** — Types, billing helpers, **provider connection tests** (`testStripeConnection`, `testAirwallexConnection`, `testWiseConnection`).
- **`database/`** — SQL schema and migrations.

## Authentication (JWT)

- **`JWT_SECRET`** — required in production; signing uses HS256 via `jsonwebtoken`.
- **`POST /api/v1/auth/register/solo`** — creates user (`user_type: solo`), **solo** org (`kind: solo_workspace`), **15-day** `trial_ends_at`, owner membership. Returns `accessToken`.
- **`POST /api/v1/auth/register/agency`** — creates **agency** admin (`user_type: agency`), org `kind: agency`, **30-day** trial, first user as **`admin`**. Returns `accessToken`.
- **`POST /api/v1/auth/login`** — returns `accessToken`, `defaultOrganizationId`, `userType`.
- **`GET /api/v1/auth/me`** — bearer token; returns user + **billing**. Includes **`user.organizationRole`** (`owner` \| `admin` \| `sub_admin` \| `member`) and **`user.organizationPermissions`**: **`manageEmployees`**, **`viewCardsHideKeys`**, **`cardAdminFundTransfer`** (main admin always has all three). **Works in hibernation** so the client can show read-only UI.

## Trials and data hibernation

- **Full access** (`integrationsUnlocked`): trial not expired **or** paid period active (`subscription_ends_at` in the future).
- **Hibernation**: trial and paid period both ended → user can still authenticate and call **`/auth/me`**, but routes that use **`requireFullSubscription`** return **402** with `code: "HIBERNATION"` (e.g. **`POST /api/v1/credentials/:provider`**, **`POST /api/v1/autofill/preview`**, **integration save/test**).
- Shared logic: `packages/shared/src/billing.ts` — `computeOrgBillingState`.

## Agency employees during trial

- While the org is on **agency trial** (trial active and not on paid plan), at most **9** users with role **`member`** may exist (`AGENCY_TRIAL_MAX_EMPLOYEES`).
- **`POST /api/v1/organizations/:orgId/members/employees`** — requires **permission A** (`can_manage_employees`); body **`email`**, **`password`**, **`virtualCardId`**, **`allowedVpsIp`**. Headers: **`Authorization`**, **`X-Organization-Id`**.

## Agency dashboard & VPS IP for card access

- **`organization_virtual_cards`** — per-org registry of issued cards (`external_ref`, `last4`, `label`).
- **`organization_members.virtual_card_id`** + **`allowed_vps_ip`** — each employee must be mapped to a card and a **mandatory VPS IP**.
- **Admin UI**: **`/agency/dashboard`** — **owner**, **admin**, or **sub_admin** (manager) with at least one permission. Main admin: create managers, full card + employee tools, link to integrations. **Managers**: UI sections match permissions A/B/C; integrations page hides API key forms for sub-admins.
- **Employee UI**: **`/agency/my-card`** — calls **`GET /api/v1/virtual-cards/my-virtual-card/details`** (requires active subscription/trial). For **`role = member`**, middleware **`requireEmployeeVpsIpForCardAccess`** loads **`organization_members.allowed_vps_ip`** and compares it to **`getRequestClientIp(req)`** using **`ip-address`** canonical equality (IPv4/IPv6); mismatch → **403** `VPS_IP_MISMATCH` (body includes **`observedIp`**, **`expectedIp`**, **`trustProxy`**). Owners/admins skip IP check (they do not receive simulated full PAN).
- **Production**: set **`TRUST_PROXY=1`** and place Express behind a proxy that sets **`X-Forwarded-For`** so the client IP reflects the employee’s VPS. See `apps/api/src/lib/requestIp.ts` and `apps/api/src/index.ts` (`app.set('trust proxy', 1)`).

Upgrade: run migrations in order **`003`**, **`004`**, then **`005_sub_admin_permissions.sql`** (role `sub_admin`, permission columns, fund transfer audit table).

## Sub-admins (managers) & granular permissions

- **Role** `sub_admin` on **`organization_members`** with booleans: **`can_manage_employees`** (A), **`can_view_cards_hide_keys`** (B), **`can_card_admin_fund_transfer`** (C). **Owner/admin** rows have all three implied true (DB updated by migration).
- **Main admin only** (`requireMainAgencyAdmin`): integration routes, **`POST /credentials`**, **`GET /sub-admins`**, **`POST /sub-admins`** (create manager).
- **Permission A**: employee list, add employee, patch employee mapping, payment authorization window.
- **Permission B**: register/list/freeze virtual cards.
- **Permission C**: **`POST /api/v1/organizations/:orgId/fund-transfers`** — simulated transfer row in **`organization_card_fund_transfers`**.
- **`GET /virtual-cards`**: allowed if A **or** B (so managers with only A can load card list for employee mapping).

## Freeze card & authorized payments (Agency)

- **`organization_virtual_cards.card_frozen_at`** — when set, employees on that card get **403** `CARD_FROZEN` for **`GET /api/v1/virtual-cards/my-virtual-card/details`** and **`POST /api/v1/virtual-cards/authorized-payment`**. Admins/owners are not blocked by freeze for card-detail preview.
- **`organization_members.payments_authorized_until`** — employees may only call **`POST /api/v1/virtual-cards/authorized-payment`** while `now() < payments_authorized_until` (still requires VPS IP match). Outside the window: **403** `PAYMENT_NOT_AUTHORIZED`.
- **Admin API**: **`POST /api/v1/organizations/:orgId/virtual-cards/:cardId/freeze`** body `{ "frozen": true|false }`; **`PATCH /api/v1/organizations/:orgId/employees/:userId/payments-authorization`** body `{ "until": "<ISO8601>" | null }`.
- **UI**: agency dashboard — freeze toggle per card; per-employee datetime window for authorized payments. Employee page includes a simulated authorized payment form.

## Admin integrations (self-service)

Tenants configure their own **Stripe**, **Airwallex**, and **Wise** API keys and **webhook secrets**; values are **encrypted (AES-256-GCM)** via **`@securepay/core`** before insert into **`organization_credentials`** (`credential_kind`: `api_secret` | `webhook_secret`).

- **`GET /api/v1/integrations`** — **main admin** (owner/admin) only; lists configured `(provider, kind)` rows (no secret values).
- **`PUT /api/v1/integrations/:provider`** — **main admin** only; **requires active trial or subscription**. Body shapes:
  - **Stripe**: `{ "apiSecret": "sk_...", "webhookSecret": "whsec_..." }` (webhook optional).
  - **Airwallex**: `{ "clientId", "apiKey", "baseUrl"?, "webhookSecret"? }` — API pair stored as encrypted JSON.
  - **Wise**: `{ "apiSecret": "<token>", "live": boolean, "webhookSecret"? }` — token + environment stored as encrypted JSON.
- **Connection test**
  - **`POST /api/v1/integrations/:provider/connection-test`** — **main admin** only; body same as save (tests **without** persisting).
  - **`GET /api/v1/integrations/:provider/connection-test`** — **main admin** only; uses **saved** decrypted API secret to ping Stripe, Airwallex, Wise.
  - **Webhook secrets** are not sent to third-party APIs; responses include a short **format / sanity** note only.

UI: **`/agency/login`** then **`/agency/settings/integrations`**. Set **`VITE_API_URL`** if the API is not same-origin (defaults to relative `/api` via Vite proxy).

Legacy: **`POST /api/v1/credentials/:provider`** with `{ "secret" }` still upserts **`api_secret`** only.

## Database upgrades

If you created the DB from an older schema, run **`database/migrations/002_credentials_wise_webhook.sql`** after pulling.

## Local setup

1. Create a Postgres database and run `database/schema.sql` (and migration above if upgrading).
2. Copy `apps/api/.env.example` to `apps/api/.env` and fill values (`SECUREPAY_MASTER_KEY_BASE64`, `JWT_SECRET`, `DATABASE_URL`).
3. `npm install` at repo root, then `npm run dev:api` / `npm run dev:web`.
