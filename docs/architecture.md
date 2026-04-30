# SecurePay Architecture

SecurePay is organized as a modular monorepo with separate deployable apps and shared contracts.

```text
apps/
  api/          Express API, tenant middleware, repositories, encryption
  web/          React/Vite onboarding and tenant-aware API client
packages/
  shared/       Shared TypeScript domain types
database/
  migrations/  PostgreSQL DDL for tenant-isolated data
```

## Tenant model

The platform supports two organization modes:

- `solo`: one individual owns a single tenant organization.
- `agency`: a company organization can have multiple members and client accounts.

Every tenant-owned table includes a tenant root or organization foreign key. Repository methods
require the current tenant context and filter by that identifier. The API derives tenant context
from `x-tenant-id` and, where needed, `x-organization-id` request headers in this starter;
production auth should resolve both from signed session/JWT claims and verify membership before
serving requests.

## Backend module boundaries

- `config`: environment parsing and required secret validation.
- `db`: PostgreSQL connection pooling.
- `middleware`: tenant context and centralized error handling.
- `modules/auth`: registration, login, JWT issuance, and session introspection.
- `modules/organizations`: create and fetch tenant organizations.
- `modules/members`: agency employee onboarding with trial-period employee limits.
- `modules/subscriptions`: trial policy and hibernation entitlement checks.
- `modules/api-keys`: store payment-provider API keys after AES-256-GCM encryption.
- `modules/provider-integrations`: self-service admin settings for card issuing credentials,
  encrypted webhook secrets, and provider connection tests.
- `security`: cryptographic helpers and key material validation.

## Auth, trials, and hibernation

SecurePay issues JWT access tokens from `/v1/auth/register` and `/v1/auth/login`. Tokens carry
the user, tenant, organization, and organization role so downstream middleware can rebuild tenant
context without trusting client-supplied tenant headers.

Trial policy:

- Solo tenants receive a 15-day free trial.
- Agency tenants receive a 30-day free trial.
- Agency owners/admins can add up to 9 employees while the agency is trialing.

When a trial or paid period is no longer active, entitlement middleware places the tenant in
read-only hibernation. Users can still authenticate and read stored data, but write/API operations
and auto-fill routes return `402 SUBSCRIPTION_PAYMENT_REQUIRED` until payment restores access.

## Self-service provider integrations

Admins manage Stripe, Airwallex, and Wise card issuing credentials from the React settings page.
The backend exposes:

- `GET /v1/provider-integrations`: list masked provider credentials for the current organization.
- `PUT /v1/provider-integrations`: encrypt and upsert an API key plus optional webhook secret.
- `POST /v1/provider-integrations/:integrationId/test`: decrypt the saved API key in memory and
  ping the provider API to verify the connection.

Only organization owners/admins can use these routes. Writes and connection tests also pass through
the hibernation entitlement middleware, so expired tenants can view masked settings but cannot
modify or test integrations until payment restores access.

## Encryption layer

Sensitive Stripe, Airwallex, and Wise keys are encrypted with AES-256-GCM before storage.

Stored fields:

- `encrypted_secret` / `encrypted_api_key` / `encrypted_webhook_secret`: ciphertext.
- `encryption_iv` / `api_key_iv` / `webhook_secret_iv`: per-record 96-bit IV.
- `encryption_tag` / `api_key_tag` / `webhook_secret_tag`: GCM authentication tag.
- `encryption_key_version`: supports future key rotation.

Provider integrations use the same envelope format for both `encrypted_api_key` and optional
`encrypted_webhook_secret`.

The app expects `ENCRYPTION_KEY_BASE64` to be a 32-byte key encoded as base64. Example:

```bash
openssl rand -base64 32
```

Keep this key outside the database and outside source control. In production, source it from a
secret manager or KMS-backed runtime environment.

## Database isolation

The initial migration uses shared tables with mandatory tenant foreign keys. This keeps operational
complexity low while preserving a clear tenant boundary:

- `tenants` is the platform-level tenant root.
- `organizations` stores the Solo or Agency workspace attached to a tenant.
- `users` stores identities.
- `organization_memberships` links users to tenants with roles.
- `provider_api_keys` stores encrypted Stripe/Airwallex/Wise credentials per organization.
- `provider_integrations` stores self-service card issuing API keys, webhook secrets, masked
  previews, and last connection-test results.
- `audit_events` is scoped by tenant and can also reference an organization.

For stronger isolation later, PostgreSQL row-level security can be added around the same
`organization_id` invariant without changing the domain model.
