# DFARM — RESTART-10.3 PostgreSQL 17 Test Fixture Schema Alignment & Group L Isolation Assertion Fix Report

**Task:** `RESTART-10.3` (`DF-022` + `DF-024` PostgreSQL 17 Test Fixture & Group L Assertion Remediation)  
**Repository:** `Swiftify0099/DFarm`  
**Branch:** `fix/cloudflare-pages-production-deploy`  
**Verified Starting Point / Current Public Remote HEAD (`origin/fix/cloudflare-pages-production-deploy`):** `af578d8624099c8ef020643de5c3d135b75a4a69` (`feat: add RESTART-10 PostgreSQL 17 Union Bank CI workflow and reports`)  
**Previous Public Remote HEADs:** `2a57b0de2225ea080eba005cc74fe7c8c8d40609` (`RESTART-10.1`), `36a4a5092be3a4458d74ce2255d7f1bbca9181f5` (`RESTART-09`)  
**Local Worktree HEAD:** `af578d8624099c8ef020643de5c3d135b75a4a69` *(with uncommitted `RESTART-10.3` edits in [`services/backend/tests/restart10-union-bank-tenant-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart10-union-bank-tenant-isolation.test.js) and updated `RESTART-10` / `RESTART-01` documentation; zero commits or pushes executed)*  
**Previous CI Run (`af578d8`):** GitHub Actions Run **`46125434340`** — **`FAILURE`**  
**Classification:** **`OPEN / PARTIAL`** *(Test fixture schema mismatch, Group L false assertion, and early-abort RLS-role cleanup noise are fixed locally and verified offline; live two-tenant PostgreSQL `17.12` execution awaits CI retry and remediation of an out-of-scope production SQL column mismatch uncovered during inspection)*

---

## 1. CI Run `46125434340` Findings on `af578d8624099c8ef020643de5c3d135b75a4a69`

### 1.1 Workflow Stages That Passed
On pushed commit `af578d8624099c8ef020643de5c3d135b75a4a69`, [`.github/workflows/dfarm-restart10-postgres17.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart10-postgres17.yml) resolved the `RESTART-10.2` pre-install failure and completed:
1. PostgreSQL 17 `psql` connectivity & `SHOW server_version` major-version preflight check (`PASS`).
2. `npm ci` workspace dependency installation (`PASS`).
3. Database package build (`npm run build -w @dfarm/database`) and backend workspace build (`npm run build:backend`) (`PASS`).
4. `npm run db:validate` migration catalog & schema validation (`PASS`).
5. Pre-bootstrap `npm run db:test` with `TEST_REAL_POSTGRES: ""` (`PASS`).
6. `node scripts/ci-pg17-bootstrap.js` PG17 role bootstrap (`PASS`).
7. `RESTART-10` unit/contract suite [`services/backend/tests/restart10-union-bank-tenant-isolation-unit.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart10-union-bank-tenant-isolation-unit.test.js): **`10/10 PASS`**, `0` failures, `0` skips.

### 1.2 Exposed Two-Tenant Integration Failures
- **Primary Schema Mismatch Failure (Before Groups A–L):** [`services/backend/tests/restart10-union-bank-tenant-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart10-union-bank-tenant-isolation.test.js) aborted during `seedTenantDairy()` setup before Groups A–L could execute because the `INSERT INTO customers` statement referenced non-existent column `customers.bank_account_mask`.
  - Actual migration schema verification:
    - [`supabase/migrations/004_customer_identity.sql`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/004_customer_identity.sql) defines `customers` with `bank_name`, `bank_account_number`, `bank_ifsc_code`, and `bank_account_holder_name` — **no `bank_account_mask` column**.
    - [`supabase/migrations/021_customer_payouts_batches_and_reconciliation.sql`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/021_customer_payouts_batches_and_reconciliation.sql) defines `bank_account_mask` on `customer_payouts` and `payment_batch_items`, not `customers`.
    - [`supabase/migrations/042_union_bank_farmer_payout_and_settlement_system.sql`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/042_union_bank_farmer_payout_and_settlement_system.sql) adds `beneficiary_status`, `bank_verification_status`, `bank_verified_at`, `bank_verified_by`, and `bank_verification_notes` to `customers` — no `bank_account_mask`.
    - [`supabase/migrations/048_union_bank_reconciliation_idempotency_hardening.sql`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/048_union_bank_reconciliation_idempotency_hardening.sql) does not add `bank_account_mask` to `customers`.
- **Secondary Group J Customer Fixture Defect:** The second `INSERT INTO customers` inside Group J (`UnionBankSubmissionService` / `UnionBankStatusInquiryService`) also included non-existent `bank_account_mask`.
- **Secondary Cleanup Log Noise:** Because setup aborted before Group H created `dfarm_r10_app_<suffix>`, `t.after` cleanup unconditionally ran `REVOKE ... FROM "dfarm_r10_app_..."` and `DROP ROLE IF EXISTS "dfarm_r10_app_..."`, producing secondary PostgreSQL log messages (`role "dfarm_r10_app_..." does not exist`) while blanket `.catch(() => {})` calls risked hiding unrelated cleanup failures.
- **Confirmed Group L False Assertion:** Group L ended with `assert.equal(centralQueries.length, 0, 'Central control plane must receive zero financial queries')`, even though Group L calls `tenantDbManager.getStrictTenantDb(orgA, { bypassCache: true, strictOperational: true })`, which legitimately invokes `resolveTenantMapping()` and records a control-plane `dairy_database_mappings` lookup in `centralQueries`.

---

## 2. Exact Fixes Applied (`RESTART-10.3`)

No production migrations or production schema files were altered. [`.github/workflows/dfarm-restart10-postgres17.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart10-postgres17.yml) and [`scripts/ci-run-restart10-pg17.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-restart10-pg17.js) were preserved untouched (`psql` PG17 check, Node `>=22` / npm `>=10`, `npm ci`, builds, `db:validate`, pre-bootstrap `db:test` with `TEST_REAL_POSTGRES: ""`, `ci-pg17-bootstrap.js`, `REQUIRE_REAL_POSTGRES=1`, `TEST_REAL_POSTGRES=1`, zero-skip gate).

| Area | Change Summary in [`services/backend/tests/restart10-union-bank-tenant-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart10-union-bank-tenant-isolation.test.js) |
|---|---|
| **Customer Fixture 1 (`seedTenantDairy()`)** | Removed `bank_account_mask`, placeholder `$7`, and parameter `f.accountMask \|\| 'XXXX9001'` from `INSERT INTO customers`; kept valid `bank_ifsc_code` (`'UBIN0530789'`) and left `customers.bank_account_number` null (never copying `'XXXX9001'` into `bank_account_number`). Preserved `customer_payouts.bank_account_mask`, `customer_payouts.bank_ifsc`, `payment_batch_items.bank_account_mask`, and `payment_batch_items.bank_ifsc`. |
| **Customer Fixture 2 (Group J)** | Removed `bank_account_mask` and `'XXXX-XXXX-5566'` from Group J's `INSERT INTO customers` while preserving `bank_account_number` (`'112233445566'`), `bank_ifsc_code` (`'UBIN0530789'`), `beneficiary_status` (`'ACTIVE'`), and `bank_verification_status` (`'VERIFIED'`). Preserved `bank_account_mask` and `bank_ifsc` on `customer_payouts` and `payment_batch_items`. |
| **Group L Isolation Assertion** | Replaced `assert.equal(centralQueries.length, 0, ...)` with the financial-table filter `groupLCentralFinancialQueries` checking `/\b(payment_batches\|payment_batch_items\|customer_payouts\|customer_ledger_accounts\|ledger_transactions\|ledger_entries\|payment_reconciliation_records\|payment_adjustments)\b/i` and asserting `groupLCentralFinancialQueries.length === 0`, while keeping `bypassCache: true`, `getAllTenantDbsCalled === false`, and `permissiveGetTenantDbCalled === false`. |
| **PostgreSQL Cleanup Hardening** | Replaced unconditional `t.after` `.catch(() => {})` swallows with `try/catch/finally` preserving `primaryError` via `AggregateError`; tracked `createdDatabases`, `faultTriggerCreated`, `rlsRoleAttempted`, and `rlsRoleCreated` (plus `pg_roles` check only when `rlsRoleAttempted` is true) so `REVOKE`/`DROP ROLE` are skipped cleanly if setup aborted before Group H; added `attachPoolErrorGuard`, `waitForDbIdle`, and `db.close()` cleanup without suppressing unrelated DB/cleanup errors. |

**Static Schema Verification Confirmation:** Checked every `INSERT INTO customers` in [`services/backend/tests/restart10-union-bank-tenant-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart10-union-bank-tenant-isolation.test.js) (`2` statements total: `seedTenantDairy` with `9` columns / `9` values / `$1..$6`; Group J with `12` columns / `12` values / `$1..$4`). Zero invalid customer columns and zero `customers.bank_account_mask` references remain in the test file.

---

## 3. Out-of-Scope Production SQL Schema Mismatch Uncovered During Audit

During cross-referencing of the migration schema against compiled payment services, two production TypeScript SQL sites (outside `RESTART-10.3` test-fixture scope and preserved untouched per task boundaries) were found to reference non-existent `customers.bank_account_mask`:

1. [`services/backend/src/integrations/banking/union-bank/UnionBankReconciliationService.ts#L246`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/integrations/banking/union-bank/UnionBankReconciliationService.ts#L246) selects `c.bank_account_mask` from `customers c` inside `reconcileBatchWithBankData()` (instead of reading `COALESCE(bi.bank_account_mask, cp.bank_account_mask) AS bank_account_mask` from `payment_batch_items` / `customer_payouts`).
2. [`services/backend/src/modules/payments/batch.service.ts#L718-L743`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/payments/batch.service.ts#L718-L743) reads `cust.bank_account_mask` and runs `UPDATE customers SET ... bank_account_mask = $3 ...` inside `updateBeneficiaryBankDetails()`.

**CI Impact:** Once `seedTenantDairy()` succeeds on PostgreSQL 17, Group C1's call to `UnionBankReconciliationService.reconcileBatchWithBankData(...)` will fail with PostgreSQL `42703` (`column c.bank_account_mask does not exist`) until a targeted production fix (`RESTART-10.4`) updates those two queries and rebuilds `dist/`.

---

## 4. Exact Verification Results

### 4.1 Local Verification (`Node v22.20.0`, `npm 10.9.3`)
| Check / Command | Pass | Fail | Skip | Exit Code | Details |
|---|---:|---:|---:|---:|---|
| `node --check services/backend/tests/restart10-union-bank-tenant-isolation.test.js` | — | — | — | `0` | Clean ESM syntax verification |
| Static `INSERT INTO customers` schema compatibility script | `2` | `0` | `0` | `0` | Both statements match `004`/`011`/`037`/`042`; zero `customers.bank_account_mask` |
| `npm run build -w @dfarm/database` | — | — | — | `0` | Clean `@dfarm/database` TypeScript build |
| `npm run build:backend` | — | — | — | `0` | Clean build across `shared-types`, `shared-validation`, `database`, `backend` |
| `npm run db:validate` | `25` | `0` | `0` | `0` | `migration-catalog` (`12/12`) + `schema-validation` (`13/13`) |
| `npm run db:test` *(default offline env)* | `34` | `0` | `0` *(+1 suite `# SKIP`)* | `0` | `database-runtime` (`9`), `migration-catalog` (`12`), `schema-validation` (`13`); `real-postgres-verification` `# SKIP` |
| `node --test --test-reporter=tap services/backend/tests/restart10-union-bank-tenant-isolation-unit.test.js` | `10` | `0` | `0` | `0` | RESTART-10 unit & contract suite (`10/10`) |
| `node scripts/ci-run-offline-lifecycle-suite.js` | `22` | `0` | `0` | `0` | `restart037-pool-lifecycle.test.js` (`22/22`) |
| `12`-suite offline regression batch (`NODE_ENV=test`, isolated `127.0.0.1:59999/offline_test` for DB suites) | `175` | `0` | `0` | `0` | `restart09-outbox-isolation-unit` (`8`), `restart03` (`18`), `restart032` (`17`), `restart04` (`5`), `restart05` (`10`), `restart051` (`9`), `clean-architecture` (`9`), `restart02` (`9`), `restart021` (`7`), `offline-sync-22-scenarios` (`23`), `collection-kiosk-production` (`24`), `dairy-admin-production` (`36`) |
| Fail-closed `REQUIRE_REAL_POSTGRES=1` `restart10-union-bank-tenant-isolation.test.js` (`TEST_POSTGRES_URL=""`) | `0` | `1` | `0` | `1` | Refuses `pg-mem` fallback (`ERR_ASSERTION`) |
| Fail-closed `node scripts/ci-run-restart10-pg17.js` (`TEST_POSTGRES_URL=""`) | `0` | `0` | `0` | `1` | Exits non-zero (`FATAL: TEST_POSTGRES_URL is not set`) |

### 4.2 Local vs. Live PostgreSQL 17.12 Status
- **Local Disposable PostgreSQL 17.12 Server:** **UNAVAILABLE** — `com.docker.service` (Docker Desktop Service) is `Stopped`, `psql` is not installed locally, and `TEST_POSTGRES_URL` is unset. Per policy, no `pg-mem` or fallback claim was used for integration verification.
- **GitHub Actions PG 17.12 Integration Status (`Groups A–L`):** **NOT YET PASSED** — Run `46125434340` on `af578d8` failed during `seedTenantDairy()` setup before Groups A–L; the updated test file awaits commit/push **plus** the follow-up production fix for `UnionBankReconciliationService.ts:246` (`c.bank_account_mask`) before Groups A–L can complete cleanly on PG `17.12`.

---

## 5. Issue Closure & Git State Summary

- **`DF-022` (`P0` Financial Reconciliation / Split-Brain):** **`OPEN / PARTIAL`** — Remains open until `.github/workflows/dfarm-restart10-postgres17.yml` passes Groups A–L against real two-tenant PostgreSQL `17.12` with `0` failures and `0` skips.
- **`DF-024` (`P1` Banking / Union Bank Adapter):** **`PARTIAL` (Code-Hardened / Externally Blocked)** — Fail-closed debit validation, zero-account removal, and credential masking remain intact and verified offline, while live Union Bank transfers remain disabled pending official dairy corporate credentials (`UNION_BANK_CORP_ID`, `UNION_BANK_CLIENT_ID`, `UNION_BANK_CLIENT_SECRET`, `UNION_BANK_BASE_URL`, per-dairy authorized debit account) and Union Bank host-to-host gateway certification (`502 UNION_BANK_GATEWAY_CERTIFICATION_REQUIRED`).
- **Current Remote HEAD (`origin/fix/cloudflare-pages-production-deploy`):** `af578d8624099c8ef020643de5c3d135b75a4a69`
- **Local HEAD:** `af578d8624099c8ef020643de5c3d135b75a4a69`
- **Local Worktree Modifications (Uncommitted):**
  - [`services/backend/tests/restart10-union-bank-tenant-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart10-union-bank-tenant-isolation.test.js)
  - [`DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md)
  - [`DFARM_RESTART_10_UNION_BANK_TENANT_ISOLATION_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_10_UNION_BANK_TENANT_ISOLATION_REPORT.md)
  - [`DFARM_RESTART_10_2_CI_BOOTSTRAP_FIX_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_10_2_CI_BOOTSTRAP_FIX_REPORT.md)
  - [`DFARM_RESTART_10_3_PG17_TEST_FIXTURE_AND_GROUP_L_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_10_3_PG17_TEST_FIXTURE_AND_GROUP_L_REPORT.md) *(untracked new report)*
