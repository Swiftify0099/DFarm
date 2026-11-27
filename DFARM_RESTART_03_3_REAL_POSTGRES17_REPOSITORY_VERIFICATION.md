# DFARM RESTART-03.3 — Real PostgreSQL 17 Repository Verification Report

## 1. Executive Summary & Final Classification

- **Repository:** `Swiftify0099/DFarm` (`fix/cloudflare-pages-production-deploy`, local & verified remote HEAD `ea8bf416136afab9cc692edde7394827d1d96081`)
- **Phase:** `DFARM RESTART-03.3`
- **Classification:** `PARTIAL — SOURCE FIXES VERIFIED BUT REAL POSTGRESQL OR REQUIRED REGRESSION GATES REMAIN`
- **Real PostgreSQL 17 Host Execution Status:** `BLOCKED / NOT EXECUTED LOCALLY` (`psql` and `pg_ctl` unavailable on host; Docker daemon fails on missing `npipe:////./pipe/dockerDesktopLinuxEngine`). All 5 real-PostgreSQL suites skip honestly when PG17 is unreachable (`EXIT=0`, `skipped 1`) and fail closed when `REQUIRE_REAL_POSTGRES=1` is set (`EXIT=1`).

---

## 2. Root Cause & Gap Addressed

Prior to RESTART-03.3:
1. Repository integration coverage relied primarily on `pg-mem` and hand-written SQL checks rather than an actual-repository PostgreSQL 17 harness exercising `MigrationRunner`, `TenantDatabaseManager.getStrictTenantDb`, `PostgresLedgerRepository`, `PostgresShiftSessionRepository`, and `PostgresCollectionTransactionRepository`.
2. `customer-ledger-accounting.test.js` depended on an ambient local database fallback (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) and pre-seeded Sangli/Kolhapur organizations.
3. `concurrent-idempotency-financial.test.js` lacked explicit `TEST_POSTGRES_URL` + `REQUIRE_REAL_POSTGRES=1` enforcement and isolated 3-database provisioning (`MigrationRunner` + `TenantDatabaseManager`).
4. `restart03-real-postgres.test.js` and `restart032-real-postgres.test.js` did not yet enforce a strict fail-closed `REQUIRE_REAL_POSTGRES=1` guard for CI gates.

---

## 3. Exact Files Changed & Added

| File | Change | Purpose |
| :--- | :--- | :--- |
| `services/backend/tests/restart033-real-postgres-repositories.test.js` | Created | 3-DB real PostgreSQL 17 integration suite testing actual DFarm repositories, `MigrationRunner`, `TenantDatabaseManager.getStrictTenantDb`, Phase 1.C concurrency/idempotency/actor/rollback cases, and cross-tenant isolation. |
| `services/backend/tests/customer-ledger-accounting.test.js` | Modified | Replaced ambient `127.0.0.1:54322` / Sangli setup with explicit `TEST_POSTGRES_URL`, `REQUIRE_REAL_POSTGRES=1` fail guard, 3 ephemeral PG17 DBs (`dfarm_l12_ctrl_*`, `org1`, `org2`) migrated via `MigrationRunner`, encrypted `dairy_database_mappings`, and 22 scenarios on `createApp` + `TenantDatabaseManager` + `PostgresLedgerRepository`. |
| `services/backend/tests/concurrent-idempotency-financial.test.js` | Modified | Updated to explicit `TEST_POSTGRES_URL`, `REQUIRE_REAL_POSTGRES=1` fail guard, and 3 isolated ephemeral DBs migrated via `MigrationRunner` + `TenantDatabaseManager`. |
| `services/backend/tests/restart03-real-postgres.test.js` | Modified | Added `REQUIRE_REAL_POSTGRES=1` fail guard so CI fails rather than skipping if PG17 is absent. |
| `services/backend/tests/restart032-real-postgres.test.js` | Modified | Added `REQUIRE_REAL_POSTGRES=1` fail guard. |
| `.github/workflows/dfarm-restart03-postgres17.yml` | Created | Executable GitHub Actions PostgreSQL 17 CI gate running `build:backend`, `db:validate`, and all 5 PG17 suites under `REQUIRE_REAL_POSTGRES: "1"`. |

---

## 4. Old vs New Behavior

- **Old Behavior:**
  - Real-PG ledger tests either pointed at an ambient local port or ran only SQL/schema assertions instead of actual TypeScript repositories wired through `TenantDatabaseManager`.
  - When PostgreSQL was absent, suites silently skipped even in automated gate contexts unless checked manually.
- **New Behavior:**
  - `restart033-real-postgres-repositories.test.js` provisions 3 isolated databases (control-plane + Dairy A + Dairy B), runs `MigrationRunner` (`CONTROL_PLANE_MIGRATIONS` and `TENANT_OPERATIONAL_MIGRATIONS`), resolves tenant DBs exclusively via `TenantDatabaseManager.getStrictTenantDb`, and exercises actual `PostgresLedgerRepository`, `PostgresShiftSessionRepository`, and `PostgresCollectionTransactionRepository`.
  - All 5 PG17 suites require explicit `TEST_POSTGRES_URL` (never silently using `DATABASE_URL` or production databases) and honor `REQUIRE_REAL_POSTGRES=1` by failing closed with exit code `1` when PostgreSQL 17 is unavailable.

---

## 5. Database Ownership, Actor/Org Context, Idempotency & Concurrency Scope

