# SecurePay — Multi-Tenant SaaS Payment Platform

A production-ready, modular Multi-Tenant SaaS platform for managing payment integrations (Stripe, Airwallex, and more), built with **Node.js/Express**, **React**, and **PostgreSQL**.

---

## Architecture Overview

```
securepay/
├── backend/                   # Node.js / Express API
│   ├── src/
│   │   ├── config/            # Centralised environment config + validation
│   │   ├── db/
│   │   │   ├── pool.js        # pg connection pool + transaction helper
│   │   │   └── migrate.js     # SQL migration runner
│   │   ├── middleware/
│   │   │   ├── authenticate.js   # JWT Bearer verification
│   │   │   ├── authorize.js      # Role-based access control (RBAC)
│   │   │   ├── tenantContext.js  # Resolves :orgSlug → organization row
│   │   │   ├── validate.js       # express-validator error collector
│   │   │   └── errorHandler.js   # Global error handler
│   │   ├── modules/
│   │   │   ├── auth/          # Register, login, refresh, /me
│   │   │   ├── tenants/       # Org CRUD, plan management, member listing
│   │   │   ├── users/         # Invite, update, deactivate, change-password
│   │   │   ├── payments/      # Create, list, get, refund
│   │   │   └── api-keys/      # Add, list, rotate, delete (AES-256-GCM)
│   │   └── utils/
│   │       ├── encryption.js  # AES-256-GCM encrypt / decrypt / re-encrypt
│   │       ├── apiResponse.js # Standardised JSON response helpers
│   │       └── logger.js      # Winston logger
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                  # React 18 + Vite + Tailwind CSS
│   ├── src/
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx    # Global auth state + login/logout
│   │   ├── services/
│   │   │   ├── api.js             # Axios instance + token refresh interceptor
│   │   │   ├── auth.service.js
│   │   │   ├── payments.service.js
│   │   │   └── apiKeys.service.js
│   │   ├── pages/
│   │   │   ├── auth/
│   │   │   │   ├── LoginPage.jsx
│   │   │   │   └── RegisterPage.jsx
│   │   │   ├── dashboard/
│   │   │   │   ├── DashboardPage.jsx
│   │   │   │   └── PaymentsPage.jsx
│   │   │   └── settings/
│   │   │       ├── ApiKeysPage.jsx
│   │   │       ├── OrgSettingsPage.jsx
│   │   │       └── TeamPage.jsx
│   │   └── components/
│   │       └── layout/
│   │           └── AppLayout.jsx  # Sidebar nav, responsive shell
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── database/
│   ├── migrations/
│   │   └── 001_initial_schema.sql  # Full schema with enums, indexes, triggers
│   └── seeds/
│       └── 001_seed_data.sql       # Development seed (2 orgs, 4 users)
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Key Design Decisions

### Multi-Tenancy Model

Every data table includes an `organization_id` foreign key. Tenant isolation is enforced at three levels:

1. **Route middleware** — `tenantContext.js` resolves `:orgSlug` and verifies the authenticated user belongs to that org.
2. **Service layer** — every query explicitly filters by `organization_id`.
3. **Database** — indexes on `organization_id` ensure efficient per-tenant scans. PostgreSQL RLS can be layered on top in production.

### User Types

| Plan Type | `organizations.type` | Intended for |
|-----------|----------------------|--------------|
| Solo      | `solo`               | Individual freelancers |
| Agency    | `agency`             | Companies / teams with multiple members |

Both types share the same schema. The `type` field drives UI copy and can gate features via the `settings` JSONB column.

### Role Hierarchy

```
superadmin  (platform staff — cross-tenant access)
  └── owner   (org creator — full org control)
        └── admin   (can manage members and keys)
              └── member (read/pay access)
```

### AES-256-GCM Encryption for API Keys

All Stripe / Airwallex / PayPal keys are encrypted before being written to the database:

```
plaintext  →  encrypt()  →  "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
                           stored in api_keys.encrypted_key
```

- A fresh 96-bit IV is generated on every `encrypt()` call (IND-CCA2 safe).
- The auth tag provides tamper detection.
- The master key is a 256-bit (32-byte) value supplied via `ENCRYPTION_MASTER_KEY` (never stored in the DB).
- A `reEncrypt()` utility supports zero-downtime key rotation.

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 14 (or Docker)

### 1. Clone & configure

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_MASTER_KEY
```

