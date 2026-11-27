# DFARM RESTART-03.3 — Final Regression Matrix

## 1. Executive Summary & Final Classification

- **Repository:** `Swiftify0099/DFarm` (`fix/cloudflare-pages-production-deploy`)
- **Verified Local & Remote Base HEAD:** `ea8bf416136afab9cc692edde7394827d1d96081` (`0` ahead / `0` behind; RESTART-03.3 changes are local uncommitted/untracked working tree changes)
- **Classification:** `PARTIAL — SOURCE FIXES VERIFIED BUT REAL POSTGRESQL OR REQUIRED REGRESSION GATES REMAIN`
- **CI Workflow Status:** `CI PREPARED — NOT EXECUTED` (`.github/workflows/dfarm-restart03-postgres17.yml`)

> `pg-mem` and real PostgreSQL 17 are strictly separated below. All offline `pg-mem` passes verify TypeScript logic, repository SQL structure, actor validation, and isolation logic in emulation, **not** PostgreSQL 17 engine locking or stored-procedure execution.

---

## 2. Summary of Root Causes Fixed & Files Changed in RESTART-03.3

1. **DF-016 Ledger Save Concurrency & Idempotency + Mandatory Actor Context:**
   - Updated `services/backend/src/application/ports/index.ts` (`LedgerSaveActorOptions` and overloaded `ILedgerRepository.save(...)` requiring `options.operatorId` when `newEntry` is supplied).
   - Updated `services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts` (`lockOrCreateLedgerAccount()`, `executeJournalMutation()`, strict `FOR UPDATE` -> idempotency re-check -> DB-balance computation -> atomic journal insert & account update, removed unsafe `(newEntry as any).createdBy/operatorId` fallback, rebuilt `services/backend/dist/`).
2. **Lifecycle Fixture & Actor Context (`customer-data-lifecycle-e2e.test.js`):**
   - Fixed `superAdminToken` `actorType: 'STAFF'`, OTP request/verify flow (`/api/v1/auth/customer/request-otp` + `previewOtp`), `assert.rejects` on actorless `ledgerRepo.save()`, and passed `{ operatorId: operatorAId }`.
3. **Isolated PG17 Suites & CI Gate:**
   - Created `services/backend/tests/restart033-real-postgres-repositories.test.js`.
   - Updated `services/backend/tests/customer-ledger-accounting.test.js`, `services/backend/tests/concurrent-idempotency-financial.test.js`, `services/backend/tests/restart03-real-postgres.test.js`, and `services/backend/tests/restart032-real-postgres.test.js` with `REQUIRE_REAL_POSTGRES=1` fail-closed guards and explicit `TEST_POSTGRES_URL` isolation.
   - Added subtest `2.2b` in `services/backend/tests/restart032-operational-repository-isolation.test.js`.
   - Created `.github/workflows/dfarm-restart03-postgres17.yml`.
   - Updated `DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`.

---

## 3. Verification Commands & Actual Observed Results (Post-Final Edit, 2026-11-27)

### A. Builds, Database Validation & Packages

| Command | Mode / Engine | Scope / Counts | Exit Code | Status |
| :--- | :--- | :--- | :--- | :--- |
| `npm run build:backend` | TypeScript build (`tsc`) | Backend source -> `services/backend/dist/` | `0` | PASS |
| `npm run db:validate` | Migration validator | `13/13` pass, `0` fail, `0` skipped | `0` | PASS |
| `npm run db:test` | Package DB tests | `22/22` pass (`suites 3`; internal Real PG suite 2 skipped) | `0` | PASS (with internal PG skip) |
| `npm --prefix apps/dfarm-customer-app test -- --watchAll=false` | Jest / Customer App | `8/8` suites, `31/31` pass | `0` | PASS |
| `npm --prefix apps/dfarm-collection-app test -- --run` | Vitest / Collection App | `17/17` files, `162/162` pass | `0` | PASS |
| `npm --prefix apps/dfarm-dairy-admin test -- --run` | Vitest / Dairy Admin | `5/5` files, `14/14` pass | `0` | PASS |

### B. Backend Offline `pg-mem` Test Suites (`12` Suites, `196/196` Pass)

| Suite (`services/backend/tests/...`) | Engine | Tests | Passed | Failed | Skipped | Exit Code |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `restart032-operational-repository-isolation.test.js` (incl. `2.2b`) | `pg-mem` | `16` | `16` | `0` | `0` | `0` |
| `restart03-tenant-isolation-and-ownership.test.js` | `pg-mem` | `18` | `18` | `0` | `0` | `0` |
| `customer-data-lifecycle-e2e.test.js` | `pg-mem` | `9` | `9` | `0` | `0` | `0` |
| `collection-kiosk-production.test.js` | `pg-mem` | `24` | `24` | `0` | `0` | `0` |
| `customer-tenant-approval-e2e.test.js` | `pg-mem` | `11` | `11` | `0` | `0` | `0` |
| `multi-dairy-membership.test.js` | `pg-mem` | `9` | `9` | `0` | `0` | `0` |
| `tenant-database-isolation.test.js` | `pg-mem` | `7` | `7` | `0` | `0` | `0` |
| `restart02-auth-security-remediation.test.js` | `pg-mem` | `9` | `9` | `0` | `0` | `0` |
| `restart021-auth-session-integrity.test.js` | `pg-mem` | `7` | `7` | `0` | `0` | `0` |
| `dairy-admin-production.test.js` | `pg-mem` | `36` | `36` | `0` | `0` | `0` |
| `roadmap-phase-06-dairy-admin.test.js` | `pg-mem` | `41` | `41` | `0` | `0` | `0` |
| `clean-architecture.test.js` | Static / AST (`pg-mem` unused) | `9` | `9` | `0` | `0` | `0` |
| **Total Offline `pg-mem` Passing Suites** | **`pg-mem`** | **`196`** | **`196`** | **`0`** | **`0`** | **`0`** |

