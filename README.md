# SecurePay — Multi-Tenant SaaS Payment Platform

A production-ready, modular SaaS platform for managing Stripe and Airwallex integrations across multiple isolated tenants, with AES-256-GCM encryption for all sensitive API keys.

---

## Architecture Overview

```
securepay/
├── backend/                  # Node.js / Express API
│   ├── src/
│   │   ├── config/           # DB pool, app config
│   │   ├── db/
│   │   │   ├── migrations/   # 001_initial_schema.sql (PostgreSQL + RLS)
│   │   │   └── seeds/
│   │   ├── middleware/       # auth JWT, tenantContext, validation, errors
│   │   ├── modules/
│   │   │   ├── auth/         # register, login, refresh, logout, /me
│   │   │   ├── organizations/# org CRUD, stats, members
│   │   │   ├── api-keys/     # AES-256-GCM encrypted key management
│   │   │   ├── payments/     # payment lifecycle + stats
│   │   │   └── users/        # user management, role changes
│   │   ├── services/
│   │   │   ├── encryption.js # AES-256-GCM encrypt/decrypt/reEncrypt/generateKey
│   │   │   └── logger.js     # Winston structured logging
│   │   └── server.js         # Express app entrypoint
│   └── tests/
│       └── unit/
│           └── encryption.test.js
│
├── frontend/                 # React 18 SPA
│   └── src/
│       ├── components/
│       │   ├── auth/         # LoginPage, RegisterPage (Solo/Agency selector)
│       │   ├── common/       # Button, Input, Card, Badge, Sidebar
│       │   ├── dashboard/    # DashboardPage (stats + chart)
│       │   ├── payments/     # PaymentsPage (list + create)
│       │   └── organizations/# ApiKeysPage, TeamPage, SettingsPage
│       ├── hooks/            # useAuth
│       ├── pages/            # AppLayout (protected route wrapper)
│       ├── services/         # Axios API client with auto-refresh
│       └── store/slices/     # Redux authSlice
│
├── shared/types/             # Shared constants (roles, plans, currencies)
└── docker/docker-compose.yml # Full stack compose (postgres, backend, frontend)
```

---

## Key Design Decisions

### Multi-Tenancy (Tenant Isolation)
Every database table that holds tenant data has an `organization_id` foreign key. **Row-Level Security (RLS)** policies are applied to those tables in PostgreSQL, and the `tenantContext` middleware sets `app.current_org_id` as a session variable before every query, enforcing isolation at the DB level — not just the application layer.

### User Types
| Plan | Identifier | Max Members | Max API Keys | Features |
|------|-----------|-------------|-------------|----------|
| Solo | `solo` | 1 | 2 | Individual freelancer |
| Agency | `agency` | Unlimited | 10 | Team roles, member management |

### AES-256-GCM Encryption
Payment provider API keys (Stripe, Airwallex) are **never stored in plaintext**. The encryption service (`backend/src/services/encryption.js`) uses:
- Algorithm: `aes-256-gcm` (authenticated encryption — prevents tampering)
- Random 96-bit IV per encryption (prevents ciphertext replay)
- Auth tag verification on decrypt
- Storage format: `iv:authTag:ciphertext` (all hex-encoded, colon-delimited)
- Key rotation: `reEncrypt()` utility for zero-downtime rotation

### Auth Flow
- **Access token**: JWT (15 min expiry), signed with `JWT_SECRET`
- **Refresh token**: JWT (7 days), rotated on every use (stored as SHA-256 hash)
- **Refresh rotation**: old token is revoked immediately on refresh to prevent replay

---

## Database Schema (PostgreSQL)

```
organizations     — Tenants (solo/agency, plan limits, billing)
users             — Members belonging to one organization
refresh_tokens    — Hashed JWT refresh tokens with revocation
api_keys          — Encrypted Stripe/Airwallex keys (AES-256-GCM)
payments          — Payment records scoped to tenant
audit_logs        — Immutable activity log per org
invitations       — Email-based team invites (agency plan)
schema_migrations — Migration version tracking
```

All tables (except `organizations` and `schema_migrations`) have **RLS policies** to enforce tenant isolation.

---

## Quick Start

### 1. Environment Setup

```bash
cd backend
cp .env.example .env
# Edit .env — set DB_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY

# Generate a secure encryption key:
node -e "const c = require('crypto'); console.log(c.randomBytes(32).toString('hex'));"
```

### 2. Docker Compose (Recommended)

```bash
cd docker
docker-compose up --build
```

- PostgreSQL: `localhost:5432`
- Backend API: `localhost:5000`
- Frontend: `localhost:3000`

### 3. Manual Setup

```bash
# Database
psql -U postgres -c "CREATE DATABASE securepay;"
psql -U postgres -c "CREATE USER securepay_user WITH ENCRYPTED PASSWORD 'yourpassword';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE securepay TO securepay_user;"

# Backend
cd backend
npm install
npm run migrate
npm run dev

# Frontend
cd frontend
npm install
npm start
```

### 4. Run Tests

```bash
cd backend
npm test
```

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/register` | — | Register org + owner |
| POST | `/api/v1/auth/login` | — | Login |
| POST | `/api/v1/auth/refresh` | — | Rotate refresh token |
| POST | `/api/v1/auth/logout` | — | Revoke refresh token |
| GET | `/api/v1/auth/me` | ✓ | Current user profile |
| GET | `/api/v1/organizations` | ✓ | Get current org |
| PATCH | `/api/v1/organizations` | ✓ owner/admin | Update org |
| GET | `/api/v1/organizations/stats` | ✓ | Org statistics |
| GET | `/api/v1/api-keys` | ✓ | List API keys (no secrets) |
| POST | `/api/v1/api-keys` | ✓ owner/admin | Add encrypted key |
| PUT | `/api/v1/api-keys/:id/rotate` | ✓ owner/admin | Rotate key |
| DELETE | `/api/v1/api-keys/:id` | ✓ owner/admin | Deactivate key |
| GET | `/api/v1/payments` | ✓ | List payments (paginated) |
| POST | `/api/v1/payments` | ✓ | Create payment |
| GET | `/api/v1/payments/stats` | ✓ | Aggregate payment stats |
| GET | `/api/v1/users` | ✓ owner/admin | List org users |
| PATCH | `/api/v1/users/me/profile` | ✓ | Update own profile |
| POST | `/api/v1/users/me/change-password` | ✓ | Change password |
| PATCH | `/api/v1/users/:id/role` | ✓ owner/admin | Change member role |
| DELETE | `/api/v1/users/:id` | ✓ owner/admin | Deactivate member |

---

## Security Checklist

- [x] AES-256-GCM encryption for all API keys at rest
- [x] JWT access + refresh token rotation
- [x] PostgreSQL Row-Level Security (RLS) per tenant
- [x] bcrypt (12 rounds) for password hashing
- [x] Helmet.js security headers
- [x] Global + per-route rate limiting
- [x] Input validation with express-validator
- [x] No secrets in logs (key prefix only displayed)
- [x] Non-root Docker container user
- [x] CORS restricted to configured origin
