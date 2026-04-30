# SecurePay — Multi-Tenant SaaS Payment Platform

A production-grade multi-tenant SaaS platform for managing payment integrations (Stripe, Airwallex) with AES-256-GCM encryption for all sensitive credentials.

---

## Architecture Overview

```
securepay/
├── backend/                  # Node.js / Express API
│   ├── src/
│   │   ├── config/           # App config, DB pool
│   │   ├── modules/
│   │   │   ├── auth/         # JWT auth, register, login, refresh
│   │   │   ├── organizations/# Tenant management, member invites
│   │   │   ├── users/        # Profile, password management
│   │   │   ├── api-keys/     # AES-256-GCM encrypted provider keys
│   │   │   └── payments/     # Payment intent creation, status tracking
│   │   ├── shared/
│   │   │   ├── middleware/   # authenticate, authorize, validate, rateLimiter
│   │   │   └── utils/        # encryption, logger, apiResponse, pagination
│   │   └── database/
│   │       ├── migrations/   # SQL schema migrations
│   │       └── seeds/        # Demo data
│   └── Dockerfile
├── frontend/                 # React 18 SPA
│   ├── src/
│   │   ├── components/       # Button, Input, Card, Badge, Sidebar, Layout
│   │   ├── pages/            # Login, Register, Dashboard, Payments, ApiKeys, Team, Settings
│   │   ├── services/         # Axios API clients per domain
│   │   ├── store/            # Redux Toolkit slices
│   │   └── hooks/
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Tech Stack

| Layer      | Technology                                         |
|------------|----------------------------------------------------|
| Backend    | Node.js 20 · Express 4 · pg (PostgreSQL driver)    |
| Frontend   | React 18 · React Router 6 · Redux Toolkit · Tailwind CSS |
| Database   | PostgreSQL 16                                      |
| Encryption | AES-256-GCM (Node.js `crypto` module)              |
| Auth       | JWT (access 15m + refresh 7d, rotation on use)     |
| Containers | Docker · Docker Compose · Nginx                    |

---

## Multi-Tenancy Model

Every resource is scoped to an **organization** (tenant). The database enforces this via foreign keys — no row-level security policy is needed because all queries are parameterized with `organization_id`.

### Organization Types

| Type     | Description                                              |
|----------|----------------------------------------------------------|
| `solo`   | Individual / freelancer — single user, personal workspace |
| `agency` | Company / team — multiple members with role-based access |

### User Roles (within an organization)

| Role     | Capabilities                                            |
|----------|---------------------------------------------------------|
| `owner`  | Full control — delete keys, change plans, manage all    |
| `admin`  | Manage members, API keys, payments (cannot delete owner)|
| `member` | Read-only for payments; no key management               |

---

## AES-256-GCM Encryption

API key secrets (Stripe `sk_live_*`, Airwallex, webhooks) are **never stored in plaintext**.

### How it works

1. On key creation, `encrypt(secretKey)` is called in `src/shared/utils/encryption.js`
2. A random 16-byte IV is generated per encryption call
3. AES-256-GCM encrypts the value and produces a 16-byte authentication tag
4. The output format is: `base64(<iv_hex>:<authTag_hex>:<ciphertext_hex>)`
5. Only this blob is persisted in `organization_api_keys.encrypted_secret_key`
6. On retrieval for internal use (e.g. creating a payment intent), `decrypt()` verifies the auth tag and returns the plaintext — which is **never sent to the client**
7. The client only ever sees a masked version: `sk_li****...live`

### Key generation

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Database Schema

```
organizations          — root tenant entity (id, name, slug, type, plan)
  └── users            — scoped members (role: owner|admin|member)
  └── refresh_tokens   — JWT refresh token rotation store
  └── organization_invitations  — pending email invites
  └── organization_api_keys     — AES-256-GCM encrypted provider credentials
  └── payments         — tenant-scoped payment records
  └── audit_logs       — immutable append-only security audit trail
```

### Key constraints
- `organizations.slug` — globally unique, URL-safe identifier
- `users.email` — globally unique (a user belongs to exactly one org)
- `organization_api_keys` — `(organization_id, provider, label)` unique together
- All `updated_at` columns are maintained by a PostgreSQL trigger function

---

## Quick Start

### Prerequisites
- Node.js ≥ 18
- PostgreSQL 14+
- Docker & Docker Compose (optional)

### 1. Clone & configure

```bash
cp .env.example .env
# Edit .env — set DB credentials and generate secrets (see below)
```

**Generate secrets:**
```bash
# JWT secrets (64-byte hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# AES-256-GCM key (32-byte hex → 64 chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2a. Docker Compose (recommended)

```bash
docker compose up --build
```

Services start on:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- PostgreSQL: localhost:5432

### 2b. Manual

**Backend:**
```bash
cd backend
npm install
npm run migrate      # Apply SQL migrations
npm run seed         # Optional: insert demo data
npm run dev          # Start with nodemon
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### Auth

| Method | Path              | Description                        |
|--------|-------------------|------------------------------------|
| POST   | /auth/register    | Create org + owner account         |
| POST   | /auth/login       | Get access + refresh tokens        |
| POST   | /auth/refresh     | Rotate refresh token               |
| POST   | /auth/logout      | Revoke all refresh tokens          |
| GET    | /auth/me          | Get current user from token        |

### Organizations

| Method | Path                                          | Role required    |
|--------|-----------------------------------------------|------------------|
| GET    | /organizations/:id                            | any              |
| PATCH  | /organizations/:id                            | owner, admin     |
| GET    | /organizations/:id/members                    | any              |
| POST   | /organizations/:id/members/invite             | owner, admin     |
| PATCH  | /organizations/:id/members/:userId/role       | owner, admin     |

### API Keys (AES-256-GCM encrypted)

| Method | Path                                          | Role required    |
|--------|-----------------------------------------------|------------------|
| GET    | /organizations/:id/api-keys                   | any              |
| POST   | /organizations/:id/api-keys                   | owner, admin     |
| GET    | /organizations/:id/api-keys/:keyId            | any (masked)     |
| PUT    | /organizations/:id/api-keys/:keyId/rotate     | owner, admin     |
| PATCH  | /organizations/:id/api-keys/:keyId/toggle     | owner, admin     |
| DELETE | /organizations/:id/api-keys/:keyId            | owner            |

### Payments

| Method | Path                                          | Role required    |
|--------|-----------------------------------------------|------------------|
| GET    | /organizations/:id/payments                   | any              |
| POST   | /organizations/:id/payments/intent            | any              |
| GET    | /organizations/:id/payments/:paymentId        | any              |
| PATCH  | /organizations/:id/payments/:paymentId/status | owner, admin     |

---

## Security Checklist

- [x] AES-256-GCM encryption for all payment provider secrets
- [x] JWT access tokens (15m) + rotating refresh tokens (7d)
- [x] bcrypt password hashing (12 rounds)
- [x] Rate limiting on all routes (10 req/15min on auth routes)
- [x] `helmet` for HTTP security headers
- [x] CORS configured to specific origins
- [x] Tenant guard prevents cross-organization data access
- [x] Role-based access control (owner / admin / member)
- [x] Parameterized queries — no SQL injection surface
- [x] Immutable audit log table
- [x] Production env validates required secrets at startup

---

## License

MIT
