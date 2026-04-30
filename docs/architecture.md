# SecurePay architecture

## Goals

- Support multi-tenant SaaS isolation for Solo and Agency customers.
- Keep backend modules cohesive and independently evolvable.
- Encrypt provider API credentials before they are persisted.
- Make it straightforward to add billing, audit, and workflow modules later.

## High-level topology

```text
+---------------------+      +--------------------------+
| React frontend      | ---> | Express API              |
| apps/web            |      | apps/api                 |
+---------------------+      +--------------------------+
                                      |
                                      v
                           +--------------------------+
                           | PostgreSQL               |
                           | shared schema + RLS      |
                           +--------------------------+
```

## Tenant model

SecurePay uses a shared database with explicit tenant identifiers on every business table.

- `tenants` is the tenant root.
- `tenant_type` distinguishes:
  - `solo`: an individual operating their own account.
  - `agency`: a company account with multiple members and client-facing operations later.
- `tenant_memberships` links users to tenants with role-based access.
- Every sensitive or operational row stores `tenant_id`.

This model keeps operational simplicity while still enabling isolation through:

1. application-level tenant context middleware,
2. tenant-aware queries and service boundaries,
3. PostgreSQL row-level security policies.

## Backend module boundaries

### `src/config`

Runtime configuration and environment parsing.

### `src/shared`

Cross-cutting concerns:

- request context extraction,
- encryption primitives,
- future logging, database client, and auth helpers.

### `src/modules/health`

Operational health endpoints.

### `src/modules/tenants`

Tenant bootstrap, membership management, and tenant settings.

### `src/modules/secrets`

Provider credential lifecycle:

- validate provider type,
- encrypt secrets,
- return safe metadata without exposing plaintext values.

## Encryption approach

Sensitive API keys such as Stripe and Airwallex credentials are encrypted using AES-256-GCM.

- `ENCRYPTION_MASTER_KEY` is a 32-byte value represented as base64.
- Each secret uses a fresh 12-byte IV.
- The payload stores:
  - algorithm,
  - IV,
  - auth tag,
  - ciphertext,
  - key version.

AES-GCM was chosen over plain AES-CBC because authenticated encryption prevents unnoticed tampering.

## Database design notes

### Core identity tables

- `users`
- `tenants`
- `tenant_memberships`

### Payment provider tables

- `payment_provider_accounts`: provider credentials keyed by tenant + provider + account label

### Security and compliance support

- `audit_logs` captures sensitive configuration changes and access trails.
- RLS helper functions rely on `app.current_tenant_id`.

## Request flow

1. Frontend authenticates a user.
2. API resolves the active tenant from auth/session context.
3. Middleware attaches `requestContext.tenantId`.
4. Service methods require a tenant id for reads and writes.
5. When storing provider credentials:
   - validate ownership,
   - encrypt values,
   - persist only ciphertext payloads,
   - log the change in `audit_logs`.

## Initial frontend areas

The React shell is intentionally minimal and oriented around future expansion:

- overview of tenant-aware architecture,
- cards for Solo and Agency flows,
- reminder that secrets stay encrypted at rest.

## Recommended next steps

1. Add authentication and session management.
2. Introduce a database access layer with parameterized tenant-safe repositories.
3. Implement migrations with a tool such as Prisma, Knex, or node-pg-migrate.
4. Add secret rotation workflows and key-version re-encryption jobs.
5. Expand RLS usage in application integration tests.
