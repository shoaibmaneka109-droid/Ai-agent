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
- `modules/organizations`: create and fetch tenant organizations.
- `modules/api-keys`: store payment-provider API keys after AES-256-GCM encryption.
- `security`: cryptographic helpers and key material validation.

## Encryption layer

Sensitive Stripe and Airwallex keys are encrypted with AES-256-GCM before storage.

Stored fields:

- `encrypted_secret`: ciphertext.
- `encryption_iv`: per-record 96-bit IV.
- `encryption_tag`: GCM authentication tag.
- `encryption_key_version`: supports future key rotation.

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
- `provider_api_keys` stores encrypted Stripe/Airwallex credentials per organization.
- `audit_events` is scoped by tenant and can also reference an organization.

For stronger isolation later, PostgreSQL row-level security can be added around the same
`organization_id` invariant without changing the domain model.
