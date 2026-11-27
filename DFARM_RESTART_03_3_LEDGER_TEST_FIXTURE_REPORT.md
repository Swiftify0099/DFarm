# DFarm RESTART-03.3 — Ledger & Lifecycle Test Fixture Remediation Report

**Phase:** `RESTART-03.3`  
**Date:** `2026-11-27`  
**Repository / Branch:** `Swiftify0099/DFarm` (`fix/cloudflare-pages-production-deploy`)  
**Local & Public Remote Base HEAD:** `ea8bf416136afab9cc692edde7394827d1d96081` (`RESTART-03.3` changes uncommitted locally; remote untouched)  
**Classification:** `PARTIAL — LIFECYCLE SUITE 9/9 PASS OFFLINE; ISOLATED PG17 ACCOUNTING SUITE PREPARED (SKIP / NOT RUN ON HOST)`

---

## 1. Root Cause

Two test suites failed in `RESTART-03.2` due to outdated test fixtures and ambient database assumptions rather than weak security:
1. [`customer-data-lifecycle-e2e.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-data-lifecycle-e2e.test.js) (`2/9` pass, `7/9` fail before edit):
   - Line 61 signed `superAdminToken` with `actorType: 'SUPER_ADMIN'` instead of `'STAFF'`, causing Steps 7 and 8 to fail `401` and cascading into Step 9 (`23505` duplicate `SAHYADRI_01` because Step 8 deprovision never ran).
   - Line 211 submitted static OTP `'123456'` to `/api/v1/auth/customer/verify-otp` without calling `/api/v1/auth/customer/request-otp` first (`RESTART-02.1` removed static OTPs), failing Step 2 (`400`) and Steps 3 & 5 (`401`).
   - Line 343 invoked `ledgerRepo.save(ledgerA, ledgerEntry)` without passing the already-seeded `operatorAId`.
2. [`customer-ledger-accounting.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js) (`2/24` pass, `22/24` fail before edit):
   - Hardcoded ambient connection fallback `postgresql://postgres:postgres@127.0.0.1:54322/postgres` and required pre-seeded `'SDCU_01'` / `'Sangli'` organization rows.
   - Used legacy single-DB `signJwt` (without `actorType`) and unmounted `modules/ledger/ledger.routes.ts` endpoints (`404`) rather than the current database-per-dairy `createApp`, `TenantDatabaseManager`, `PostgresLedgerRepository`, and isolated PG17 stored procedures/triggers.

---

## 2. Exact Files Changed

| File | Change Summary |
| :--- | :--- |
| [`customer-data-lifecycle-e2e.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-data-lifecycle-e2e.test.js) | Fixed `superAdminToken` `actorType: 'STAFF'`; updated Step 2 to call `/api/v1/auth/customer/request-otp` and verify `previewOtp`; asserted `ledgerRepo.save(ledgerA, ledgerEntry)` rejects without actor (`INVALID_OPERATOR`) and passed real seeded `{ operatorId: operatorAId }`. |
| [`customer-ledger-accounting.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js) | Removed hardcoded `127.0.0.1:54322` & Sangli/Kolhapur dependency; enforced explicit `TEST_POSTGRES_URL` + `REQUIRE_REAL_POSTGRES=1` fail guard; provisioned 3 isolated ephemeral PG17 databases (`dfarm_l12_ctrl_*`, `dfarm_l12_org1_*`, `dfarm_l12_org2_*`) via `MigrationRunner` + `TenantDatabaseManager`; preserved all 22 accounting scenarios across `createApp` routes, `PostgresLedgerRepository`, and PG17 stored procedures/triggers. |

---

## 3. Old Versus New Behavior

