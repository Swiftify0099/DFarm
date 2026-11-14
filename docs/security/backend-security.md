# DFarm Backend Security Architecture
**Phase 05 Authoritative Specification — Security Middleware, Protection Layers & Threat Mitigations**

---

## 1. Multi-Layer Defense Overview

The DFarm backend implements defense-in-depth across the application boundary, HTTP protocol layer, authentication middleware, and database access layer.

```
Incoming Request
       │
       ▼
[1. Helmet Security Headers]  ──> Strict CSP, HSTS, Sniff Prevention, Frame Deny
       │
       ▼
[2. Strict CORS Allowlist]    ──> Restricts browser clients to approved origins
       │
       ▼
[3. Request Context ID]       ──> Generates UUID X-Request-Id for trace correlation
       │
       ▼
[4. Rate Limiting]            ──> Sliding window request throttle (HTTP 429)
       │
       ▼
[5. Authentication Filter]    ──> Server-side JWT validation & DB identity resolution
       │
       ▼
[6. RBAC & Scope Enforcer]    ──> Role-based checks & Organization/Center isolation
       │
       ▼
[7. Zod Schema Validation]    ──> Strict payload typing & input boundary sanitization
       │
       ▼
[8. PostgreSQL RPC Layer]     ──> Atomic transactions, RLS enforcement & audit logging
```

---

## 2. Security Middleware Architecture

### 2.1 HTTP Protection (Helmet & CORS)
- **Helmet (`helmet()`):**
  - Content Security Policy (CSP): Blocks unauthorized script injection.
  - Strict Transport Security (HSTS): Enforces 1-year HTTPS requirement (`max-age=31536000; includeSubDomains`).
  - X-Frame-Options: `SAMEORIGIN` to defeat clickjacking attacks.
  - X-Content-Type-Options: `nosniff` preventing MIME-type confusion attacks.
- **CORS (`cors(corsOptions)`):**
  - Configured strictly via `CORS_ALLOWED_ORIGINS` environment variable.
  - Cross-origin requests with unapproved `Origin` headers are rejected with `Error: Origin ... is not allowed by CORS policy`.
  - Non-browser requests (mobile native apps, offline sync clients, curl, health probes) without `Origin` headers are safely permitted.

### 2.2 Rate Limiting (`rateLimiter`)
- Uses `express-rate-limit` with draft-7 IETF headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).
- Evaluated per client IP address.
- Configured via `RATE_LIMIT_WINDOW_MS` (default: 60,000ms) and `RATE_LIMIT_MAX_REQUESTS` (default: 100 requests).
- Health probes (`/health/live`, `/health/ready`) bypass rate limiting to prevent orchestrator check starvation.

### 2.3 Request Tracing & Correlation
- Middleware (`requestContextMiddleware`) assigns a unique UUIDv4 `X-Request-Id` to every inbound request.
- The ID is populated in:
  1. `req.id` property.
  2. Outbound HTTP response header `X-Request-Id`.
  3. Every Pino structured log entry (`reqId`).
  4. Response envelopes under `meta.requestId`.

### 2.4 Structured Redacted Logging
- Backed by Pino and `pino-http`.
- Automatic redaction of sensitive credentials and tokens:
  - `req.headers.authorization` -> `[REDACTED]`
  - `password`, `token`, `secret`, `anonKey`, `serviceRoleKey`, `otp` -> `[REDACTED]`
- Tokens or passwords never appear in plain text in log streams or terminal outputs.

---

## 3. Dual Supabase Client Isolation

To maintain strict privilege separation, the backend provides two distinct Supabase access clients:

### A. Authenticated Request Client (`createUserSupabaseClient(token)`)
- Built dynamically per HTTP request using the verified user's Bearer JWT token.
- Respects all PostgreSQL Row Level Security (RLS) policies.
- Automatically scoped to the caller's authorized tenant and user identifier.
- Discarded at request completion; never shared between concurrent requests.

### B. Administrative Service-Role Client (`getAdminSupabaseClient()`)
- Server-side only singleton initialized with `SUPABASE_SERVICE_ROLE_KEY`.
- Bypasses PostgreSQL RLS.
- **Access Restrictions:**
  - Never imported by frontend or mobile packages.
  - Accessible only to trusted server-side repositories.
  - Privileged actions (e.g. customer registration, soft deletion) are mediated through database RPC functions that enforce explicit organization checks and record immutable audit logs.