1. **Database Ownership & Tenant Resolution:**
   - Control plane holds `dairy_database_mappings` with encrypted connection configuration.
   - `TenantDatabaseManager.getStrictTenantDb` resolves each dairy's isolated operational database; zero `getAllTenantDbs` call sites remain in `services/backend/src/**/*.ts` (`0` matches).
   - Same customer UUID across Dairy A and Dairy B remains strictly isolated per tenant database.
2. **Actor & Organization Context:**
   - `ILedgerRepository.save()` and `PostgresLedgerRepository.save()` require UUID `options.operatorId` whenever `newEntry` is supplied (verified via TypeScript overloads and removal of `(newEntry as any).createdBy/operatorId` fallback).
   - `PostgresLedgerRepository` validates customer, center, and active operator membership in the strict tenant DB before mutation.
3. **Idempotency & Concurrency:**
   - `lockOrCreateLedgerAccount()` uses `FOR UPDATE` + `ON CONFLICT (customer_id) DO UPDATE`, and `executeJournalMutation()` executes inside one tenant transaction: `validateCustomerCenterAndOperator` -> `lockOrCreateLedgerAccount` -> re-check `(idempotency_key OR id)` -> compute balance from locked DB state -> `INSERT ledger_transactions ON CONFLICT DO NOTHING` -> `INSERT` 2 balanced `ledger_entries` lines -> `UPDATE customer_ledger_accounts`.
   - Local `pg-mem` subtest `2.2b` in `restart032-operational-repository-isolation.test.js` verified actor rejection, concurrent duplicate entry ID, concurrent credit/debit race on stale snapshots, and idempotent replay.
   - Multi-connection real PostgreSQL 17 execution of `restart033-real-postgres-repositories.test.js` (including duplicate entry ID, duplicate idempotency key, concurrent credit/debit races, rollback after partial failure, and same-UUID cross-tenant isolation) is implemented and ready for PG17 execution in CI or any PG17 environment, but could not run on this host.

---

## 6. SQL & Migrations Observations

- `npm run db:validate` passed (`13/13` PASS, `0` fail, `0` skipped, `EXIT=0`).
- `MigrationRunner` runs `CONTROL_PLANE_MIGRATIONS` and `TENANT_OPERATIONAL_MIGRATIONS` and excludes `031_remove_dairy_admin_7507495615.sql`.
- `031` migration filename prefix duplication and `040_device_auth_challenges.sql` tier mismatch (`CONTROL_PLANE` in `packages/database/src/index.ts` vs `SHARED` in `MigrationRunner.ts`) remain open under `DF-020`.

---

## 7. Exact Commands, Actual Outputs, & Host Blocker Proof

| Check | Outcome | Exact Output Summary |
| :--- | :--- | :--- |
| Host PG17 / Docker check | Unavailable locally | `psql` / `pg_ctl` missing; `docker info` fails on missing `npipe:////./pipe/dockerDesktopLinuxEngine`. |
| `node --test services/backend/tests/restart033-real-postgres-repositories.test.js` | Skipped honestly | `0/1` (`skipped 1`, `EXIT=0` without PG17). |
| `REQUIRE_REAL_POSTGRES=1` run of `restart033-real-postgres-repositories.test.js` | Failed closed as designed | `0/1`, `fail 1`, `EXIT=1`. |
| `node --test services/backend/tests/restart03-real-postgres.test.js` | Skipped honestly | `0/1` (`skipped 1`, `EXIT=0`). |
| `node --test services/backend/tests/restart032-real-postgres.test.js` | Skipped honestly | `0/1` (`skipped 1`, `EXIT=0`). |
| `node --test services/backend/tests/customer-ledger-accounting.test.js` | Skipped honestly | `0/1` (`skipped 1`, `EXIT=0`). |
| `node --test services/backend/tests/concurrent-idempotency-financial.test.js` | Skipped honestly | `0/1` (`skipped 1`, `EXIT=0`). |
| `node --test services/backend/tests/restart032-operational-repository-isolation.test.js` (`pg-mem`) | Passed (`pg-mem` only) | `16/16` PASS (`0` fail, `0` skipped, `EXIT=0`). |

---

## 8. Local vs Remote State, Remaining Blockers, & Next Phase Dependency

- **Local vs Remote State:** Remote branch `fix/cloudflare-pages-production-deploy` remains at `ea8bf416136afab9cc692edde7394827d1d96081`. All RESTART-03.3 edits exist only in the local worktree (uncommitted and unpushed per workflow rules).
- **CI Workflow Status:** `CI PREPARED — NOT EXECUTED` (`.github/workflows/dfarm-restart03-postgres17.yml` has not been pushed or executed on GitHub Actions).
- **Remaining Blockers & Next Phase Dependency:** Before advancing to RESTART-04, execute the 5 real PostgreSQL 17 test suites against an actual PostgreSQL 17 instance (either locally with Docker/PG17 or via GitHub Actions on `.github/workflows/dfarm-restart03-postgres17.yml`) under `REQUIRE_REAL_POSTGRES=1` and confirm all 5 suites pass without skips. Open triaged issues (`DF-007`, `DF-018`, `DF-019`, `DF-020`, `DF-021`, `DF-022`, `DF-023`, and remaining parts of `DF-030` such as TypeCheck / `offline-sync-22-scenarios.test.js` / `customer-lifecycle-security.test.js`) remain tracked in `DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`.
