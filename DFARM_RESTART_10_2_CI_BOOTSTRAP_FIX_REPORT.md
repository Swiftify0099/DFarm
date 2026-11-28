# DFARM — RESTART-10.2 PostgreSQL 17 CI Bootstrap Fix & Remote Verification Reconciliation Report

**Task:** `RESTART-10.2` (`DF-022` + `DF-024` CI Bootstrap Remediation & Remote Reconciliation)  
**Repository:** `Swiftify0099/DFarm`  
**Branch:** `fix/cloudflare-pages-production-deploy`  
**Current Remote & Local HEAD:** `2a57b0de2225ea080eba005cc74fe7c8c8d40609`  
**RESTART-10.1 Baseline:** `36a4a5092be3a4458d74ce2255d7f1bbca9181f5`  
**Failed GitHub Actions Run (`2a57b0d`):** `46123080053` (Job `140912227936`)  
**Classification:** **`OPEN / PARTIAL`** *(CI workflow preflight defect fixed locally and all offline builds/unit/regression/fail-closed checks verified; live two-tenant PostgreSQL `17.12` GitHub Actions execution awaits operator commit/push of the `RESTART-10.2` workflow fix because Docker Desktop is stopped and PostgreSQL 17 is absent locally)*

---

## 1. Exact Root Cause

### 1.1 Confirmed Failure in GitHub Actions Run `46123080053`
- **Workflow / Job / Step:** `.github/workflows/dfarm-restart10-postgres17.yml` → Job `140912227936` (`Real PostgreSQL 17 Union Bank Two-Tenant Financial Isolation Gate`) → Step 6 (`Verify PostgreSQL 17 connectivity & server version`).
- **Exact Failure:** `ERR_MODULE_NOT_FOUND: Cannot find package 'pg' imported from [eval]`.
- **Root Cause:** The pre-install health check executed `node -e "import('pg').then(...)"` **before** `npm ci` had installed `node_modules/`. Although the `postgres:17-alpine` service container started cleanly and `psql -c "SELECT version();"` executed, Node.js could not resolve the uninstalled `pg` npm package from `[eval]`, aborting the workflow prior to `npm ci`, builds, `db:validate`, `db:test`, PG17 role bootstrap, and `node scripts/ci-run-restart10-pg17.js`.

