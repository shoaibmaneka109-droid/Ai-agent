# SecurePay database

PostgreSQL migrations live in `database/migrations` and are intended to run in order.

The initial schema uses a shared-database, shared-schema tenancy model:

- Every tenant starts in the `tenants` table.
- Solo tenants use `account_type = 'solo'` and should have one owner membership.
- Agency tenants use `account_type = 'agency'` and can have multiple members.
- Tenant-owned tables include `tenant_id` or `organization_id` foreign keys and composite keys where needed.
- Sensitive provider credentials are stored only as AES-256-GCM ciphertext plus IV/auth tag metadata.
- Trial and subscription state lives on `tenants`; expired trials enter read-only hibernation
  until a payment provider marks the tenant active again.

Apply locally:

```sh
psql "$DATABASE_URL" -f database/migrations/001_initial_securepay_schema.sql
```
