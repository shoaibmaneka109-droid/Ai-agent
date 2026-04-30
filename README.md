# SecurePay

SecurePay is a multi-tenant SaaS starter for securely storing and managing payment provider credentials for two customer types:

- **Solo**: individual operators with a single-owner organization.
- **Agency**: companies that manage a team and, later, multiple client workspaces.

## Stack

- Backend: Node.js, Express, TypeScript
- Frontend: React, Vite, TypeScript
- Database: PostgreSQL
- Sensitive credential storage: AES-256-GCM envelope format
- Authentication: JWT access tokens with tenant and organization claims

## Repository layout

```text
apps/
  api/                 Express API, tenant middleware, repositories, encryption
  web/                 React onboarding shell for Solo and Agency users
database/
  migrations/          PostgreSQL schema migrations
packages/
  shared/              Shared tenant, organization, and provider types
docs/
  architecture.md      Modular architecture and security notes
```

## Local setup

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run dev:api
npm run dev:web
```

Apply the initial schema with:

```bash
psql "$DATABASE_URL" -f database/migrations/001_initial_securepay_schema.sql
```

`ENCRYPTION_KEY_BASE64` must be exactly 32 bytes when decoded. Generate one with:

```bash
openssl rand -base64 32
```

`JWT_SECRET` should be a high-entropy signing secret.
