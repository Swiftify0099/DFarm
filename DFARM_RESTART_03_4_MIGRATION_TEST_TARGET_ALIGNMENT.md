# DFARM RESTART-03.4 — Migration & Test Target Alignment Report

## 1. Executive Summary

- **Repository:** `Swiftify0099/DFarm` (`fix/cloudflare-pages-production-deploy`)
- **Verified Remote & Local Base HEAD:** `6c0bfc75ac61b6e70a4c72fbf380de5bfc8b436f`
- **Classification:** `BLOCKED — REQUIRED POSTGRESQL CI OR OPERATOR APPROVAL DEPENDENCY UNAVAILABLE` (Alignment fixes implemented, compiled, and validated locally via `npm run build:backend`, `npm run db:validate`, and offline regression tests; real PG17 execution awaits Docker/CI PG17 availability)

---

## 2. Root Causes Discovered & Fixed

### Defect A — Old PG Test Suites Bypassed `MigrationRunner`
- `services/backend/tests/restart03-real-postgres.test.js` and `services/backend/tests/restart032-real-postgres.test.js` previously read `supabase/migrations/*.sql` via `fs.readdirSync(migrationsDir)`, filtered manually, sorted lexicographically, and executed **every** migration file indiscriminately against `poolCtrl`, `poolA`, and `poolB`.
- This bypassed `MIGRATION_MANIFEST`, `CONTROL_PLANE_MIGRATIONS`, and `TENANT_OPERATIONAL_MIGRATIONS`, masking track separation defects.

### Defect B — `MigrationRunner.ts` Track Mismatch on Migration `039`
- **Discovery:** Static dependency auditing of `CONTROL_PLANE_MIGRATIONS` vs `TENANT_OPERATIONAL_MIGRATIONS` revealed that `services/backend/src/infrastructure/database/MigrationRunner.ts:60` labeled `039_milk_collections_organization_idempotency.sql` as `MigrationTarget.SHARED`, whereas `packages/database/src/index.ts:56` labels `039` as `MigrationTarget.TENANT_OPERATIONAL`.
- Because `039` executes unguarded `ALTER TABLE milk_collections ...` and `milk_collections` is created solely by `008_collection_sessions_and_transactions.sql` (`TENANT_OPERATIONAL`), executing `MigrationRunner.runControlPlaneMigrations(poolCtrl)` on a clean PostgreSQL 17 database would fail with `SQLSTATE 42P01: relation "milk_collections" does not exist`.
- **Fix:** Updated `MigrationRunner.ts:60` to `MigrationTarget.TENANT_OPERATIONAL`, matching `packages/database/src/index.ts` and the schema ownership of `milk_collections`.

### Defect C — Tenant Repositories & PG Tests Queried Nonexistent `users.user_role` Column in Tenant DBs
- **Discovery:** In `supabase/migrations/`, column `user_role` on `users` is added only by `029_dairy_admin_activation_tokens.sql` and `030_super_admin_pankaj_popat_yewale.sql`, both of which are `CONTROL_PLANE` migrations. `003_user_identity_foundation.sql` (`SHARED`) defines `role VARCHAR(30) NOT NULL`, not `user_role`.
- `PostgresLedgerRepository.ts:161`, `PostgresCollectionTransactionRepository.ts:253`, and `PostgresShiftSessionRepository.ts:211` queried `SELECT id, organization_id, role, user_role, status FROM users` against tenant DBs (which had only passed in `pg-mem` because `TenantDatabaseManager.ts:1129` manually injected `ALTER TABLE users ADD COLUMN IF NOT EXISTS user_role`).
- Similarly, `restart03`, `restart032`, `restart033`, and `customer-ledger-accounting` test fixtures inserted `user_role` into tenant `users` tables, and queried tenant-only tables (`kiosk_shift_sessions`, `ledger_transactions`, `customer_ledger_accounts`, `milk_collections`) on `poolCtrl`.
- **Fix:**
  - Updated `PostgresLedgerRepository.ts`, `PostgresCollectionTransactionRepository.ts`, and `PostgresShiftSessionRepository.ts` to select `id, organization_id, role, status` from tenant `users` (rebuilt `services/backend/dist/`).
  - Updated tenant fixture inserts in `restart03-real-postgres.test.js`, `restart032-real-postgres.test.js`, `restart033-real-postgres-repositories.test.js`, `customer-ledger-accounting.test.js`, and `concurrent-idempotency-financial.test.js` to use `role` (matching `003`), and updated `poolCtrl` assertions to verify `to_regclass('public.<tenant_table>') === null` (proving tenant tables do not exist in the control plane).

---

## 3. Exact Files Inspected & Changed

- **Backend Source & Build:**
  - [`services/backend/src/infrastructure/database/MigrationRunner.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/MigrationRunner.ts) (`039` -> `TENANT_OPERATIONAL`)
  - [`services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts)
  - [`services/backend/src/infrastructure/repositories/PostgresCollectionTransactionRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresCollectionTransactionRepository.ts)
  - [`services/backend/src/infrastructure/repositories/PostgresShiftSessionRepository.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresShiftSessionRepository.ts)
  - Rebuilt `services/backend/dist/` via `npm run build:backend`.
- **Real PG17 Test Suites (All 5 Aligned):**
  - [`services/backend/tests/restart03-real-postgres.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart03-real-postgres.test.js)
  - [`services/backend/tests/restart032-real-postgres.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart032-real-postgres.test.js)
  - [`services/backend/tests/restart033-real-postgres-repositories.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart033-real-postgres-repositories.test.js) (also added `saveAtomicIntake` mid-transaction rollback test `4d`)
  - [`services/backend/tests/customer-ledger-accounting.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js)
  - [`services/backend/tests/concurrent-idempotency-financial.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/concurrent-idempotency-financial.test.js)

---

## 4. Migration Target & Regression Invariants Verified

| Track / Check | Expected Count / State | Verified Manifest Alignment |
| :--- | :--- | :--- |
| `CONTROL_PLANE_MIGRATIONS` | `16` (`CONTROL_PLANE` + `SHARED`, excluding `039`) | Includes `044`, excludes `045`, excludes quarantined `031_remove_dairy_admin_7507495615.sql` |
| `TENANT_OPERATIONAL_MIGRATIONS` | `35` (`TENANT_OPERATIONAL` + `SHARED`, including `039`) | Includes `039` and `045`, excludes `044`, excludes quarantined `031_remove_dairy_admin_7507495615.sql` |
| `QUARANTINED_MIGRATIONS` | `1` (`031_remove_dairy_admin_7507495615.sql`) | `MigrationTarget.MANUAL_REVIEW_REQUIRED` — never executed |
| `DF-020` Open Items Preserved | Duplicate `031` prefix + `040` tier discrepancy | Both `031_*` entries preserved; `040` stays `SHARED` in `MigrationRunner.ts` vs `CONTROL_PLANE` in `packages/database/src/index.ts` under `DF-020` for `RESTART-05` |
| PG17 Version Gate | `170000 <= server_version_num < 180000` | Enforced in all 5 PG17 suites and `scripts/ci-run-pg17-suites.js` |

- **Already-applied production migrations:** Zero `.sql` files in `supabase/migrations/` were modified.
- **Disposable DB cleanup safety:** All 5 suites drop only the 3 uniquely generated databases (`_<8-hex>`) created during that run after closing `tenantDbManager`, `db`, and test pools.