### C. Triaged Pre-Existing Failing Backend Suites (`2` Suites)

| Suite (`services/backend/tests/...`) | Engine | Tests | Passed | Failed | Skipped | Exit Code | Root Cause / Register Mapping |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `offline-sync-22-scenarios.test.js` | `pg-mem` | `23` | `10` | `13` | `0` | `1` | Pre-existing `DF-007` / `DF-018` |
| `customer-lifecycle-security.test.js` | `pg-mem` | `11` | `0` | `11` | `0` | `1` | Pre-existing `DF-001` (removed `/api/v1/auth/login`), `DF-004`, `DF-018` |

### D. Real PostgreSQL 17 Gated Suites (`5` Suites — Host PG17 Unavailable)

| Suite (`services/backend/tests/...`) | Default Run (No PG17) | With `REQUIRE_REAL_POSTGRES=1` (No PG17) | Real PG17 Execution |
| :--- | :--- | :--- | :--- |
| `restart03-real-postgres.test.js` | `0/1` (`skipped 1`, `EXIT=0`) | Enforces fail-closed | NOT EXECUTED ON HOST |
| `restart032-real-postgres.test.js` | `0/1` (`skipped 1`, `EXIT=0`) | Enforces fail-closed | NOT EXECUTED ON HOST |
| `restart033-real-postgres-repositories.test.js` | `0/1` (`skipped 1`, `EXIT=0`) | `0/1`, `fail 1`, `EXIT=1` | NOT EXECUTED ON HOST |
| `customer-ledger-accounting.test.js` | `0/1` (`skipped 1`, `EXIT=0`) | Enforces fail-closed | NOT EXECUTED ON HOST |
| `concurrent-idempotency-financial.test.js` | `0/1` (`skipped 1`, `EXIT=0`) | Enforces fail-closed | NOT EXECUTED ON HOST |

---

## 4. Architectural & SQL/Migration Integrity Summary

- **Database Ownership & Tenant Resolution:** Zero `getAllTenantDbs` calls in `services/backend/src/**/*.ts` (`0` matches). Control-plane DB holds encrypted `dairy_database_mappings`; strict tenant operations resolve via `TenantDatabaseManager.getStrictTenantDb`.
- **Actor/Org Context & Idempotency/Concurrency:** `PostgresLedgerRepository.save()` requires explicit UUID `options.operatorId` when `newEntry` is supplied, validates customer/center/active operator in the strict tenant DB, acquires `FOR UPDATE` lock via `lockOrCreateLedgerAccount()`, re-checks `(idempotency_key OR id)` inside the transaction, computes balance from locked DB state, inserts transaction + 2 balanced journal lines, and commits atomically (`executeJournalMutation()`). Concurrent PG17 multi-connection execution awaits a live PG17 server.
- **Migrations:** `npm run db:validate` passed (`13/13`); `MigrationRunner` runs `CONTROL_PLANE_MIGRATIONS` and `TENANT_OPERATIONAL_MIGRATIONS` (excluding `031_remove_dairy_admin_7507495615.sql`). Prefix duplication (`031`) and `040_device_auth_challenges.sql` tier mismatch vs `packages/database/src/index.ts` stay open under `DF-020`.
- **Preserved Workspace State:** All `.temp/` files (`1,829` local, `0` tracked) and tracked `services/backend/dist/` structure preserved cleanly; zero `git reset`, `clean`, `stash`, `commit`, or `push` performed.

---

## 5. Remaining Blockers & Next Phase Dependency

- **Host Blocker:** Local machine lacks PostgreSQL binaries (`psql`, `pg_ctl`) and a running Docker Linux daemon (`npipe:////./pipe/dockerDesktopLinuxEngine` missing).
- **CI Blocker:** `.github/workflows/dfarm-restart03-postgres17.yml` is `CI PREPARED — NOT EXECUTED` until pushed/triggered in GitHub Actions.
- **Next Step Before RESTART-04:** Run `.github/workflows/dfarm-restart03-postgres17.yml` (or run all 5 PG17 suites against a real PostgreSQL 17 instance with `REQUIRE_REAL_POSTGRES=1`) and confirm `0` skips and `0` failures across all 5 suites; resolve open register items (`DF-007`, `DF-018`..`DF-023`, and remaining `DF-030` gates such as legacy security/sync suites and workspace typechecks) per roadmap.
