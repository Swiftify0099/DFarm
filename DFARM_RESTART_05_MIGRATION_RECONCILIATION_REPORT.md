# DFARM — RESTART-05 Migration Manifest, Ownership & Execution Reconciliation Report (`DF-020`)

**Repository:** `Swiftify0099/DFarm`  
**Branch:** `fix/cloudflare-pages-production-deploy`  
**Task:** `RESTART-05` -> `RESTART-05.1` -> `RESTART-05.1.1` (`DF-020`, Priority `P0`)  
**Previous Public HEAD (`RESTART-05`):** `b2f063a399eebf7493dc3ff123203539154d8e71`  
**Current Public HEAD (`origin/fix/cloudflare-pages-production-deploy` / `RESTART-05.1`):** `4ca6082f3b3330fede921a3b18d19b4ad93a18c5`  
**Overall `DF-020` Status:** **PARTIAL — LOCAL `RESTART-05.1.1` FIXES VERIFIED, POSTGRESQL 17 CI PENDING**

> [!NOTE]
> Commit `b2f063a399eebf7493dc3ff123203539154d8e71` failed Run `46063207947` Step 9. `RESTART-05.1` was committed and pushed at `4ca6082f3b3330fede921a3b18d19b4ad93a18c5`, and Run `46092960805` (Job `140817845187`) on PostgreSQL `17.12` passed steps 1–8 and 7 real PG17 subtests (`1–5, 8–9`) while failing Step 9 (`7 passed, 5 failed, 0 skipped`) on offline suite Supabase env validation, Subtest 6 rollback `AggregateError`, and Subtest 7 async pool `remove` assertion timing. Follow-up `RESTART-05.1.1` fixes (see [`DFARM_RESTART_05_1_MIGRATION_RUNNER_SAFETY_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_05_1_MIGRATION_RUNNER_SAFETY_REPORT.md)) resolve all three failure areas locally and harden [`scripts/ci-run-restart05-pg17.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-restart05-pg17.js); disposable PostgreSQL `17.12` CI re-execution awaits operator commit/push.

---

## 1. Phase A Audit Summary Table (Pre-Edit Baseline at `6d90570`)

| Area | Existing Behavior (Pre-Edit) | Root Cause | Risk | Implemented Correction |
| :--- | :--- | :--- | :--- | :--- |
| **Migration `031` Active** | `packages/database/src/index.ts:49` and `MigrationRunner.ts:52` both classify `031_dairy_database_mappings.sql` as `CONTROL_PLANE` (`version: '031'`). `supabase/migrations/031_dairy_database_mappings.sql:6-20` creates `dairy_database_mappings` (`REFERENCES organizations(id)`). | Active control-plane tenant-routing registry shares numeric prefix `031_` with quarantined file. | Filename prefix collision if naive directory runners parse `^(\d+)_` instead of using manifest metadata. | Preserved historical filename untouched; kept `version: '031'` & `target: CONTROL_PLANE`; added validator rule allowing duplicate prefix `031` strictly under single active + `MANUAL_REVIEW_REQUIRED` quarantine. |
| **Quarantined `031`** | `packages/database/src/index.ts:48` and `MigrationRunner.ts:51` register `031_remove_dairy_admin_7507495615.sql` as `version: '031_quarantine'`, `target: MANUAL_REVIEW_REQUIRED`. On-disk SQL (`supabase/migrations/031_remove_dairy_admin_7507495615.sql:1-15`) is a `RAISE NOTICE` stub; actual purge logic lives in `scripts/purge-dairy-admin.js`. | `MigrationRunner.ts:137-143` copied all `supabase_migrations.schema_migrations` rows into `schema_migrations` without excluding quarantined names/versions, and filename-based check in `scripts/migrate.js:146` used substring `!f.includes('remove_dairy_admin')`. | Historical `supabase_migrations` entry for `031_remove_dairy_admin_7507495615.sql` could mask active `031`; raw filename runners or future edits to the file could bypass quarantine. | Excluded `QUARANTINED_MIGRATION_FILENAMES` & `QUARANTINED_MIGRATION_VERSIONS` from track lists, `ensureSchemaMigrationsTable()` sync, and CLI plans; fails closed on historical `supabase_migrations` collision on `v031`. |
| **Migration `040`** | `packages/database/src/index.ts:58` set `target: CONTROL_PLANE`, whereas `MigrationRunner.ts:61` set `target: SHARED` (and `TenantDatabaseManager.ts:1548` loaded `040` into tenant test doubles). | Split unshared manifests drifted; `MigrationRunner` applied `040` to both control-plane and every tenant DB while `TenantDatabaseControlService.ts:954` (`@dfarm/database`) excluded `040` from tenant history. | Split/duplicate `device_auth_challenges` table created in tenant DBs despite runtime `DeviceChallengeService.ts` querying only central `db`, breaking ownership clarity and inflating tenant track count. | Unified `040_device_auth_challenges.sql` under `CONTROL_PLANE` only (`packages/database/src/index.ts:61`); removed `'040_device_auth_challenges.sql'` from `TenantDatabaseManager.ts` isolated tenant memory DB list. |
| **Control-Plane Manifest** | Duplicated between `packages/database/src/index.ts:20-66` and `services/backend/src/infrastructure/database/MigrationRunner.ts:20-73` with divergent descriptions (`038`–`040`) and divergent `040` target. | `@dfarm/backend` redeclared its own manifest instead of importing `@dfarm/database`. | Ongoing target drift between CLI/validator tools, `TenantDatabaseControlService`, and runtime `MigrationRunner`. | Consolidated canonical catalog in `packages/database/src/index.ts` and re-exported from `MigrationRunner.ts:4-30` (zero package cycle). |
| **Tenant Manifest** | `TenantDatabaseControlService.ts:935-936` hardcoded `totalExpectedMigrations: 37`; `MigrationRunner.ts:75-77` included `040` inside `TENANT_OPERATIONAL_MIGRATIONS` (`37` items). | Hardcoded count `37` coupled to pre-reconciliation `SHARED` classification of `040`. | Removing `040` from `TENANT_OPERATIONAL_MIGRATIONS` would cause `validateSchema()` / `getMigrationHistory()` count mismatch. | Updated `TenantDatabaseControlService.ts:932,954` to derive count and history directly from canonical `TENANT_OPERATIONAL_MIGRATIONS` (`36` entries). |
| **Legacy Migration Script (`scripts/migrate.js`)** | `package.json` `"db:migrate": "node scripts/migrate.js"` discovered SQL via `fs.readdirSync` (`scripts/migrate.js:145-146`), fell back to `.env` `DIRECT_URL` / `DATABASE_URL` (`L66-67`), used non-atomic queries (`L176-188`), and ran `030` seed fallback (`L216-228`). | Pre-multi-database CLI script left active without track filtering or canonical catalog checks. | Running `npm run db:migrate` could apply `TENANT_OPERATIONAL` migrations (`041`, `042`, etc.) to the control plane or control-plane scripts to a tenant DB. | Converted `scripts/migrate.js` to canonical `@dfarm/database` consumer; fails closed unless `--track=control-plane`, `--track=tenant --dairy-id=<uuid>`, or `--validate-only` is supplied before reading `.env`. |
| **Migration Runner & Validation** | `MigrationRunner.ts` ran `pg_advisory_lock`/`unlock` on `clientOrPool` (`L168,264` across pool checkouts), ran DDL outside `BEGIN/COMMIT`, used `ON CONFLICT DO UPDATE` overwriting checksums (`L226`), and `packages/database` lacked catalog/disk reconciliation tests. | Pool checkout mismatch broke session advisory locks; non-atomic apply left partial state; silent checksum overwrites hid history drift. | Concurrent lock leaks on pools, partial failed DDL leaving corrupt schema, silent overwriting of historical checksums/filenames, unregistered `.sql` files undetected. | Single pooled `PoolClient` checkout, atomic per-migration `BEGIN/COMMIT/ROLLBACK` + `SAVEPOINT` for `supabase_migrations`, `ON CONFLICT DO NOTHING`, visible `checksumMismatch`, fail-closed version filename conflicts, and `validateMigrationCatalog` / `validateMigrationsDirectory`. |

---

## 2. Ownership & Architecture Verification Evidence

### A. Migration `031` Active vs. Quarantined Evidence
1. **`supabase/migrations/031_dairy_database_mappings.sql` (Lines 1–20):**
   - Creates `public.dairy_database_mappings` (`dairy_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE`, `database_name`, `connection_uri_encrypted`, `provisioning_status`) and index `idx_dairy_db_mappings_dairy_id`.
   - Runtime consumers (`services/backend/src/infrastructure/database/TenantDatabaseManager.ts:318,408,848,1271,1327,1421`) read and write `dairy_database_mappings` exclusively against the central control-plane `db` pool.
   - Authoritative classification: **active `CONTROL_PLANE` migration, `version: '031'`**.
2. **`supabase/migrations/031_remove_dairy_admin_7507495615.sql` (Lines 1–15):**
   - Inspecting the actual SQL confirms the committed file currently contains a comment header explaining quarantine policy plus a `DO $$ BEGIN RAISE NOTICE 'Quarantined migration 031_remove_dairy_admin_7507495615.sql requires manual review.'; END $$;` block (`L12-15`). (Separately, operational purge logic exists in `scripts/purge-dairy-admin.js`.)
   - Regardless of the stub SQL body, the file remains under permanent manual-review quarantine (`version: '031_quarantine'`, `target: MigrationTarget.MANUAL_REVIEW_REQUIRED`), is excluded from `MIGRATION_FILES`, `CONTROL_PLANE_MIGRATIONS`, and `TENANT_OPERATIONAL_MIGRATIONS`, and must never be executed or inserted into `schema_migrations`.
   - No historical filenames or versions were renamed or altered.

### B. Migration `040` Authoritative Ownership Evidence (`CONTROL_PLANE`)
1. **SQL Definition (`supabase/migrations/040_device_auth_challenges.sql:6-21`):**
   - Creates `public.device_auth_challenges (challenge VARCHAR(64) PRIMARY KEY, device_identifier VARCHAR(100) NOT NULL, organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, purpose, failed_attempts, created_at, expires_at, consumed_at)`.
   - `organizations` is created by `002_organizations_and_centers.sql` (`SHARED`, authoritative in control-plane) and `040` has **no** foreign key to tenant `devices` tables.
2. **Runtime Call Sites:**
   - `services/backend/src/infrastructure/security/DeviceChallengeService.ts` imports central control-plane `db` exclusively (`L2: import { db } from '../database/PostgresPool.js'`) and never references `tenantDbManager`. Every SQL operation (`ensureTableExists` `L27`, `createChallenge` insert/prune `L90,L97`, `verifyAndConsumeProof` `pool.connect()` + `SELECT ... FOR UPDATE` + `UPDATE device_auth_challenges` `L162-258`) targets central `db`.
   - `services/backend/src/presentation/routes/auth.routes.ts:97,113` handles `POST /api/v1/auth/device/challenge` using central `db` + `deviceChallengeService.createChallenge(...)`.
   - `services/backend/src/application/use-cases/auth/OperatorAuthUseCases.ts:230,287` verifies station credentials and consumes single-use proof atomically via `deviceChallengeService.verifyAndConsumeProof(...)`.
3. **Architecture Requirement:**
   - Distributed challenge replay protection across horizontally scaled backend instances and kiosks requires one single shared central control-plane `device_auth_challenges` table with atomic PostgreSQL row locks (`FOR UPDATE`). Running `040` on `TENANT_OPERATIONAL` created unused duplicate tables in tenant DBs while runtime never queried them.

---

## 3. Canonical Manifest & Track Counts

`packages/database/src/index.ts` is now the single authoritative migration catalog consumed by both `@dfarm/database` tools, `@dfarm/backend` (`MigrationRunner.ts`, `TenantDatabaseControlService.ts`), and `scripts/migrate.js`:

- **`MIGRATION_MANIFEST`:** `48` total entries (`47` active `001`–`047` + `1` quarantined `031_quarantine`), reconciling 1-to-1 with all `48` `.sql` files in `supabase/migrations/`.
- **`CONTROL_PLANE_MIGRATIONS`:** `16` migrations (`001`–`003`, `028`–`030`, `031`, `032`–`033`, `035`, `036`, `037`, `038`, `040`, `043`–`044`).
- **`TENANT_OPERATIONAL_MIGRATIONS`:** `36` migrations (`001`–`003`, `004`–`027`, `034`, `035`, `037`, `039`, `041`, `042`, `045`–`047`).
- **`SHARED` subset (applied to both tracks):** `5` migrations (`001`, `002`, `003`, `035`, `037`).
- **`QUARANTINED_MIGRATIONS`:** `1` entry (`031_remove_dairy_admin_7507495615.sql`, `version: '031_quarantine'`, `target: MANUAL_REVIEW_REQUIRED`).

---

## 4. Changed Files & Verification Artifacts

### Modified Files
- `packages/database/src/index.ts`: Consolidated authoritative catalog (`038`–`040` normalized, `040` = `CONTROL_PLANE`), exported track partitions (`CONTROL_PLANE_MIGRATIONS`, `TENANT_OPERATIONAL_MIGRATIONS`, `QUARANTINED_MIGRATIONS`, `QUARANTINED_MIGRATION_FILENAMES`, `QUARANTINED_MIGRATION_VERSIONS`), and added `validateMigrationCatalog()`, `validateMigrationsDirectory()`, `resolveMigrationsDir()`.
- `packages/database/package.json`: Extended `"test:validate"` to run `tests/schema-validation.test.js` and `tests/migration-catalog.test.js`.
- `services/backend/src/infrastructure/database/MigrationRunner.ts`: Removed duplicate local manifest; imports/re-exports canonical catalog from `@dfarm/database`; added single `PoolClient` session locking for `pg_advisory_lock`/`unlock`, pre-run catalog/disk validation, atomic `BEGIN/COMMIT/ROLLBACK` + `SAVEPOINT` for `supabase_migrations`, `ON CONFLICT DO NOTHING`, visible `checksumMismatch` reporting without overwriting stored checksums, fail-closed version filename conflict & quarantined `supabase_migrations` collision checks.
- `services/backend/src/infrastructure/database/TenantDatabaseManager.ts`: Removed `'040_device_auth_challenges.sql'` from `createIsolatedMemoryDatabase` tenant SQL file list.
- `services/backend/src/infrastructure/database/TenantDatabaseControlService.ts`: Replaced hardcoded `37` migration count and local manifest filtering in `validateSchema()` / `getMigrationHistory()` with `TENANT_OPERATIONAL_MIGRATIONS` (`36`).
- `scripts/migrate.js`: Rewrote CLI runner to enforce explicit `--track=control-plane`, `--track=tenant --dairy-id=<uuid>`, or `--validate-only` BEFORE loading `.env` or connecting; masks target host/DB in console output; runs canonical track entries atomically (`BEGIN/COMMIT/ROLLBACK`) and refuses tenant runs without `TENANT_DATABASE_URL`.
- Build outputs regenerated cleanly under `packages/database/dist/` and `services/backend/dist/`.

### Added Files
- `packages/database/tests/migration-catalog.test.js` (`10` positive + negative catalog/disk validation tests).
- `services/backend/tests/restart05-migration-reconciliation.test.js` (`10` offline tests covering manifest parity, `040` consumers/replay protection, quarantined skip under spoofing, checksum mismatch preservation, filename conflict, historical collision, atomic rollback, and `scripts/migrate.js` CLI guards).
- `services/backend/tests/restart05-real-postgres-migrations.test.js` (`6` disposable PostgreSQL 17 integration tests checking real track execution, `031`/`040` isolation, zero quarantine rows, idempotency, real PG17 `DeviceChallengeService` concurrency/replay, negative mismatch/conflict/atomic SQL rollback, and clean pool/DB teardown).
- `scripts/ci-run-restart05-pg17.js` (CI safety-guarded runner executing offline + real PG17 RESTART-05 suites with `REQUIRE_REAL_POSTGRES=1` and zero-skip/zero-pg-mem TAP enforcement).
- `.github/workflows/dfarm-restart05-postgres17.yml` (dedicated PostgreSQL `17-alpine` CI gate).

---

## 5. Local Build & Test Execution Evidence

| Check Command | Scope / Environment | Exit Code | Result Summary | DB Mode / Caveat |
| :--- | :--- | :---: | :--- | :--- |
| `npm run build:backend` | Workspaces `shared-types`, `shared-validation`, `database`, `backend` | `0` | Clean TypeScript compilation (`tsc`) | Static compile |
| `npm run db:validate` | `schema-validation.test.js` (`13`) + `migration-catalog.test.js` (`10`) | `0` | **`23/23` PASS** (`0` fail, `0` skipped) | Static / local filesystem |
| `npm run db:test` (`TEST_REAL_POSTGRES` unset) | All `packages/database/tests/**/*.test.js` | `0` | **`32` subtests PASS** (`9` `database-runtime`, `10` `migration-catalog`, `13` `schema-validation`), `0` fail | `database-runtime` uses **`pg-mem`**; `real-postgres-verification.test.js` marked **`# SKIP`** |
| `node --test services/backend/tests/restart05-migration-reconciliation.test.js` | Isolated `127.0.0.1:59999/offline_test`, `NODE_ENV=test` | `0` | **`10/10` PASS** (`0` fail, `0` skipped) | In-memory mock SQL client + subprocess CLI + `DeviceChallengeService` memory fallback |
| `node --test services/backend/tests/restart04-device-auth-and-route-security.test.js` | Isolated `127.0.0.1:59999/offline_test`, `NODE_ENV=test` | `0` | **`5/5` PASS** (`0` fail, `0` skipped) | Uses **`pg-mem`** fallback for offline PG double |
| Batch offline 5-suite run (`clean-architecture`, `restart037-pool-lifecycle`, `restart05-migration-reconciliation`, `super-admin-tenant-database-control`, `tenant-database-isolation`) | Isolated `127.0.0.1:59999/offline_test`, `NODE_ENV=test` | `0` | **`56/56` PASS** (`0` fail, `0` skipped across 5 suites) | `clean-architecture`, `tenant-database-isolation`, `super-admin-tenant-database-control` use **`pg-mem`**; `restart037` & `restart05-offline` use in-memory mocks |
| `node --test services/backend/tests/restart05-real-postgres-migrations.test.js` (no PG URL) | `TEST_POSTGRES_URL` & `REQUIRE_REAL_POSTGRES` unset | `0` | **`0` pass, `0` fail, `1` skipped** (`# SKIP Real PostgreSQL 17 server unavailable`) | Clean skip, **no `pg-mem` fallback** |
| `REQUIRE_REAL_POSTGRES=1 node --test services/backend/tests/restart05-real-postgres-migrations.test.js` | `TEST_POSTGRES_URL` unset | `1` | **Fail-closed as expected** (`0` pass, `1` fail: `REQUIRE_REAL_POSTGRES=1 gate failed`) | Fail-closed CI gate guard verified |
| `node scripts/ci-run-restart05-pg17.js` (no disposable env/URL) | Unset `DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS` | `1` | **Fail-closed as expected** (`Refusing disposable PG17 cluster mutation`) | Safety guard verified |
| `node scripts/migrate.js --validate-only` | No DB connection attempted | `0` | `48` total (`47` active, `1` quarantined, `16` control-plane, `36` tenant-operational, `48` disk SQL files) | Local catalog & disk validation only |
| `node scripts/migrate.js` (no flags) | Refuses un-scoped run before loading `.env` | `1` | **Fail-closed as expected** (`explicit --track=control-plane or --track=tenant --dairy-id=<uuid> is required`) | Zero DB connections attempted |

---

## 6. Pending PostgreSQL 17 CI Verification & Security/History Review

1. **PostgreSQL 17 CI Gate Status (`.github/workflows/dfarm-restart05-postgres17.yml`):**
   - **Run `46063207947` on `b2f063a399eebf7493dc3ff123203539154d8e71`:** Failed Step 9 due to static import order in `restart05-real-postgres-migrations.test.js` (fixed in `4ca6082`).
   - **Run `46092960805` (Job `140817845187`) on `4ca6082f3b3330fede921a3b18d19b4ad93a18c5`:** Confirmed PostgreSQL `17.12`. Steps 1–8 passed and PG17 subtests 1–5, 8, and 9 passed; Step 9 failed (`7 passed, 5 failed, 0 skipped`) due to: (A) offline suites setting `SUPABASE_URL` without synthetic `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`; (B) Subtest 6 tracking-insert fault wrapper firing on `ensureMigrationTrackingTables()` historical sync before `BEGIN;` instead of per-migration `VALUES (` inserts; (C) Subtest 7 asserting `removedCount === 1` synchronously before `pg-pool`'s `client.end()` callback emitted `'remove'` asynchronously.
   - **`RESTART-05.1.1` Remediated Gate (`PENDING` on uncommitted local changes):** Fixes all three failures locally (`restart05-migration-reconciliation.test.js` `10/10` PASS, `restart051-migration-safety.test.js` `9/9` PASS, `build:backend` `0`, `db:validate` `25/25`, `db:test` `34` PASS + PG `# SKIP`), hardens `parseTapStats()` in [`scripts/ci-run-restart05-pg17.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-restart05-pg17.js) for missing summaries / suite-level `# SKIP` / suite-and-nested `not ok` failures, and awaits commit/push to run against disposable `postgres:17-alpine` (`fail === 0`, `skipped === 0`, zero `pg-mem` fallback).
2. **Security & Non-Regression Assessment:**
   - No secrets, passwords, tokens, or connection URIs were printed or added; `scripts/migrate.js` masks connection URIs to `protocol//host[:port]/db`.
   - Zero historical `.sql` files in `supabase/migrations/` were edited, renamed, or deleted (preserving `041`, `042`, `046`, `047`, and `031_remove_dairy_admin_7507495615.sql`).
   - Completed/adjacent issue scopes (`DF-003`, `DF-018` biometrics, `DF-019`, `DF-021` outbox, `DF-022` Union Bank) and existing RESTART-03/04 CI report/workflow artifacts remain untouched.
3. **Existing Database Migration History Consideration (Requires Operator Pre-Flight on Live Environments):**
   - Because previous `MigrationRunner.ts` declared `040_device_auth_challenges.sql` as `SHARED`, existing provisioned tenant databases may already contain a `schema_migrations` row for `040` and an unused `device_auth_challenges` table (and legacy Supabase projects could hold a historical `supabase_migrations.schema_migrations` record if `031_remove_dairy_admin_7507495615.sql` was ever recorded before quarantine).
   - Removing `040` from `TENANT_OPERATIONAL_MIGRATIONS` safely stops future tenant runs from touching `040` without deleting historical tenant `schema_migrations` rows; the hardened runner fails closed on historical `supabase_migrations` quarantined-`031` collisions rather than masking them silently. Operators should inspect production control-plane & tenant `schema_migrations` / `supabase_migrations.schema_migrations` state before executing future live migrations (never dropping tables or rewriting migration history automatically).
