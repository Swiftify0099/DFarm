# DFARM RESTART-03.5 — Real PostgreSQL 17 Failure Remediation Report

## 1. Executive Summary & Classification

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Verified Local & Public Remote HEAD:** `436b18835324ab754d10bb58d8b91931dc6cf214` (RESTART-03.4 baseline)
- **Target CI Failure Baseline:** GitHub Actions Run [`45935084366`](https://github.com/Swiftify0099/DFarm/actions/runs/45935084366) / Job [`140296326116`](https://github.com/Swiftify0099/DFarm/actions/runs/45935084366/job/140296326116) on PostgreSQL `17.12` (`server_version_num=170012`)
- **Final Classification:** **`BLOCKED`** — All code, migration, test-harness, fail-closed, and disposable-PG17 safety fixes are implemented and verified locally (`build:backend`, `db:validate`, `db:test`, `13` offline suites `229/229`, `4` frontend workspaces, fail-closed guards, and skip/`REQUIRE_REAL_POSTGRES=1` strict checks), **but live PostgreSQL 17 execution of the 5 PG17 suites is blocked on this host** because Docker Desktop / `com.docker.service` is stopped (no Linux engine pipe `dockerDesktopLinuxEngine`), no native PostgreSQL 17 / `psql` server is installed, and `git commit` / `git push` to trigger GitHub Actions is prohibited by workspace safety rules.
- **Workspace Safety Preserved:** Zero destructive Git operations (`git reset`, `git clean`, `git stash`, commit, push, rebase), `.temp/` preserved intact (`0` tracked files in Git index), `services/backend/dist/` rebuilt cleanly, and zero changes made to already-applied migrations (`017`, `037`, `039`, `045`, etc.).

---

## 2. CI Run `45935084366` / Job `140296326116` Baseline & Root Cause Matrix

| Suite (`436b188`) | Total | Pass | Fail | Skip | Confirmed Root Causes |
|---|---:|---:|---:|---:|---|
| `restart03-real-postgres.test.js` | 5 | 3 | 2 | 0 | Line ~137 brittle regex `/WHERE\s+\(status.*OPEN/i` did not match PG17 `pg_indexes.indexdef` normalized expression `WHERE ((status)::text = 'OPEN'::text)` (cascading parent/assertion failure). Migration `045` itself created the intended partial unique index. |
| `restart032-real-postgres.test.js` | 4 | 4 | 0 | 0 | Passed intact on PG `17.12`. |
| `restart033-real-postgres-repositories.test.js` | 5 | 0 | 5 | 0 | Top-level `import ... MigrationRunner.js` triggered `config/env.js` (`loadEnv()`) *before* `process.env.CENTRAL_DATABASE_URL` / `DATABASE_URL` were set to `ctrlUrl`, caching `127.0.0.1:54322` (`ECONNREFUSED`). `TenantDatabaseManager` hid control-plane failure and returned no tenant mappings (`TenantDatabaseUnavailableError`). |
| `customer-ledger-accounting.test.js` | 24 | 6 | 18 | 0 | (1) Same `config/env.ts` early-eval + missing `poolCtrl` adapter wiring (`ECONNREFUSED 127.0.0.1:54322` -> `pg-mem` fallback & missing tenant mappings). (2) Fixture inserted nonexistent `customer_name` into `customer_dairy_memberships` (`037` has no `customer_name`). (3) Real schema defect: `AccountAuthorityService.ts` selected nonexistent `m.customer_name` from `customer_dairy_memberships`, which breaks customer JWT auth (`503 AUTH_DB_UNAVAILABLE`). (4) Real schema defect: `039` added `NOT NULL` `milk_collections.organization_id`, while `017`'s `complete_milk_collection_session(...)` omitted `organization_id` on insert. (5) Negative test expectations did not isolate real `VARCHAR(10)` length (`22001`), `CHECK` constraint (`23514`), and UUID syntax (`22P02`) SQLSTATEs. |
| `concurrent-idempotency-financial.test.js` | 1 | 0 | 1 | 0 | Same early `config/env.ts` evaluation + missing explicit `poolCtrl` control-plane adapter wiring into `TenantDatabaseManager` (`ECONNREFUSED 127.0.0.1:54322`). |

*(Note: Build, `db:validate`, and PostgreSQL `17.12` role bootstrap for `postgres`, `anon`, `authenticated`, and `service_role` all succeeded in Run `45935084366`. In parallel CI workflow Run [`45935084420`](https://github.com/Swiftify0099/DFarm/actions/runs/45935084420) / Job `140296326248`, Gitleaks still failed due to full-history findings tracked under `DF-003`.)*

---

## 3. Fixes Implemented in RESTART-03.5

### 3.1 RESTART-03 Real PG17 Partial Unique Index Assertion
- **File:** [restart03-real-postgres.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart03-real-postgres.test.js)
- **Migration Verified (Untouched):** [045_kiosk_shift_session_concurrency_and_ownership.sql](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/045_kiosk_shift_session_concurrency_and_ownership.sql)
- Replaced formatting-dependent `/WHERE\s+\(status.*OPEN/i` with semantic PostgreSQL catalog verification using `pg_index`, `pg_class`, `pg_attribute`, and `pg_get_expr(i.indpred, i.indrelid)`:
  - Confirms index `idx_kiosk_shift_sessions_one_open_per_device` exists (`indisunique === true`, `indisvalid === true`).
  - Confirms exact indexed columns `['organization_id', 'center_id', 'device_identifier']`.
  - Confirms predicate references `status`, equality `=`, literal `'OPEN'`, and does not broaden to `'CLOSED'`, `<>`, or `!=`.
- Pre-test cluster safety guard `assertDisposablePg17Cluster` invoked before creating/dropping disposable databases.

### 3.2 Control-Plane DB Adapter Wiring & Load-Order Fix
- **Files Modified:**
  - [restart033-real-postgres-repositories.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart033-real-postgres-repositories.test.js)
  - [customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js)
  - [concurrent-idempotency-financial.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/concurrent-idempotency-financial.test.js)
- **Root Fix Applied:**
  - Deferred dynamic `import(...)` of `MigrationRunner.js`, `TenantDatabaseManager.js`, `PostgresPool.js`, `app.js`, and repositories until *after* `process.env.CENTRAL_DATABASE_URL`, `process.env.DATABASE_URL`, `process.env.REQUIRE_REAL_POSTGRES`, and `process.env.NODE_ENV` are configured for the suite's unique disposable `ctrlDb` / Tenant A / Tenant B URLs.
  - Built an explicit `IDatabaseClient` adapter wrapping `poolCtrl` (`query()` + `withTransaction()`) and injected it via `tenantDbManager.setControlPlaneDb(controlPlaneAdapter)` and `tenantDbManager.initialize(controlPlaneAdapter)`.
  - Added explicit assertions verifying `getControlPlaneDb()`, `getTenantMapping(orgA/orgB)`, and `getStrictTenantDb(orgA/orgB)` resolve to the disposable `ctrlDb`, `tenantA`, and `tenantB` databases respectively.
  - Closed all pools and shut down `tenantDbManager` / `db` deterministically in `after` cleanup hooks.

### 3.3 Fail-Closed `REQUIRE_REAL_POSTGRES=1` Enforcement
- **Files Modified:**
  - [PostgresPool.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/PostgresPool.ts)
  - [TenantDatabaseManager.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts)
  - [payments.routes.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/payments.routes.ts)
  - [reports.routes.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/reports.routes.ts)
- **Behavior Enforced When `REQUIRE_REAL_POSTGRES=1`:**
  - `PostgresPool` refuses `getOrCreateTestMemDb()` and throws an explicit fail-closed error in `query()`, `getClient()`, `withTransaction()`, and `getHealth()` instead of falling back to `pg-mem`.
  - `TenantDatabaseManager.initialize()` rethrows control-plane connection errors instead of marking `isInitialized = true` with an empty mapping cache; `ISOLATED_TEST_INSTANCE`, `createIsolatedMemoryDatabase()`, and control-plane fallback paths in `getStrictTenantDb`, `provisionTenantDatabase`, and `getTenantDb` fail closed.
  - `payments.routes.ts` and `reports.routes.ts` route through `getStrictTenantDb` without catching and falling back to central `db` when `REQUIRE_REAL_POSTGRES=1`.
  - Ordinary offline unit tests (`REQUIRE_REAL_POSTGRES` unset) retain `pg-mem` fallback behavior untouched.

### 3.4 Production Schema Defects Discovered & Resolved
1. **Additive Migration `046` for `complete_milk_collection_session`:**
   - Created [046_complete_milk_collection_session_organization_id.sql](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/046_complete_milk_collection_session_organization_id.sql) (registered in [MigrationRunner.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/MigrationRunner.ts) and [packages/database/src/index.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/index.ts) under `TENANT_OPERATIONAL`).
   - Preserved already-applied migrations `017` and `039` unchanged while updating `public.complete_milk_collection_session(...)` via `CREATE OR REPLACE FUNCTION` so `INSERT INTO milk_collections` sets `organization_id = v_center.organization_id` (required by `039`'s `NOT NULL` constraint) and scopes idempotency lookups to `mc.organization_id = v_center.organization_id`.
2. **`AccountAuthorityService` Nonexistent `m.customer_name` Column:**
   - Fixed [AccountAuthorityService.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/AccountAuthorityService.ts) (removed nonexistent `m.customer_name` from `customer_dairy_memberships` SELECT and fallback lookup, matching `037_customer_multi_dairy_memberships.sql`).
   - *Follow-up note:* [PostgresCustomerMembershipRepository.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresCustomerMembershipRepository.ts) (`L75-85`, etc.) also references legacy membership columns (`customer_name`, `dairy_name`, `dairy_code`, `dairy_address`, `center_name`); it is not exercised by the 5 PG17 suites and remains flagged for schema/repository alignment.

### 3.5 Customer Ledger Accounting Fixtures & Negative Tests
- **File:** [customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js)
- Removed nonexistent `customer_name` from `customer_dairy_memberships` seed insert to match migration `037`.
- Updated negative SQL checks (Test 8) to use a valid seeded `ledger_transactions.id` FK and assert distinct PostgreSQL SQLSTATE codes cleanly:
  - `'INVALID_TYPE'` (> `VARCHAR(10)`) -> SQLSTATE `22001` (`string_data_right_truncation`)
  - `'BOGUS'` (<= 10 chars, invalid `entry_type`) -> SQLSTATE `23514` (`chk_entry_type`)
  - Negative amount (`-50.00`) -> SQLSTATE `23514` (`chk_entry_positive_amount`)
  - Empty string UUID (`''::uuid`) -> SQLSTATE `22P02` (`invalid_text_representation`)

### 3.6 Disposable PostgreSQL 17 Safety Guards
- **Created:** [pg17-safety-guard.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/pg17-safety-guard.js)
- **Updated:** [ci-pg17-bootstrap.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-pg17-bootstrap.js), [ci-run-pg17-suites.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-pg17-suites.js), [dfarm-restart03-postgres17.yml](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart03-postgres17.yml), [docker-compose.pg17-verify.yml](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docker-compose.pg17-verify.yml)
- Fails closed before any role creation, database creation, or database deletion unless **all** conditions pass:
  1. `NODE_ENV === 'test'`
  2. Explicit opt-in `DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS === '1'`
  3. Permitted local/CI host (`127.0.0.1`, `localhost`, `postgres`, `pg17`, `::1`), rejecting cloud/managed DB hosts (e.g. `supabase.co`, `amazonaws.com`, `neon.tech`, `render.com`) and TLS-enabled connections (`sslmode != disable`)
  4. Expected privileged test user (`postgres`) and base database (`dfarm_central`)
  5. Live server version is PostgreSQL `17.x` (`server_version_num` in `170000..179999`)
  6. Authenticated role has `rolsuper`, `rolcreatedb`, and `rolcanlogin`

---

## 4. Verification Matrix

### 4.1 Passed Checks (Post-Final Code/Test Edit)

| Check | Command / Scope | Observed Result | Status |
|---|---|---|---|
| TypeScript Build | `npm run build:backend` | Exited `0` | **PASS** |
| Static DB Validator | `npm run db:validate` | `13/13` checks passed, exit `0` | **PASS** |
| DB Package Tests | `npm run db:test` | `22/22` passed (internal PG suite 2 skipped), exit `0` | **PASS (PG skipped)** |
| 13 Core Offline Backend Suites | `NODE_ENV=test TENANT_POOL_CONNECTION_TIMEOUT_MS=500` across 13 suites | `229/229` subtests passed (`0` fail, `0` skip) | **PASS** |
| `PostgresPool` Fail-Closed Check | Node verification with `REQUIRE_REAL_POSTGRES=1` | `FAIL_CLOSED_VERIFIED=OK`, exit `0` | **PASS** |
| `TenantDatabaseManager` Fail-Closed Check | Node verification with `REQUIRE_REAL_POSTGRES=1` | `FAIL_CLOSED_VERIFIED=OK`, exit `0` | **PASS** |
| Disposable PG17 Safety Guard CLI | Negative inputs (`no-optin`, `node_env!=test`, `bad-host`, `bad-user`, `bad-db`) | All rejected with exit `1` | **PASS** |
| Customer App (Frontend) | `npm --workspace=apps/dfarm-customer-app test` | `8` suites, `31/31` passed | **PASS** |
| Collection App (Frontend) | `npm --workspace=apps/dfarm-collection-app test` | `17` files, `162/162` passed | **PASS** |
| Dairy Admin App (Frontend) | `npm --workspace=apps/dfarm-dairy-admin test` | `5` files, `14/14` passed | **PASS** |
| Super Admin App (Frontend) | `npm --workspace=apps/dfarm-super-admin test` | `10` files, `48/48` passed | **PASS** |
| Secret Pattern Scan (Changed Files) | Node regex scan across 17 edited/added files | `0` API keys / private keys / hardcoded SMS secrets (`supabase.co` matches only in host-rejection allowlist guards); `git ls-files .temp` = `0`, `.temp/` preserved | **PASS** |

*(13 offline backend suites verified `229/229`: `restart032-operational-repository-isolation` `16/16`, `restart03-tenant-isolation-and-ownership` `18/18`, `customer-data-lifecycle-e2e` `9/9`, `restart02-auth-security-remediation` `9/9`, `restart021-auth-session-integrity` `7/7`, `collection-kiosk-production` `24/24`, `customer-tenant-approval-e2e` `11/11`, `multi-dairy-membership` `9/9`, `tenant-database-isolation` `7/7`, `dairy-admin-production` `36/36`, `roadmap-phase-06-dairy-admin` `41/41`, `super-admin-production` `33/33`, `clean-architecture` `9/9`.)*

### 4.2 Gated / Blocked Real PostgreSQL 17 Suites

| Suite | Default Mode (No PG17) | `REQUIRE_REAL_POSTGRES=1` Mode | Live PG `17.12` Status |
|---|---|---|---|
| `restart03-real-postgres.test.js` | `tests=1 pass=0 fail=0 skip=1 exit=0` | `exit=1` (fail closed) | **BLOCKED (No host Docker/PG17)** |
| `restart032-real-postgres.test.js` | `tests=1 pass=0 fail=0 skip=1 exit=0` | `exit=1` (fail closed) | **BLOCKED (No host Docker/PG17)** |
| `restart033-real-postgres-repositories.test.js` | `tests=1 pass=0 fail=0 skip=1 exit=0` | `exit=1` (fail closed) | **BLOCKED (No host Docker/PG17)** |
| `customer-ledger-accounting.test.js` | `tests=1 pass=0 fail=0 skip=1 exit=0` | `exit=1` (fail closed) | **BLOCKED (No host Docker/PG17)** |
| `concurrent-idempotency-financial.test.js` | `tests=1 pass=0 fail=0 skip=1 exit=0` | `exit=1` (fail closed) | **BLOCKED (No host Docker/PG17)** |
| `prompt423-device-proof-and-signing-key-audit.test.js` | `tests=1 pass=0 fail=0 skip=1 exit=0` | *(PG-gated device proof audit)* | **SKIPPED (No host PG17)** |

*(Local `gitleaks` CLI is also unavailable on this host; full-history Gitleaks remediation remains open under `DF-003` pending operator-approved secret rotation and history rewrite.)*

---

## 5. Next Unblocking Step

1. Start Docker Desktop / PG17 locally and run with explicit disposable-cluster opt-in:
   ```bash
   NODE_ENV=test \
   DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1 \
   REQUIRE_REAL_POSTGRES=1 \
   TEST_POSTGRES_URL=postgresql://postgres:dfarm_verify_password@127.0.0.1:55432/dfarm_central \
   node scripts/ci-pg17-bootstrap.js && node scripts/ci-run-pg17-suites.js
   ```
   *(Or authorize commit/push to `fix/cloudflare-pages-production-deploy` so `.github/workflows/dfarm-restart03-postgres17.yml` runs all 5 suites against PostgreSQL 17 with `0` skips and `0` failures.)*
