# DFarm RESTART-03.2 — Real PostgreSQL 17 Verification & Host Blocker Report

**Phase:** `RESTART-03.2`  
**Date:** `2026-11-27`  
**Remote & Local Base HEAD:** `47f97db6ce1e29952547b6946f303f59666ee694`  
**Gate Verdict:** **`BLOCKED — REAL POSTGRESQL 17 UNREACHABLE ON HOST`** (`pg-mem` test doubles are NOT substituted as PG17 evidence)

---

## 1. Host Environment Diagnostics (Non-Destructive Inspection)

| Component / Check | Observed Output |
| :--- | :--- |
| Windows Elevation | `IsInRole(Administrator) = False` (non-elevated user shell) |
| Native PostgreSQL Binaries | `psql`, `initdb`, `pg_ctl`, `pg_isready` absent (`C:\Program Files\PostgreSQL` = `False`; `winget`/`choco` have no PostgreSQL packages) |
| Local PostgreSQL TCP Ports | `5432`, `54322`, `55432` all closed (`TcpTestSucceeded = False`) |
| Hypervisor & Disk Space | `HypervisorPresent = True`; `C:` free space = `28,897,148,928` bytes (~26.9 GB) |
| Windows Docker Service | `com.docker.service` `Status: Stopped`, `StartType: Manual` |
| WSL2 & Docker Desktop CLI | `wsl -l -v` reports `docker-desktop` (`Running`, Version 2); `docker desktop status` = `running` |
| Docker Engine API | `docker version` fails HTTP `500 Internal Server Error` on `npipe:////./pipe/dockerDesktopLinuxEngine`; `monitor.log` shows `dialing 192.168.65.7:2376: context deadline exceeded` |
| Non-Destructive Recovery Attempt | Ran safe `docker desktop restart` and `wsl -d docker-desktop -e ps -ef`; both hung (>45s) and were cleanly cancelled without data loss |

---

## 2. Real PostgreSQL 17 Test Execution Results (`SKIP / NOT RUN`)

Both Real PostgreSQL 17 suites refuse to fall back to `pg-mem` when `TEST_POSTGRES_URL` is unset/unreachable and skip honestly:

| Suite | Command | Result | Observed Output |
| :--- | :--- | :---: | :--- |
| [`restart03-real-postgres.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart03-real-postgres.test.js) | `node --test services/backend/tests/restart03-real-postgres.test.js` | **SKIP / NOT RUN** (`EXIT=0`) | `ok 1 - RESTART-03 Real PostgreSQL 17 Isolation, FK, Partial Index & Ownership Verification Suite # SKIP Real PostgreSQL 17 server unavailable; boot docker-compose.pg17-verify.yml and set TEST_POSTGRES_URL` (`# tests 1, # pass 0, # fail 0, # skipped 1`) |
| [`restart032-real-postgres.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart032-real-postgres.test.js) | `node --test services/backend/tests/restart032-real-postgres.test.js` | **SKIP / NOT RUN** (`EXIT=0`) | `ok 1 - RESTART-03.2 Real PostgreSQL 17 Operational Repository Isolation & Concurrency Suite # SKIP Real PostgreSQL 17 server unavailable; boot docker-compose.pg17-verify.yml and set TEST_POSTGRES_URL` (`# tests 1, # pass 0, # fail 0, # skipped 1`) |
| [`concurrent-idempotency-financial.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/concurrent-idempotency-financial.test.js) | `$env:NODE_ENV='test'; node --test services/backend/tests/concurrent-idempotency-financial.test.js` | **SKIP / NOT RUN** (`EXIT=0`) | `ok 1 - DFarm P0: Concurrent Collection Idempotency & Financial Atomicity Integration Suite # SKIP Real PostgreSQL environment unavailable` (`# tests 1, # pass 0, # fail 0, # skipped 1`) |

---

## 3. Isolated PG17 Test Scope Prepared in `restart032-real-postgres.test.js`

When a real PostgreSQL 17 instance is available via [`docker-compose.pg17-verify.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docker-compose.pg17-verify.yml), [`restart032-real-postgres.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart032-real-postgres.test.js) provisions 3 ephemeral isolated databases (`dfarm_r32_ctrl_*`, `dfarm_r32_a_*`, `dfarm_r32_b_*`), applies all migrations (excluding quarantined `031_remove_dairy_admin_7507495615.sql`), tests:
1. Real PG17 FK `23503` enforcement rejecting missing customer/center/operator on `ledger_transactions` writes with zero leakage across `B` and `Ctrl`.
2. Concurrent `Promise.all` transactions with real PG `SELECT ... FOR UPDATE` serialization verifying exact balance `200` on customer A and `0` on customer B.
3. Real PG `ROLLBACK` atomicity leaving zero partial mutations, before dropping all 3 disposable databases.

---

## 4. Exact Operator Commands to Unblock & Execute Real PG17 Gate (Elevated PowerShell)

Run in an **Administrator PowerShell** session at the worktree root:

```powershell
# 1. Recover Docker Desktop Windows Service & WSL2 Engine
Start-Service com.docker.service
wsl --shutdown
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
# Wait until `docker info` succeeds cleanly

# 2. Boot disposable isolated PostgreSQL 17 container (127.0.0.1:55432, tmpfs only)
docker compose -f docker-compose.pg17-verify.yml up -d --wait

# 3. Execute Real PG17 verification gates
$env:NODE_ENV = "test"
$env:TEST_POSTGRES_URL = "postgresql://dfarm_verify:dfarm_verify_local@127.0.0.1:55432/dfarm_central"
node --test services/backend/tests/restart03-real-postgres.test.js
node --test services/backend/tests/restart032-real-postgres.test.js

# 4. Tear down disposable container & volume
docker compose -f docker-compose.pg17-verify.yml down -v
```