Generate secure values:

```bash
# JWT secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# AES-256 master key (must be exactly 64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Run with Docker Compose (recommended)

```bash
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- Postgres: localhost:5432

### 3. Run without Docker

**Backend**

```bash
cd backend
npm install
npm run migrate   # applies database/migrations/*.sql
npm run dev       # nodemon hot-reload on :4000
```

**Frontend**

```bash
cd frontend
npm install
npm run dev       # Vite dev server on :3000, proxies /api → :4000
```

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create org + owner account |
| POST | `/auth/login` | Obtain access + refresh tokens |
| POST | `/auth/refresh` | Rotate access token |
| GET  | `/auth/me` | Current user profile |

### Organizations (tenants)

| Method | Path | Auth |
|--------|------|------|
| GET    | `/orgs/:orgSlug` | member+ |
| PATCH  | `/orgs/:orgSlug` | admin+ |
| POST   | `/orgs/:orgSlug/plan` | owner |
| GET    | `/orgs/:orgSlug/members` | admin+ |

### Users

| Method | Path | Auth |
|--------|------|------|
| POST | `/orgs/:orgSlug/users/invite` | admin+ |
| GET  | `/orgs/:orgSlug/users/:userId` | member+ |
| PATCH| `/orgs/:orgSlug/users/:userId` | admin+ |
| DELETE| `/orgs/:orgSlug/users/:userId` | admin+ |
| POST | `/orgs/:orgSlug/users/me/change-password` | member+ |

### Payments

| Method | Path | Auth |
|--------|------|------|
| GET  | `/orgs/:orgSlug/payments` | member+ |
| POST | `/orgs/:orgSlug/payments` | member+ |
| GET  | `/orgs/:orgSlug/payments/:paymentId` | member+ |
| POST | `/orgs/:orgSlug/payments/:paymentId/refund` | member+ |

### API Keys

| Method | Path | Auth |
|--------|------|------|
| GET    | `/orgs/:orgSlug/api-keys` | admin+ |
| POST   | `/orgs/:orgSlug/api-keys` | admin+ |
| PUT    | `/orgs/:orgSlug/api-keys/:keyId` | admin+ |
| DELETE | `/orgs/:orgSlug/api-keys/:keyId` | admin+ |

---

## Database Schema (ERD Summary)

```
organizations
  id, name, slug, type (solo|agency), plan, is_active, settings, …

users
  id, organization_id →, email, password_hash, first_name, last_name,
  role (owner|admin|member), is_active, last_login_at, …

api_keys
  id, organization_id →, provider, label,
  encrypted_key (AES-256-GCM bundle), key_hint, environment, is_active, …

payments
  id, organization_id →, provider, amount (cents), currency, status,
  provider_transaction_id, environment, metadata, …

audit_logs
  id, organization_id →, user_id →, action, target_type, target_id,
  ip_address, user_agent, payload, created_at (immutable)

refresh_tokens
  id, user_id →, organization_id →, token_hash, expires_at, revoked, …
```

---

## Security Checklist

- [x] Passwords hashed with bcrypt (12 rounds)
- [x] API keys encrypted with AES-256-GCM (unique IV per write)
- [x] Short-lived JWT access tokens (15 min default)
- [x] Refresh token rotation support
- [x] Helmet HTTP security headers
- [x] CORS restricted to `ALLOWED_ORIGINS`
- [x] Rate limiting per IP via express-rate-limit
- [x] Input validation with express-validator on every endpoint
- [x] Tenant isolation enforced in middleware + service layer
- [x] RBAC on all write endpoints
- [x] Audit log table (immutable)
- [x] No raw API key values ever returned via REST or stored in plaintext

---

## Adding a New Payment Provider

1. Add the provider name to the `payment_provider` enum in `001_initial_schema.sql`.
2. Create `backend/src/modules/payments/adapters/<provider>.js` implementing `charge()` and `refund()`.
3. Wire it into `payments.service.js` `providerAdapter()`.
4. Add it to `ALLOWED_PROVIDERS` in `apiKeys.service.js`.
