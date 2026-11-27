# DFARM RESTART-03.5A — Final CI & Regression Matrix

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Public Baseline HEAD:** `805326112c6daf0c902a3abbefc5be1a8f740023`
- **Local Worktree State:** `805326112c6daf0c902a3abbefc5be1a8f740023` + uncommitted `RESTART-03.5A` remediations (Fixes A–G, additive migration `047`, rebuilt `dist/`)
- **Overall Classification:** **`BLOCKED`** — All local builds, DB validations, 13 core offline backend suites (`230/230`), 4 frontend workspaces (`255/255`), and `REQUIRE_REAL_POSTGRES=1` fail-closed guards pass post-final edit; live post-fix PostgreSQL `17.12` execution cannot run on this host (`com.docker.service` stopped / `Docker Desktop is unable to start`, no native PG17, `git commit`/`push` prohibited by safety rules).

---

## 1. GitHub Actions Baseline (`805326112c6daf0c902a3abbefc5be1a8f740023`)

| Workflow | Run / Job | PostgreSQL / Scanner | Conclusion | Scope Summary |
|---|---|---|---|---|
| `RESTART-03 PostgreSQL 17 Repository Verification` | [`45938275998`](https://github.com/Swiftify0099/DFarm/actions/runs/45938275998) / [`140306423963`](https://github.com/Swiftify0099/DFarm/actions/runs/45938275998/job/140306423963) | PostgreSQL `17.12` | **`failure`** | Steps `1–8` (`build:backend`, `db:validate`, `ci-pg17-bootstrap.js`) passed; Step `9` failed on Fixes A–G (`restart03` array literal, `restart032` async cleanup error, `KioskShiftSession` null `total_liters`, `AccountAuthorityService` `customers` on central DB, `037` `customer_name`, `post_customer_advance` `balanceAfter`, signed `Money` / `reconcile_customer_ledger` orphan). |
| `Gitleaks Secret & Profile Scan` | [`45938276023`](https://github.com/Swiftify0099/DFarm/actions/runs/45938276023) / [`140306423779`](https://github.com/Swiftify0099/DFarm/actions/runs/45938276023/job/140306423779) | Gitleaks full history | **`failure`** | `54` full-history findings across `40` commits (tracked separately under `DF-003` / `RESTART-12`). |

---

## 2. Local Post-Edit Verification Matrix (`RESTART-03.5A`)

### 2.1 Build & Database Package

| Command | Mode | Result | Exit Code | Status |
|---|---|---|---|---|
| `npm run build:backend` | TypeScript (`shared-types`, `shared-validation`, `database`, `services/backend`) | Clean build | `0` | **PASS** |
| `npm run db:validate` | Static SQL validator | `13/13` checks passed | `0` | **PASS** |
| `npm run db:test` | `pg-mem` + PG skip | `22/22` passed across `3` suites (suite 2 Real PG skipped) | `0` | **PASS (PG skipped)** |

### 2.2 Backend Core Offline Suites (`NODE_ENV=test TENANT_POOL_CONNECTION_TIMEOUT_MS=500`)

| Suite (`services/backend/tests/...`) | Engine | Tests | Pass | Fail | Skip | Exit | Status |
|---|---|---:|---:|---:|---:|---:|---|
| `restart032-operational-repository-isolation.test.js` | `pg-mem` | 17 | 17 | 0 | 0 | 0 | **PASS** |
| `restart03-tenant-isolation-and-ownership.test.js` | `pg-mem` | 18 | 18 | 0 | 0 | 0 | **PASS** |
| `customer-data-lifecycle-e2e.test.js` | `pg-mem` | 9 | 9 | 0 | 0 | 0 | **PASS** |
| `restart02-auth-security-remediation.test.js` | `pg-mem` | 9 | 9 | 0 | 0 | 0 | **PASS** |
| `restart021-auth-session-integrity.test.js` | `pg-mem` | 7 | 7 | 0 | 0 | 0 | **PASS** |
| `collection-kiosk-production.test.js` | `pg-mem` | 24 | 24 | 0 | 0 | 0 | **PASS** |
| `customer-tenant-approval-e2e.test.js` | `pg-mem` | 11 | 11 | 0 | 0 | 0 | **PASS** |
| `multi-dairy-membership.test.js` | `pg-mem` | 9 | 9 | 0 | 0 | 0 | **PASS** |
| `tenant-database-isolation.test.js` | `pg-mem` | 7 | 7 | 0 | 0 | 0 | **PASS** |
| `dairy-admin-production.test.js` | `pg-mem` | 36 | 36 | 0 | 0 | 0 | **PASS** |
| `roadmap-phase-06-dairy-admin.test.js` | `pg-mem` | 41 | 41 | 0 | 0 | 0 | **PASS** |
| `super-admin-production.test.js` | `pg-mem` | 33 | 33 | 0 | 0 | 0 | **PASS** |
| `clean-architecture.test.js` | Static AST | 9 | 9 | 0 | 0 | 0 | **PASS** |
| **Total (13 Core Suites)** | — | **230** | **230** | **0** | **0** | **0** | **PASS** |

### 2.3 Frontend Workspaces

| Workspace | Runner | Files / Suites | Tests | Pass | Fail | Exit | Status |
|---|---|---:|---:|---:|---:|---:|---|
| `apps/dfarm-customer-app` | Jest | 8/8 | 31 | 31 | 0 | 0 | **PASS** |
| `apps/dfarm-collection-app` | Vitest | 17/17 | 162 | 162 | 0 | 0 | **PASS** |
| `apps/dfarm-dairy-admin` | Vitest | 5/5 | 14 | 14 | 0 | 0 | **PASS** |
| `apps/dfarm-super-admin` | Vitest | 10/10 | 48 | 48 | 0 | 0 | **PASS** |
| **Total (4 Apps)** | — | **40/40** | **255** | **255** | **0** | **0** | **PASS** |

### 2.4 Five Real PostgreSQL 17 Suites Gate Status

| Suite | Default (No PG17) | `REQUIRE_REAL_POSTGRES=1` (No PG17) | Post-Fix Live PG17 Status |
|---|---|---|---|
| `restart03-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **BLOCKED (Awaiting PG17 Host/CI Run)** |
| `restart032-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **BLOCKED (Awaiting PG17 Host/CI Run)** |
| `restart033-real-postgres-repositories.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **BLOCKED (Awaiting PG17 Host/CI Run)** |
| `customer-ledger-accounting.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **BLOCKED (Awaiting PG17 Host/CI Run)** |
| `concurrent-idempotency-financial.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **BLOCKED (Awaiting PG17 Host/CI Run)** |
