# DFARM RESTART-03.6 — Final CI & Regression Matrix

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Latest Verified Public HEAD:** `db8b73296247a8dd800e7276f12eda4a68c2ff4b` (Parent: `8eba95427ee2170ee46c02f3a08ffde86a2bde24`)
- **RESTART-03.5A Historical Baseline HEAD:** `9d0568b32e117dc93d8c62389c482b5a77d68f40` (Prior: `805326112c6daf0c902a3abbefc5be1a8f740023`)
- **Overall Classification:** **`RESTART-04` PG17 Gate PASS on `db8b732` (CI `45968244756`, PG `17.12`, `8/8` passed, `0` failed, `0` skipped) / `RESTART-03` PG17 Gate FAIL on `db8b732` (CI `45968244699` / Job `140402037268` — `concurrent-idempotency-financial.test.js` teardown `uncaughtException`; remediated locally in `RESTART-03.6`, awaiting subsequent live PG17 CI run)** — `DF-003` full-history Gitleaks (`45968244743`, `54` findings across `43` commits) remains OPEN under `RESTART-12`.

---

## 0. Latest GitHub Actions Verified Runs (`db8b73296247a8dd800e7276f12eda4a68c2ff4b`)

| Workflow | Run / Job | PostgreSQL / Scanner | Conclusion | Scope Summary |
|---|---|---|---|---|
| `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | `45968244756` | PostgreSQL `17.12` | **`success`** | `RESTART-04` real PG17 device auth & sync isolation gate passed: **`8` passed, `0` failed, `0` skipped** (zero `pg-mem` fallback). |
| `RESTART-03 PostgreSQL 17 Repository Verification` | `45968244699` / `140402037268` | PostgreSQL `17.12` | **`failure`** | Tests 1–3 of `services/backend/tests/concurrent-idempotency-financial.test.js` passed, but outer suite failed in teardown with `uncaughtException: terminating connection due to administrator command`. 5-suite gate is **NOT** green on `db8b732`. Teardown remediated locally in `RESTART-03.6`; awaiting new PG17 CI run. |
| `Secret Scanning (Gitleaks)` | `45968244743` | Gitleaks full history | **`failure`** | `54` historical findings across `43` commits (`DF-003` OPEN under `RESTART-12`; external credential rotations and approved history rewrite remain operator-controlled). |

---

## 1. Historical GitHub Actions Verified Runs (`8eba954` & `9d0568b`)

| Workflow | Run / Job | PostgreSQL / Scanner | Conclusion | Scope Summary |
|---|---|---|---|---|
| *(Prior `8eba954`)* `RESTART-03 PostgreSQL 17 Repository Verification` | `45947088863` | PostgreSQL `17.12` | **`success`** | `RESTART-03` 5-suite real PG17 repository gate passed on `8eba954` (superseded by `db8b732` / `45968244699`). |
| *(Prior `8eba954`)* `RESTART-04 PostgreSQL 17 Device Sync & Security Gate` | `45947088946` / `140334160273` | PostgreSQL `17.12` | **`failure`** | Pre-`db8b732` failure (`users.user_role` SQLSTATE `42703`); fixed in `db8b732` and passed in `45968244756`. |
| *(Prior `8eba954`)* `Secret Scanning (Gitleaks)` | `45947088844` | Gitleaks full history | **`failure`** | `54` findings across `42` commits (superseded by `45968244743`). |
| *(Prior `9d0568b`)* `RESTART-03 PostgreSQL 17 Repository Verification` | [`45943003261`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261) / [`140321315106`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261/job/140321315106) | PostgreSQL `17.12` | **`success`** | `build:backend`, `db:validate`, role bootstrap, and all 5 PG17 suites passed (`44` passed, `0` failed, `0` skipped). |
| *(Prior `9d0568b`)* `Secret Scanning (Gitleaks)` | [`45943003232`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003232) / [`140321315158`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003232/job/140321315158) | Gitleaks full history | **`failure`** | `54` historical findings across `41` commits; no finding record reported for `9d0568b` (`DF-003` OPEN under `RESTART-12`). |
| *(Prior `8053261`)* `RESTART-03 PostgreSQL 17` | [`45938275998`](https://github.com/Swiftify0099/DFarm/actions/runs/45938275998) / [`140306423963`](https://github.com/Swiftify0099/DFarm/actions/runs/45938275998/job/140306423963) | PostgreSQL `17.12` | **`failure`** | Superseded by `9d0568b` / Run `45943003261`. |

---

## 2. Local Post-Edit Verification Matrix (`RESTART-03.6`)

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
| `offline-sync-22-scenarios.test.js` | `pg-mem` | 23 | 23 | 0 | 0 | 0 | **PASS** |
| `restart04-device-auth-and-route-security.test.js` | `pg-mem` | 5 | 5 | 0 | 0 | 0 | **PASS** |
| **Total (15 Backend Offline Suites)** | — | **258** | **258** | **0** | **0** | **0** | **PASS** |

### 2.3 Frontend Workspaces *(Prior Baseline; Unchanged in `RESTART-03.6`)*

| Workspace | Runner | Files / Suites | Tests | Pass | Fail | Exit | Status |
|---|---|---:|---:|---:|---:|---:|---|
| `apps/dfarm-customer-app` | Jest | 8/8 | 31 | 31 | 0 | 0 | **BASELINE PASS** |
| `apps/dfarm-collection-app` | Vitest | 17/17 | 162 | 162 | 0 | 0 | **BASELINE PASS** |
| `apps/dfarm-dairy-admin` | Vitest | 5/5 | 14 | 14 | 0 | 0 | **BASELINE PASS** |
| `apps/dfarm-super-admin` | Vitest | 10/10 | 48 | 48 | 0 | 0 | **BASELINE PASS** |
| **Total (4 Apps)** | — | **40/40** | **255** | **255** | **0** | **0** | **BASELINE PASS** |

### 2.4 Real PostgreSQL 17 Gates Status (`db8b732` + Local `RESTART-03.6`)

| Suite | Default (No Local PG17) | `REQUIRE_REAL_POSTGRES=1` (No Local PG17) | Latest CI Status (`db8b732`) |
|---|---|---|---|
| `restart03-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **Prior `8eba954` / `9d0568b` PASS; `db8b732` Run `45968244699` overall GATE FAIL** |
| `restart032-real-postgres.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **Prior `8eba954` / `9d0568b` PASS; `db8b732` Run `45968244699` overall GATE FAIL** |
| `restart033-real-postgres-repositories.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **Prior `8eba954` / `9d0568b` PASS; `db8b732` Run `45968244699` overall GATE FAIL** |
| `customer-ledger-accounting.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **Prior `8eba954` / `9d0568b` PASS; `db8b732` Run `45968244699` overall GATE FAIL** |
| `concurrent-idempotency-financial.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **FAIL (`db8b732` Run `45968244699` / Job `140402037268`: tests 1–3 passed, teardown `uncaughtException`; remediated locally in `RESTART-03.6`, awaiting new PG17 CI run)** |
| `restart04-real-postgres-device-sync.test.js` | `tests=1 pass=0 fail=0 skipped=1 exit=0` | `tests=1 pass=0 fail=1 skipped=0 exit=1` | **PASS (`db8b732` Run `45968244756`, PG `17.12`: `8` passed, `0` failed, `0` skipped)** |
