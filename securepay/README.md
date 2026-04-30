# SecurePay — Multi-Tenant SaaS Payment Platform

SecurePay is a production-ready, multi-tenant SaaS platform for managing payments across multiple organizations. It supports two account types — **Solo** (individual) and **Agency** (company/team) — and stores all sensitive provider credentials (Stripe, Airwallex) with **AES-256-GCM** encryption.

---

## Architecture Overview

```
securepay/
├── backend/                    # Node.js / Express API
│   ├── src/
│   │   ├── app.js              # Express app factory (middleware, routes)
│   │   ├── server.js           # Entry point, DB connection, graceful shutdown
│   │   ├── config/
│   │   │   ├── database.js     # pg Pool wrapper
│   │   │   ├── jwt.js          # JWT config
│   │   │   └── encryption.js   # AES-256-GCM config
│   │   ├── controllers/        # Request/response layer
│   │   ├── services/           # Business logic (auth, payments, api-keys, tenants)
│   │   ├── middleware/         # auth, tenant resolution, validation, error handling
│   │   ├── routes/             # Express routers
│   │   └── utils/              # logger, encryption, pagination, apiResponse
│   ├── migrations/             # Sequential SQL migrations + runner
│   └── Dockerfile
│
├── frontend/                   # React + Vite + TypeScript + TailwindCSS
│   ├── src/
│   │   ├── api/                # Axios client + per-resource API modules
│   │   ├── components/
│   │   │   ├── common/         # Spinner, Modal, StatusBadge, EmptyState
│   │   │   └── layout/         # AppShell, Sidebar, Topbar
│   │   ├── pages/
│   │   │   ├── auth/           # Login, Register
│   │   │   ├── dashboard/      # Analytics overview
│   │   │   ├── payments/       # List, detail, refunds
│   │   │   └── settings/       # API keys, team, profile
│   │   ├── store/              # Zustand auth store (persisted)
│   │   └── styles/             # Tailwind globals
│   └── Dockerfile
│
├── scripts/
│   └── generate-secrets.js    # One-time secret generation helper
├── docker-compose.yml
└── .env.example
```

---

## Multi-Tenancy Model

Each **tenant** (organization) is completely isolated at the database level via a `tenant_id` foreign key on every table. The platform enforces:

| Concern | Mechanism |
|---|---|
| Row-level isolation | `tenant_id` column on all tables, enforced in every query |
| Cross-tenant protection | `enforceTenantScope` middleware compares JWT `tenantId` to resolved tenant |
| User roles | `owner` → `admin` → `member` → `viewer` with fine-grained route guards |
| Plan limits | `max_users` and `max_api_keys` columns on `tenants`, checked at create time |

### Plan Comparison

| Feature | Solo | Agency |
|---|---|---|
| Users | 1 | Unlimited |
| API keys | 2 | 10 |
| Team management | — | ✓ |
| Advanced analytics | — | ✓ |
| Webhooks | — | ✓ |

---

## Database Schema

Five sequential migrations build the full schema:

```
001_create_tenants.sql       — tenants, tenant_invitations
002_create_users.sql         — users, email_verifications, password_resets
003_create_api_keys.sql      — api_keys (encrypted storage)
004_create_payments.sql      — payments, refunds, audit_logs
005_create_subscriptions.sql — subscription_plans, subscriptions
```

All tables use `UUID` primary keys, `TIMESTAMPTZ` timestamps, and automatic `updated_at` triggers.

---

## Security

### AES-256-GCM Encryption

All payment provider secrets (Stripe, Airwallex secret keys, webhook secrets) are encrypted before storage using AES-256-GCM, which provides both **confidentiality** and **integrity** (authenticated encryption):

```
Stored format: <iv_hex>:<ciphertext_hex>:<authTag_hex>

- IV:       16 bytes, randomly generated per encryption
- Key:      32 bytes (from ENCRYPTION_KEY env var, must be 64 hex chars)
- Auth tag: 16 bytes, detects any tampering
```

The plaintext secret **never leaves the server** — only masked versions (e.g., `••••••abcd`) are returned to clients.

### Authentication

- **JWT access tokens** (15 min lifetime) + **refresh tokens** (7 days, hashed with bcrypt before storage)
- Brute-force protection: 5 failed logins lock the account for 15 minutes
- Token rotation on every refresh, old refresh token invalidated

### Other Controls

- Helmet for HTTP security headers
- CORS restricted to `FRONTEND_URL`
- Global (500 req/15 min) and auth-specific (20 req/15 min) rate limiting
- All SQL queries use parameterized statements (pg driver)
- Passwords hashed with bcrypt (12 rounds)

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- PostgreSQL 14+
- Docker & Docker Compose (optional)

### 1. Generate secrets

```bash
node scripts/generate-secrets.js
```

Paste the output into a `.env` file based on `.env.example`.

### 2. Start with Docker Compose

```bash
cp .env.example .env
# edit .env with your secrets
docker compose up -d
```

### 3. Run migrations

```bash
cd backend
npm install
node migrations/run.js
```

### 4. Local development

```bash
# Backend
cd backend
npm install
npm run dev      # nodemon on :4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev      # Vite on :3000
```

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/register` | Create tenant + owner user |
| `POST` | `/auth/login` | Issue access + refresh tokens |
| `POST` | `/auth/refresh` | Rotate tokens |
| `POST` | `/auth/logout` | Invalidate refresh token |
| `GET`  | `/auth/me` | Current user profile |

### Tenant

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET`    | `/tenants/profile` | any | Get tenant details |
| `PATCH`  | `/tenants/profile` | owner/admin | Update tenant details |
| `GET`    | `/tenants/team` | any | List team members |
| `PATCH`  | `/tenants/team/:userId/role` | owner/admin | Change member role |
| `DELETE` | `/tenants/team/:userId` | owner | Remove member |

### Payments

| Method | Path | Description |
|---|---|---|
| `GET`  | `/payments` | List with filters (status, provider, date range) |
| `GET`  | `/payments/analytics` | Aggregated stats by time period |
| `GET`  | `/payments/:id` | Payment detail |
| `POST` | `/payments` | Record a new payment |
| `POST` | `/payments/:id/refunds` | Issue partial or full refund |

### API Keys

| Method | Path | Description |
|---|---|---|
| `GET`    | `/api-keys` | List (secrets masked) |
| `GET`    | `/api-keys/:id` | Single key (secret masked) |
| `POST`   | `/api-keys` | Store new key (AES-256 encrypted) |
| `PATCH`  | `/api-keys/:id` | Update label |
| `DELETE` | `/api-keys/:id` | Revoke key |

### Webhooks

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhooks/stripe/:tenantId` | Stripe webhook handler (HMAC verified) |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | ✓ | PostgreSQL connection |
| `JWT_ACCESS_SECRET` | ✓ | Random 48-byte hex string |
| `JWT_REFRESH_SECRET` | ✓ | Different random 48-byte hex string |
| `ENCRYPTION_KEY` | ✓ | Exactly 64 hex chars (32 bytes) for AES-256 |
| `FRONTEND_URL` | ✓ | Allowed CORS origin |
| `PORT` | — | Backend port (default: 4000) |
| `DB_SSL` | — | `true` to enable SSL for DB connection |
| `LOG_LEVEL` | — | `debug` / `info` / `warn` / `error` |
