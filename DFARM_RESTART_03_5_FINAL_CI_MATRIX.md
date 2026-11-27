# DFARM RESTART-03.5A — Final CI & Regression Matrix

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Latest Verified Public HEAD:** `8eba95427ee2170ee46c02f3a08ffde86a2bde24` (`RESTART-04`; Parent: `9d0568b32e117dc93d8c62389c482b5a77d68f40`)
- **RESTART-03.5A Historical Baseline HEAD:** `9d0568b32e117dc93d8c62389c482b5a77d68f40` (Prior: `805326112c6daf0c902a3abbefc5be1a8f740023`)
- **Overall Classification:** **`RESTART-03` PG17 Gate PASS on `8eba954` (CI `45947088863`) / `RESTART-04` PG17 Gate FAIL on `8eba954` (CI `45947088946`, `users.user_role` fixture mismatch fixed locally in `RESTART-04.1`)** — `DF-003` full-history Gitleaks (`45947088844`, `54` findings across `42` commits) remains OPEN under `RESTART-12`.

---

## 0. Latest GitHub Actions Verified Runs (`8eba95427ee2170ee46c02f3a08ffde86a2bde24`)

| Workflow | Run / Job | PostgreSQL / Scanner | Conclusion | Scope Summary |
|---|---|---|---|---|
| `RESTART-03 PostgreSQL 17 Repository Verification` | `45947088863` | PostgreSQL `17.12` | **`success`** | `RESTART-03` 5-suite real PG17 repository gate passed on HEAD `8eba954`. |
| `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | `45947088946` / `140334160273` | PostgreSQL `17.12` | **`failure`** | Failed with SQLSTATE `42703` (`column "user_role" of relation "users" does not exist`) at `services/backend/tests/restart04-real-postgres-device-sync.test.js:182`; fixture remediated locally in `RESTART-04.1`, awaiting subsequent live PG17 run. |
| `Secret Scanning (Gitleaks)` | `45947088844` | Gitleaks full history | **`failure`** | `54` findings across `42` commits (`DF-003` OPEN under `RESTART-12`; external rotations & approved history rewrite pending operator action). |

---

## 1. Historical GitHub Actions Verified Runs (`9d0568b32e117dc93d8c62389c482b5a77d68f40`)

| Workflow | Run / Job | PostgreSQL / Scanner | Conclusion | Scope Summary |
|---|---|---|---|---|
| `RESTART-03 PostgreSQL 17 Repository Verification` | [`45943003261`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261) / [`140321315106`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261/job/140321315106) | PostgreSQL `17.12` | **`success`** | `build:backend`, `db:validate`, role bootstrap, and all 5 PG17 suites passed (`44` passed, `0` failed, `0` skipped). |
| `Secret Scanning (Gitleaks)` | [`45943003232`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003232) / [`140321315158`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003232/job/140321315158) | Gitleaks full history | **`failure`** | `54` historical findings across `41` commits; no finding record reported for current HEAD `9d0568b` (`DF-003` OPEN under `RESTART-12`). |
| *(Prior baseline `8053261`)* `RESTART-03 PostgreSQL 17` | [`45938275998`](https://github.com/Swiftify0099/DFarm/actions/runs/45938275998) / [`140306423963`](https://github.com/Swiftify0099/DFarm/actions/runs/45938275998/job/140306423963) | PostgreSQL `17.12` | **`failure`** | Superseded by `9d0568b` / Run `45943003261`. |

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

### 2.4 Five Real PostgreSQL 17 Suites Gate Status (`9d0568b` — CI Run `45943003261`)

| Suite | Default (No Local PG17) | `REQUIRE_REAL_POSTGRES=1` (No Local PG17) | Live PG `17.12` CI Status (`45943003261`) |
|---|---|---|---|
| `restart03-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **PASS (CI `45943003261`: 5/5 suites, 44 passed, 0 failed, 0 skipped)** |
| `restart032-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **PASS (CI `45943003261`)** |
| `restart033-real-postgres-repositories.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **PASS (CI `45943003261`)** |
| `customer-ledger-accounting.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **PASS (CI `45943003261`)** |
| `concurrent-idempotency-financial.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **PASS (CI `45943003261`)** |