- **`customer-data-lifecycle-e2e.test.js`:** Went from `2/9` pass (`EXIT=1`) to **`9/9` pass (`0` fail, `0` skipped, `EXIT=0`)** in `pg-mem` offline mode without weakening any authentication, OTP, or operator validation rule.
- **`customer-ledger-accounting.test.js`:**
  - Old: Connected to ambient `127.0.0.1:54322/postgres`, failed `2/24` (`Org 1 must exist`, `uuid: ""`, `404`).
  - New: Requires explicit `TEST_POSTGRES_URL`. Skips cleanly (`SKIP / NOT RUN`, `EXIT=0`) when PG17 is unavailable locally, fails (`EXIT=1`) when `REQUIRE_REAL_POSTGRES=1` and PG17 is unreachable, and creates/migrates/seeds/drops its own 3 disposable databases when PG17 is available. Preserves all 22 scenarios: milk credit, advance debit, partial/full recovery & over-recovery rejection, deduction posting, duplicate idempotency, balanced journal check, constraint rejection, HTTP summary, opening balance + duplicate rejection, reversal, authorized adjustment + unauthorized 403, immutability triggers, customer ownership 200/403, cross-org 403, reconciliation success/mismatch, NUMERIC precision, DB rollback, feed debit via `PostgresLedgerRepository.save()`, and payout + ledger entries + reports + operator least-privilege checks.

---

## 4. Database Ownership, Actor/Org Context, Idempotency & Concurrency

- **Database Ownership:** `customer-ledger-accounting.test.js` isolates control plane (`dfarm_l12_ctrl_*`), Org 1 (`dfarm_l12_org1_*`), and Org 2 (`dfarm_l12_org2_*`) with encrypted `dairy_database_mappings` (`CredentialEncryption.encrypt`) and sets `CENTRAL_DATABASE_URL`/`DATABASE_URL` to the disposable control-plane DB before importing `createApp`.
- **Actor & Organization Context:** `customer-data-lifecycle-e2e.test.js` uses `operatorAId` and `actorType: 'STAFF'`; `customer-ledger-accounting.test.js` verifies `POST /api/v1/ledger/adjustment` ignores client `operatorId` overrides and records `req.user.userId` (`adminUserId`).
- **Idempotency & Concurrency:** Preserved in Scenarios 6, 10, and 21 (`post_customer_deduction`, `post_customer_opening_balance`, and `PostgresLedgerRepository.save`).

---

## 5. SQL, Migration Execution & Test Evidence

- **Migrations:** Uses `MigrationRunner.runControlPlaneMigrations` and `MigrationRunner.runTenantMigrations` on disposable databases (excluding quarantined `031_remove_dairy_admin_7507495615.sql`).
- **Exact Commands & Observed Outputs:**
  - Before edit: `$env:NODE_ENV='test'; $env:TENANT_POOL_CONNECTION_TIMEOUT_MS='500'; node --test services/backend/tests/customer-data-lifecycle-e2e.test.js` -> `2/9` pass, `7/9` fail (`EXIT=1`).
  - Before edit: `node --test services/backend/tests/customer-ledger-accounting.test.js` -> `2/24` pass, `22/24` fail (`EXIT=1`).
  - After edit: `$env:NODE_ENV='test'; $env:TENANT_POOL_CONNECTION_TIMEOUT_MS='500'; node --test services/backend/tests/customer-data-lifecycle-e2e.test.js` -> `# tests 9, # pass 9, # fail 0, # skipped 0, EXIT=0` (`pg-mem`).
  - After edit (no PG17 on host): `node --test services/backend/tests/customer-ledger-accounting.test.js` -> `# tests 1, # pass 0, # fail 0, # skipped 1, EXIT=0` (`SKIP / NOT RUN`).

---

## 6. Status, Local vs Remote & Remaining Blockers

- **Real PostgreSQL Status:** `BLOCKED / NOT RUN` on host (`dockerDesktopLinuxEngine` unavailable; `TEST_POSTGRES_URL` unreachable).
- **CI Workflow Status:** `CI PREPARED — NOT EXECUTED` (`.github/workflows/dfarm-restart03-postgres17.yml` includes `customer-ledger-accounting.test.js`).
- **Local vs Remote State:** Remote at `ea8bf41`; local uncommitted updates preserved.
- **Remaining Blockers & Next Phase Dependency:** Execute `customer-ledger-accounting.test.js` against PG17 (`DF-030`) before `RESTART-04`/`RESTART-06`.
