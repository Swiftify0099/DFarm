# DFarm Backend Setup & Development Guide
**Phase 05 Authoritative Specification — Local Environment, Supabase Stack & Verification**

---

## 1. Prerequisites

- **Operating System:** Windows 10/11, macOS, or Linux.
- **Node.js:** Node.js 22 LTS (`>= 22.0.0`).
- **NPM:** NPM 10+ (`>= 10.0.0`).
- **Docker:** Docker Desktop running with WSL2 backend (Windows) or native engine (Linux/macOS).
- **Supabase CLI:** Project-pinned version `3.1.0` (invoked via `npx supabase`).

---

## 2. Supabase Local Stack Setup

The local development stack includes PostgreSQL 17, Kong API Gateway, Supabase Auth (GoTrue), PostgREST, and InBucket/Mailpit.

### 2.1 Starting Local Supabase Stack
```bash
# Verify local CLI version
npx supabase --version
# Expected: 3.1.0

# Start local stack
npx supabase start
```

### 2.2 Verifying Service URLs & Ports
- **PostgreSQL 17:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **Kong Gateway (API & Auth):** `http://127.0.0.1:54321`
- **Supabase Studio (Web UI):** `http://127.0.0.1:54323`
- **Mailpit (Inbucket):** `http://127.0.0.1:54324`

### 2.3 Running Database Migrations
Migrations are managed deterministically through the Supabase migration runner:
```bash
npx supabase migration up
```
Total migrations: 11 migrations (`001` through `011_customer_lifecycle_and_auth_mapping.sql`).

---

## 3. Backend Environment Configuration

The backend reads configuration using Zod startup validation (`src/config/env.ts`).

Create `.env` in the root or in `services/backend/.env`:

```ini
# Environment
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
API_BASE_URL=http://localhost:3000/api/v1
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Local Supabase Services
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Rate Limiting & Defaults
DEFAULT_PHONE_REGION=IN
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
```

> [!IMPORTANT]
> Never commit `.env` or `.env.local` to Git. Ensure `.gitignore` contains `.env`, `.env.local`, and `*.local`.
> Never distribute `SUPABASE_SERVICE_ROLE_KEY` to client-side packages (Android or React Web).

---

## 4. Building the Project

The DFarm repository is an NPM monorepo with 4 TypeScript workspaces:
- `packages/shared-types`
- `packages/shared-validation`
- `packages/database`
- `services/backend`

To compile all workspaces:
```bash
npm run build
```
Exit code `0` verifies clean compilation across base TypeScript 5.7 configurations.

---

## 5. Running Automated Test Suites

### 5.1 Run Entire Monorepo Test Suite
```bash
npm test
```
Executes:
1. `@dfarm/shared-types`: Typecheck validation.
2. `@dfarm/shared-validation`: Schema integrity checks.
3. `@dfarm/database`: 42 tests covering migration static checks, pg-mem emulation, and real PostgreSQL 17 + RLS isolation.
4. `@dfarm/backend`: 39 integration tests covering health probes, authentication, customer CRUD, soft-deletion, restoration, CORS, and rate limiting.

### 5.2 Run Backend Tests Individually
```bash
# Customer endpoint integration
node --test services/backend/tests/customer-endpoints.test.js

# Health probes, authentication, CORS, and rate limiting
node --test services/backend/tests/health-and-auth.test.js

# Role-based access control, soft delete, and restore lifecycle
node --test services/backend/tests/customer-lifecycle-security.test.js
```

---

## 6. Running the Backend Server Locally

```bash
# From workspace root
npm --prefix services/backend start

# Or directly with node
node services/backend/dist/server.js
```

The server binds to `http://localhost:3000` (or configured `PORT`) and outputs structured Pino logs.
Liveness probe available at: `http://localhost:3000/health/live`.
Readiness probe available at: `http://localhost:3000/health/ready`.
API Root: `http://localhost:3000/api/v1`.
