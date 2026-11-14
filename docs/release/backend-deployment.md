# DFarm Smart Dairy Management System — Backend Production Deployment Guide
**Document Reference:** `docs/release/backend-deployment.md`  
**Phase:** 20 of 20 (Production Release Readiness)  
**Target:** Node.js v22 (LTS) / Express ESM / PostgreSQL 17  
**Auditor Roles:** Principal DevOps Engineer, Node.js Backend Architect  

---

## 1. Overview & Build Verification

The DFarm backend core (`services/backend`) provides RESTful APIs, offline synchronization ingestion, double-entry financial ledger accounting, billing automation, and webhook event processing.

- **Language:** TypeScript 5.7 (Target: `ES2022`, Module: `NodeNext`)
- **Compilation Status:** **VERIFIED (Exit Code 0, dist fully populated)**
- **Health Endpoint:** `GET /health` returns `{ "status": "UP", "timestamp": "...", "database": "CONNECTED" }`

---

## 2. Production Environment Specification

All environment secrets must be configured via environment variables or a container secret manager:

| Key | Type | Description | Production Example |
|:---|:---:|:---|:---|
| `NODE_ENV` | string | Execution environment | `production` |
| `PORT` | number | HTTP listen port | `4000` |
| `API_BASE_URL` | url | Public canonical API base | `https://api.dfarm.example.com/api/v1` |
| `CORS_ALLOWED_ORIGINS` | csv | Allowed CORS browser origins | `https://admin.dfarm.example.com,https://app.dfarm.example.com` |
| `DATABASE_URL` | url | PostgreSQL connection string | `postgresql://dfarm_app:STRONG_PASSWORD@db.dfarm.internal:5432/dfarm_prod` |
| `SUPABASE_URL` | url | Supabase tenant URL | `https://xyzcompany.supabase.co` |
| `SUPABASE_ANON_KEY` | string | Supabase client anon key | `eyJhbGciOiJIUzI1Ni...` |
| `SUPABASE_SERVICE_ROLE_KEY`| string | Server-only administrative key | `eyJhbGciOiJIUzI1Ni...` (SERVER ONLY) |
| `JWT_SECRET` | string | Local JWT signing secret | 64+ char random hex string |
| `WHATSAPP_ENABLED` | boolean| WhatsApp Cloud API toggle | `true` (when provider approved) |
| `WHATSAPP_API_URL` | url | Meta Graph API root | `https://graph.facebook.com/v21.0` |
| `WHATSAPP_ACCESS_TOKEN` | string | Meta System User Access Token | `EAA...` |
| `WHATSAPP_PHONE_NUMBER_ID`| string | WhatsApp Cloud Phone ID | `105948372615` |
| `WHATSAPP_APP_SECRET` | string | Meta App Secret for HMAC webhook | `a1b2c3d4...` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN`| string | Verification token for GET hook | `dfarm_webhook_token_secure` |
| `RATE_LIMIT_WINDOW_MS` | number | Rate limit window in ms | `60000` (1 minute) |
| `RATE_LIMIT_MAX_REQUESTS` | number | Max requests per IP per window | `100` |

---

## 3. Database Connection Pool Architecture

The backend utilizes `pg.Pool` with connection pool safeguards:

```typescript
export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,                       // Max connections per container instance
  idleTimeoutMillis: 30000,      // Reclaim idle connections after 30s
  connectionTimeoutMillis: 5000, // Fast fail on database unreachability
});
```

- In production clusters with horizontal scaling, total database connections must not exceed PostgreSQL `max_connections` (configured in `postgresql.conf`).
- Use PgBouncer in transaction pooling mode for deployments scaling beyond 5 worker containers.

---

## 4. Production Process Management (Systemd / Docker)

### 4.1 Systemd Service Unit (`dfarm-backend.service`)

```ini
[Unit]
Description=DFarm Smart Dairy Management Backend
After=network.target postgresql.service

[Service]
Type=simple
User=dfarm
WorkingDirectory=/opt/dfarm/services/backend
EnvironmentFile=/etc/dfarm/backend.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5s
KillSignal=SIGTERM
TimeoutStopSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 4.2 Graceful Shutdown Handling

On receiving `SIGTERM` or `SIGINT`:
1. The HTTP listener stops accepting new connections.
2. In-flight HTTP requests and sync batches are granted up to 10 seconds to complete.
3. Background retry workers and schedulers are halted.
4. Database pool `pool.end()` drains and closes all active PostgreSQL connections cleanly.

---

## 5. Production Observability & Logging

- **Logging Library:** Pino structured JSON logger (`pino` / `pino-http`).
- **PII Scrubbing:** Phone numbers, bank accounts, passwords, and JWT tokens are masked or stripped from logs before emission.
- **Request Tracing:** Every HTTP request is assigned a unique `X-Request-Id` UUID for end-to-end distributed tracing.

