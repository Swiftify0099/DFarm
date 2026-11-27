# DFarm RESTART-03.1 — Real PostgreSQL 17 Verification Report

**Audit Phase:** `RESTART-03.1`  
**Date:** `2026-11-26`  
**Verification Status:** **BLOCKED / NOT RUN** *(Zero `pg-mem` substitution permitted; `restart03-real-postgres.test.js` skipped cleanly)*

---

## 1. Workstation PostgreSQL 17 & Docker Diagnostics

All read-only infrastructure probes executed during `RESTART-03.1` (`task-654`, `task-671`) confirmed that no real PostgreSQL server is available on this Windows host:

| Probe | Observed Result |
| :--- | :--- |
| Native PostgreSQL Services (`Get-Service *postgres*,*pg*,*docker*`) | Only `com.docker.service` found — status **`Stopped`** (`StartType: Manual`); zero Postgres services |
| PostgreSQL CLI Binaries (`where.exe psql initdb pg_ctl pg_isready`) | **Not found** (`C:\Program Files\PostgreSQL` absent) |
| Localhost TCP Ports (`5432`, `5433`, `5434`, `54322`, `55432`) | **All `TcpTestSucceeded=False`** |
| WSL / Docker Engine (`wsl -l -v` + `docker ps`) | `docker-desktop` distro running (`WSL 2`), but Docker API returns HTTP `500 Internal Server Error` on `npipe:////./pipe/dockerDesktopLinuxEngine` |
| Production / Remote `.env` URLs | **Explicitly forbidden & unused** per repository safety policy |

---

## 2. Suite Execution Result

Command:
```powershell
Remove-Item Env:TEST_POSTGRES_URL -ErrorAction SilentlyContinue
node --test services/backend/tests/restart03-real-postgres.test.js
```

Observed Output (`task-691`):
```text
services/backend/tests/restart03-real-postgres.test.js | EXIT=0 | tests=1 | pass=0 | fail=0 | skipped=1 | ms=273.4487
```

Console disclosure observed in `task-671`:
> `[RESTART-03 REAL PG] Physical PostgreSQL 17 server unavailable (TEST_POSTGRES_URL unset or unreachable). Test marked as SKIP / NOT RUN (no pg-mem fallback).`

---

## 3. Exact Gate Still Required on a Docker / PostgreSQL 17 Host

Until executed against two isolated disposable PostgreSQL 17 databases + one control-plane database, the following remain **UNVERIFIED AGAINST LIVE POSTGRESQL**:

1. Real PG application & idempotency of migrations `001`–`045` (excluding historical data script `031_remove_dairy_admin_7507495615.sql`), verifying PostgreSQL `SELECT version()` and partial unique index `uq_kiosk_shift_sessions_active_open`.
2. PostgreSQL FK (`23503`) rejection when an unseeded center, org, or operator UUID is passed to `kiosk_shift_sessions` or `customers` (proving zero synthetic entity insertion in real Postgres).
3. True parallel PG transaction race against `OpenShiftSessionUseCase` / `PostgresShiftSessionRepository.save()` confirming single winner and `23505` conflict enforcement under concurrent connections.
4. Transaction `ROLLBACK` atomicity, cross-DB row count (`0` in Tenant B & Control Plane when writing Tenant A), and RLS behavior in PostgreSQL 17.

**CI / Local Docker Runbook ([docker-compose.pg17-verify.yml](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docker-compose.pg17-verify.yml)):**
```powershell
docker compose -f docker-compose.pg17-verify.yml up -d --wait
$env:TEST_POSTGRES_URL = "postgresql://dfarm_verify:dfarm_verify_local@127.0.0.1:55432/dfarm_central"
node --test services/backend/tests/restart03-real-postgres.test.js
npm run db:test
docker compose -f docker-compose.pg17-verify.yml down -v
```