### 1.2 Secondary CI Workflow Defect Identified During Inspection
- In `.github/workflows/dfarm-restart10-postgres17.yml`, job-level `env:` set `TEST_REAL_POSTGRES: "1"` and `DATABASE_URL: postgresql://postgres:postgres_ci_password@127.0.0.1:5432/dfarm_central` while running `npm run db:test` **before** `node scripts/ci-pg17-bootstrap.js`.
- `npm run db:test` executes [`packages/database/tests/real-postgres-verification.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/tests/real-postgres-verification.test.js) whenever `process.env.TEST_REAL_POSTGRES` is truthy, connecting to `DATABASE_URL` (`dfarm_central`) and asserting `res.rows.length >= 43` public tables plus Supabase roles and `001..010` schema. Because `dfarm_central` is an empty unmigrated database prior to PG17 role bootstrap and two-tenant test provisioning, inheriting `TEST_REAL_POSTGRES: "1"` during `npm run db:test` would fail immediately after fixing the `psql` preflight check.
- Matching the passing `RESTART-09` workflow ([`.github/workflows/dfarm-restart09-postgres17.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart09-postgres17.yml), Run `46115119745` and Run `46123080092`), `TEST_REAL_POSTGRES: ""` is now scoped solely to the `npm run db:test` step, while job-level `REQUIRE_REAL_POSTGRES: "1"`, `TEST_REAL_POSTGRES: "1"`, and [`scripts/ci-run-restart10-pg17.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-restart10-pg17.js) enforce real PostgreSQL 17 and zero skips on the RESTART-10 integration gate.

### 1.3 Inspection Finding Flagged in Integration Test (Not Modified in `RESTART-10.2`)
- Per `RESTART-10.2` scope, no financial implementation or test files were altered. However, source inspection of [`services/backend/tests/restart10-union-bank-tenant-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart10-union-bank-tenant-isolation.test.js#L548-L639) vs. [`#L1331`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart10-union-bank-tenant-isolation.test.js#L1331) identified that `controlPlaneAdapter.query` appends every central query (including legitimate `SELECT m.*, o.status AS organization_status FROM dairy_database_mappings` lookups from `TenantDatabaseManager.resolveTenantMapping`) into `centralQueries`. While Group A/B filters `centralQueries` into `financialCtrlQueries`, Group L line `1331` currently asserts `assert.equal(centralQueries.length, 0, 'Central control plane must receive zero financial queries')`, which is expected to trip on the non-empty `dairy_database_mappings` routing entries once the CI run reaches Group L unless filtered for operational/financial tables.

---

## 2. Files Changed

| File | Change Summary |
|---|---|
| [`.github/workflows/dfarm-restart10-postgres17.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart10-postgres17.yml) | Replaced pre-install `node -e "import('pg')"` with fail-closed `psql` CLI `SHOW server_version` major-version `17` check; separated `npm run db:validate` and `npm run db:test` steps matching the 1–10 workflow order; scoped `TEST_REAL_POSTGRES: ""` solely to `npm run db:test` while preserving `REQUIRE_REAL_POSTGRES=1`, `TEST_REAL_POSTGRES=1`, and zero-skip gate enforcement. |
| [`DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md) | Updated current public remote/local HEAD to `2a57b0de2225ea080eba005cc74fe7c8c8d40609`, recorded `36a4a5092be3a4458d74ce2255d7f1bbca9181f5` under previous HEADs, preserved `RESTART-09` (`DF-021`) verified status, recorded Run `46123080053` preflight failure and sibling `2a57b0d` CI runs, kept `DF-022` `OPEN / PARTIAL` and `DF-024` `PARTIAL` without duplicating issue rows, and updated `RESTART-10` status. |
| [`DFARM_RESTART_10_UNION_BANK_TENANT_ISOLATION_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_10_UNION_BANK_TENANT_ISOLATION_REPORT.md) | Updated baseline vs. current remote HEAD (`2a57b0de2225ea080eba005cc74fe7c8c8d40609`), removed stale pre-push phrasing, recorded Run `46123080053` preflight failure and `2a57b0d` sibling workflow outcomes, updated local offline verification table, and preserved `DF-022` / `DF-024` blocker distinctions. |
| [`DFARM_RESTART_10_2_CI_BOOTSTRAP_FIX_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_10_2_CI_BOOTSTRAP_FIX_REPORT.md) | Created this `RESTART-10.2` verification & reconciliation report. |

*(Zero `RESTART-10.1` production banking/payment/migration files or test files were modified.)*

---

## 3. Workflow Changes

[`.github/workflows/dfarm-restart10-postgres17.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart10-postgres17.yml) preserves the exact required 10-step order:
1. `Checkout repository` (`actions/checkout@v4`)
2. `Set up Node.js 22` (`actions/setup-node@v4`, `node-version: "22"`, `cache: npm`)
3. `Verify Node.js and npm versions` (`Node >= 22`, `npm >= 10`)
4. `Verify PostgreSQL 17 connectivity & server version` — uses `psql` CLI (`SELECT version();` + `SHOW server_version` with `ON_ERROR_STOP=1`) and fails closed unless `${PG_VERSION%%.*}` equals `"17"`, with zero `node_modules` dependency.
5. `Install workspace dependencies` (`npm ci`)
6. `Build database package & backend workspace` (`npm run build -w @dfarm/database` followed by `npm run build:backend`)
7. `Validate database migration catalog & schema` (`npm run db:validate`)
8. `Run database package catalog & runtime tests` (`npm run db:test` with step-level `env: TEST_REAL_POSTGRES: ""` prior to cluster role bootstrap)
9. `Bootstrap disposable PostgreSQL 17 cluster auth roles` (`node scripts/ci-pg17-bootstrap.js`)
10. `Execute RESTART-10 Union Bank PostgreSQL 17 Isolation Gate (zero skips, fail-closed)` (`node scripts/ci-run-restart10-pg17.js` with `REQUIRE_REAL_POSTGRES: "1"`, `TEST_REAL_POSTGRES: "1"`, `DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS: "1"`)

---

## 4. Local Test Results

Executed locally on Node `v22.20.0` / npm `10.9.3` after the workflow correction. **Local offline verification does not prove two-tenant PostgreSQL 17 isolation** because `com.docker.service` is stopped and PostgreSQL 17 is absent on this host.

| Command / Suite | Pass | Fail | Skip | Exit Code | Notes |
|---|---:|---:|---:|---:|---|
| `npm ci` | — | — | — | `0` | `1,385` packages added, `1,404` audited |
| `npm run build -w @dfarm/database` | — | — | — | `0` | Clean TypeScript build (`tsc`) |
| `npm run build:backend` | — | — | — | `0` | Clean build across `shared-types`, `shared-validation`, `database`, `backend` |
| `npm run db:validate` | `25` | `0` | `0` | `0` | `migration-catalog` (`12`) + `schema-validation` (`13`) |
| `npm run db:test` *(default offline env)* | `34` | `0` | `0` *(+1 suite `# SKIP`)* | `0` | `database-runtime` (`9`), `migration-catalog` (`12`), `schema-validation` (`13`); `real-postgres-verification` suite `# SKIP` |
| `node --test --test-reporter=tap services/backend/tests/restart10-union-bank-tenant-isolation-unit.test.js` | `10` | `0` | `0` | `0` | All 10 RESTART-10 unit/contract & static checks pass |
| `node scripts/ci-run-offline-lifecycle-suite.js` | `22` | `0` | `0` | `0` | `restart037-pool-lifecycle.test.js` (`22/22`) |
| `restart09-outbox-isolation-unit.test.js` | `8` | `0` | `0` | `0` | Offline regression suite |
| `restart03-tenant-isolation-and-ownership.test.js` | `18` | `0` | `0` | `0` | Offline regression suite |
| `restart032-operational-repository-isolation.test.js` | `17` | `0` | `0` | `0` | Offline regression suite |
| `restart04-device-auth-and-route-security.test.js` | `5` | `0` | `0` | `0` | Offline regression suite |
| `restart05-migration-reconciliation.test.js` | `10` | `0` | `0` | `0` | Offline regression suite |
| `restart051-migration-safety.test.js` | `9` | `0` | `0` | `0` | Offline regression suite |
| `clean-architecture.test.js` | `9` | `0` | `0` | `0` | Offline regression suite |
| `restart02-auth-security-remediation.test.js` *(isolated `127.0.0.1:59999/offline_test`)* | `9` | `0` | `0` | `0` | Offline regression suite |
| `restart021-auth-session-integrity.test.js` *(isolated `127.0.0.1:59999/offline_test`)* | `7` | `0` | `0` | `0` | Offline regression suite |
| `offline-sync-22-scenarios.test.js` | `23` | `0` | `0` | `0` | Offline regression suite |
| `collection-kiosk-production.test.js` *(isolated `127.0.0.1:59999/offline_test`)* | `24` | `0` | `0` | `0` | Offline regression suite |
| `dairy-admin-production.test.js` *(isolated `127.0.0.1:59999/offline_test`)* | `36` | `0` | `0` | `0` | Offline regression suite |
| Fail-closed `REQUIRE_REAL_POSTGRES=1` `restart10-union-bank-tenant-isolation.test.js` (`TEST_POSTGRES_URL=""`) | `0` | `1` | `0` | `1` | Expected fail-closed behavior (`ERR_ASSERTION`) |
| Fail-closed `node scripts/ci-run-restart10-pg17.js` (`TEST_POSTGRES_URL=""`) | `0` | `0` | `0` | `1` | Expected fail-closed exit (`FATAL: TEST_POSTGRES_URL is not set`) |

*(Total offline regression batch across the 12 regression suites: **`175/175 PASS`**, `0` failures, `0` skips, exit `0`.)*

---

## 5. GitHub Actions Verification Status (`2a57b0d` & Pending Retry)

Committed & pushed SHA `2a57b0de2225ea080eba005cc74fe7c8c8d40609` triggered:
- **RESTART-03:** Run `46123079973` — **`SUCCESS`**
- **RESTART-04:** Run `46123080048` — **`SUCCESS`**
- **RESTART-05:** Run `46123080018` — **`SUCCESS`**
- **RESTART-09:** Run `46123080092` — **`SUCCESS`** (preserving verified `RESTART-09` Run `46115119745` on `36a4a50`)
- **RESTART-10:** Run `46123080053` (Job `140912227936`) — **`FAILURE`** at Step 6 (`Verify PostgreSQL 17 connectivity & server version`: `ERR_MODULE_NOT_FOUND: Cannot find package 'pg' imported from [eval]`)
- **Secret Scanning (Gitleaks):** Run `46123080046` — **`FAILURE`** (separate security workstream)

**Retry Run on `RESTART-10.2` Workflow Fix:** **NOT YET EXECUTED** — no commit/push was performed per Git safety rules; the new RESTART-10 PostgreSQL `17.12` run ID, tested commit SHA, job logs, TAP totals, and server version must be captured after the operator commits and pushes these changes.

---

## 6. Groups A–L Individual Results

Because GitHub Actions Run `46123080053` aborted at Step 6 before `npm ci` and PostgreSQL 17 is absent locally, **Groups A–L have NOT been executed yet against real PostgreSQL 17.12**:

| Group | Scope | Status |
|---|---|---|
| Group A & B | Two-tenant physical routing, `SUPER_ADMIN` target enforcement & zero control-plane financial SQL | **NOT EXECUTED (Pending PG17 CI retry)** |
| Group C1 | Single-DB atomic `PAID` settlement on Tenant A & `SUPER_ADMIN` reconciliation on Tenant B with post-commit notify tolerance | **NOT EXECUTED (Pending PG17 CI retry)** |
| Group C2 | Injected mid-TX PostgreSQL failure (`XX000`) full batch rollback & zero notifications | **NOT EXECUTED (Pending PG17 CI retry)** |
| Group D | `FAILED`, `FAILED` replay idempotency, zero/bad-paise `AMOUNT_MISMATCH`, `UNKNOWN` & `AMBIGUOUS_REFERENCE` | **NOT EXECUTED (Pending PG17 CI retry)** |
| Group E & F | `REVERSED` single credit, replay idempotency, conflicting reversal rejection, `FAILED` reversal block, `PAID` replay & UTR conflict | **NOT EXECUTED (Pending PG17 CI retry)** |
| Group G | Concurrent reconciliation calls settle & debit once without deadlock | **NOT EXECUTED (Pending PG17 CI retry)** |
| Group H | Real PostgreSQL RLS (`NOSUPERUSER NOBYPASSRLS`) enforcing `app.current_organization_id` end-to-end | **NOT EXECUTED (Pending PG17 CI retry)** |
| Group I | Required SQL routines & payment/reconciliation tables present in both Tenant A and Tenant B DBs | **NOT EXECUTED (Pending PG17 CI retry)** |
| Group J | `UnionBankSubmissionService` two-phase, `DF-024` fail-closed & `UnionBankStatusInquiryService` end-to-end | **NOT EXECUTED (Pending PG17 CI retry)** |
| Group K | Generic `ReconciliationService`, signed webhook, manual `resolveRecord` & `PayoutService`/`BatchService` tenant isolation | **NOT EXECUTED (Pending PG17 CI retry)** |
| Group L | Pooled connection `app.current_organization_id` reset after `COMMIT` and `ROLLBACK` *(inspection flagged line `1331` `centralQueries.length === 0`)* | **NOT EXECUTED (Pending PG17 CI retry)** |

---

## 7. Failures and Skips

- **CI Run `46123080053`:** `1` failed preflight step (`Verify PostgreSQL 17 connectivity & server version`), `5` skipped downstream steps (including `ci-run-restart10-pg17.js`).
- **Local Offline Verification:**
  - `npm run db:test` cleanly marked `1` suite `# SKIP` (`DFarm Real PostgreSQL Database & RLS Security Verification Suite`) because local PG17 is absent (`34/34` active tests passed, `0` failed, exit `0`).
  - `restart10-union-bank-tenant-isolation.test.js` (`REQUIRE_REAL_POSTGRES=1`, `TEST_POSTGRES_URL=""`) failed closed (`1` failed, `0` passed, `0` skipped, exit `1`) and `scripts/ci-run-restart10-pg17.js` (`TEST_POSTGRES_URL=""`) failed closed (exit `1`), as required.
  - All `10/10` RESTART-10 unit tests, `25/25` `db:validate` tests, `22/22` offline lifecycle tests, and `175/175` tests across the 12 offline regression suites passed with `0` failures and `0` skips.

---

## 8. `DF-022` and `DF-024` Closure Status

- **`DF-022` (`P0` Financial Reconciliation / Split-Brain):** **`OPEN / PARTIAL`** — Cannot be declared closed or complete until `.github/workflows/dfarm-restart10-postgres17.yml` passes end-to-end against real two-tenant PostgreSQL `17.12` across Groups A–L with `0` failures, `0` skips, and exit code `0`.
- **`DF-024` (`P1` Banking / Union Bank Adapter):** **`PARTIAL`** — Code-level fail-closed debit-account validation, removal of all `'00000000000000'`/`'000000000000'` and global env fallbacks, and masked logging/error handling are verified offline, while live Union Bank transfers remain disabled pending external credentials/certification and Group J awaits the PG17 CI pass.

---

## 9. Remaining External Bank-Certification Blockers

1. **Dairy-Specific Corporate Banking Credentials:** Valid Union Bank corporate credentials (`UNION_BANK_CORP_ID`, `UNION_BANK_CLIENT_ID`, `UNION_BANK_CLIENT_SECRET`, `UNION_BANK_BASE_URL`) and per-dairy authorized corporate debit account configuration (`organizations.bank_debit_account_encrypted`).
2. **Union Bank Host-to-Host Gateway Certification:** Production gateway approval required to lift the fail-closed `502 UNION_BANK_GATEWAY_CERTIFICATION_REQUIRED` gate (`UnionBankApiClient.ts`); **live Union Bank transfers remain disabled**.

---

## 10. Git Branch, HEAD, and Worktree Status

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Local & Remote HEAD (`origin/fix/cloudflare-pages-production-deploy`):** `2a57b0de2225ea080eba005cc74fe7c8c8d40609`
- **Worktree State:** Uncommitted `RESTART-10.2` changes only (`.github/workflows/dfarm-restart10-postgres17.yml`, `DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`, `DFARM_RESTART_10_UNION_BANK_TENANT_ISOLATION_REPORT.md`, and `DFARM_RESTART_10_2_CI_BOOTSTRAP_FIX_REPORT.md`); zero commits, pushes, history rewrites, or `.temp` modifications executed.
