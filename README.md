# SecurePay

Multi-tenant SaaS scaffold: **Node.js/Express** (`apps/api`), **React** (`apps/web`), **PostgreSQL** (`database/schema.sql`), with **AES-256-GCM** for provider API secrets.

## Layout

- **`apps/api`** — Express API: `config/`, `middleware/` (tenant context), `lib/crypto` (encryption), `lib/db`, `modules/*` (organizations, billing/credentials).
- **`apps/web`** — React (Vite): `app/` (shell, styles), `modules/solo`, `modules/agency`, `shared/`.
- **`packages/shared`** — Cross-cutting TypeScript types (`UserType`, `CredentialProvider`, etc.).
- **`database/`** — SQL migrations/schema.

## Tenants and user types

- **Organizations** are tenants (`organizations`). Users join via `organization_members` with roles.
- **`users.user_type`**: `solo` (individual) vs `agency` (company-style orgs with multiple members). Enforce in app logic (e.g. solo: single org; agency: invites and RBAC).

## Encrypted API keys

- Table **`organization_credentials`** stores **Stripe** / **Airwallex** secrets as **ciphertext + IV + auth tag** (AES-256-GCM). Plaintext never hits the database.
- Set **`SECUREPAY_MASTER_KEY_BASE64`** (32 raw bytes, base64) in the API environment. Rotate with `key_version` when you add key versioning in app code.

## API (credentials)

`POST /api/v1/credentials/:provider` with headers `X-Organization-Id: <uuid>` and JSON `{ "secret": "...", "label": "optional" }`. Provider path: `stripe` or `airwallex`.

## Local setup

1. Create a Postgres database and run `database/schema.sql`.
2. Copy `apps/api/.env.example` to `apps/api/.env` and fill values.
3. `npm install` at repo root, then `npm run dev:api` / `npm run dev:web`.
