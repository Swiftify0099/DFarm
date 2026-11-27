# DFARM RESTART-03.4 — PostgreSQL 17 CI Bootstrap Report

> [!NOTE]
> **Updated in RESTART-03.5:** GitHub Actions Run [`45935084366`](https://github.com/Swiftify0099/DFarm/actions/runs/45935084366) / Job [`140296326116`](https://github.com/Swiftify0099/DFarm/actions/runs/45935084366/job/140296326116) on `436b18835324ab754d10bb58d8b91931dc6cf214` confirmed RESTART-03.4's CI role bootstrap (`postgres`, `anon`, `authenticated`, `service_role`) succeeded on PG `17.12` (`server_version_num=170012`). Subsequent suite failures and RESTART-03.5 disposable-cluster safety hardening (`DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS=1`) are documented in [DFARM_RESTART_03_5_REAL_POSTGRES17_FAILURE_REMEDIATION_REPORT.md](./DFARM_RESTART_03_5_REAL_POSTGRES17_FAILURE_REMEDIATION_REPORT.md).

## 1. Executive Summary & Classification

- **Repository:** `Swiftify0099/DFarm` (`fix/cloudflare-pages-production-deploy`)
- **Verified Public Remote HEAD & Local Base HEAD:** `6c0bfc75ac61b6e70a4c72fbf380de5bfc8b436f` (`feat: implement RESTART-03.3 postgres 17 repository verification and CI workflow`; local has uncommitted RESTART-03.4 fixes)
- **Previous Failed Run:** GitHub Actions Run [`45931087287`](https://github.com/Swiftify0099/DFarm/actions/runs/45931087287) (Job [`140283621857`](https://github.com/Swiftify0099/DFarm/actions/runs/45931087287/job/140283621857))
- **Classification:** `BLOCKED — REQUIRED POSTGRESQL CI OR OPERATOR APPROVAL DEPENDENCY UNAVAILABLE` (CI bootstrap and workflow fixes are implemented and verified locally for fail-closed behavior, but local PG17/Docker is unavailable and no commit/push is authorized to execute the repaired workflow on GitHub Actions)

---

## 2. Root Cause Analysis

In GitHub Actions Run `45931087287`:
- Checkout, Node.js 20 setup, `npm ci`, `npm run build:backend`, and `npm run db:validate` all succeeded.
- Step 8 (`Run RESTART-03 real PostgreSQL 17 isolation suite`) failed (`EXIT=1`) and caused steps 9–12 (the remaining 4 PG17 suites) to be skipped by GitHub Actions.
- **Confirmed PostgreSQL Error:** `SQLSTATE 42704: role "postgres" does not exist`.
- **Why it happened:**
  1. `.github/workflows/dfarm-restart03-postgres17.yml` initialized `postgres:17-alpine` with `POSTGRES_USER: dfarm_verify` and `TEST_POSTGRES_URL: postgresql://dfarm_verify:...@127.0.0.1:55432/dfarm_central`.
  2. `supabase/migrations/001_extensions_and_common.sql` (and `011`, `012`, `015`, `017`, `018`, `019`, `024`, `025`, `026`) explicitly execute `ALTER FUNCTION ... OWNER TO postgres;` and `GRANT ... TO authenticated, anon, service_role;`.
  3. `supabase/migrations/010_devices_sync_and_audit.sql`, `020`, `021`, `022`, `023`, and `044` execute `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;`, `GRANT ... TO authenticated;`, `GRANT ALL ... TO service_role;`, and `CREATE POLICY ... TO authenticated / service_role / PUBLIC;`.
  4. A stock `postgres:17-alpine` container initialized with `POSTGRES_USER: dfarm_verify` creates only `dfarm_verify` (not `postgres`, `anon`, `authenticated`, or `service_role`).

---

## 3. SQL Role Audit Across All 46 Migration Files

Every `.sql` file in `supabase/migrations/` (`001`–`045`, `46` files) was audited for `OWNER TO`, `GRANT`, `REVOKE`, `CREATE POLICY`, and `ALTER DEFAULT PRIVILEGES` targets:

| Role Name | Referenced In Migrations | Required In CI Cluster? | CI Bootstrap Attributes |
| :--- | :--- | :---: | :--- |
| `postgres` | `001`, `011`, `012`, `015`, `017`, `018`, `019`, `024`, `025`, `026` (`ALTER FUNCTION ... OWNER TO postgres`) | **Yes** | Container `POSTGRES_USER: postgres` (`SUPERUSER`, `CREATEDB`, `LOGIN`, `BYPASSRLS`) |
| `anon` | `001` (`GRANT EXECUTE`), `010` (`REVOKE ALL ON ALL TABLES ... FROM anon`) | **Yes** | `NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS` |
| `authenticated` | `001`, `010`, `011`, `012`, `015`, `017`–`026` (`GRANT`, `CREATE POLICY ... TO authenticated`) | **Yes** | `NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS` |
| `service_role` | `001`, `010`, `011`, `012`, `015`, `017`–`026` (`GRANT`, `CREATE POLICY ... TO service_role`) | **Yes** | `NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER BYPASSRLS` |
| `PUBLIC` | `001`, `044` (`REVOKE ... FROM PUBLIC`, `CREATE POLICY ... TO PUBLIC`) | Built-in | Built-in PostgreSQL pseudo-role |

No other cluster roles (`authenticator`, `supabase_admin`, etc.) are required by the active migration manifest. `MigrationRunner.ensureSchemaMigrationsTable()` also creates `auth.uid()` and `supabase_migrations.schema_migrations` cleanly per database.

---

## 4. Exact Changes Implemented (Old vs New Behavior)

### Files Created / Changed
- **Created:** [`scripts/ci-pg17-bootstrap.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-pg17-bootstrap.js)
- **Created:** [`scripts/ci-run-pg17-suites.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/scripts/ci-run-pg17-suites.js)
- **Modified:** [`.github/workflows/dfarm-restart03-postgres17.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart03-postgres17.yml)
- **Modified:** [`docker-compose.pg17-verify.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docker-compose.pg17-verify.yml)
- **Unchanged (Production Preserved):** `supabase/migrations/001_extensions_and_common.sql` and all `001`–`045` migrations remain unmodified.

### Old vs New Behavior
- **Old Behavior:**
  - `postgres17` service ran as `POSTGRES_USER: dfarm_verify` with no `postgres`, `anon`, `authenticated`, or `service_role` roles.
  - Workflow ran 5 sequential `run: node --test ...` steps; when step 8 failed on role `"postgres"`, steps 9–12 were skipped without running.
- **New Behavior:**
  - `postgres17` disposable CI service runs with `POSTGRES_USER: postgres`, `POSTGRES_PASSWORD: placeholder_ci_pg17_test_password`, `POSTGRES_DB: dfarm_central`, and `TEST_POSTGRES_URL` pointing to `127.0.0.1:55432/dfarm_central`.
  - Step `Bootstrap and validate PostgreSQL 17 compatibility roles` runs `node scripts/ci-pg17-bootstrap.js`, which:
    1. Refuses execution if `NODE_ENV === 'production'` or host is not disposable (`127.0.0.1`, `localhost`, `postgres`, `postgres17`).
    2. Verifies `server_version_num` is `170000..179999` (PostgreSQL 17.x).
    3. Verifies `postgres` superuser/createdb role exists.
    4. Idempotently creates/enforces `anon`, `authenticated`, and `service_role` with minimal Supabase-compatible attributes (no `SUPERUSER` on application/service roles).
    5. Prints role names and boolean attributes only (never credentials).
    6. Creates, connects to, and drops a disposable probe database (`dfarm_bootstrap_probe_<hex>`) to prove DB create/drop privileges.
  - Step `Execute all five PostgreSQL 17 test suites and publish gate summary` runs `node scripts/ci-run-pg17-suites.js`, which executes all 5 suites independently under `REQUIRE_REAL_POSTGRES=1`, checks `170000 <= server_version_num < 180000`, rejects any `pg-mem` fallback, skip, zero-test run, or non-zero exit code, writes per-suite counts to `$GITHUB_STEP_SUMMARY`, and fails closed (`EXIT=1`) if any suite fails or skips.

---

## 5. Verification Evidence & Remaining Blockers

- **Local Fail-Closed Checks Observed:**
  - `node scripts/ci-pg17-bootstrap.js` (with `TEST_POSTGRES_URL` unset): `EXIT=1` (`ERROR: TEST_POSTGRES_URL is required for CI PostgreSQL 17 role bootstrap.`)
  - `node scripts/ci-run-pg17-suites.js` (with `TEST_POSTGRES_URL` unset): `EXIT=1` (`CI PostgreSQL 17 runner error: TEST_POSTGRES_URL must be set for PG17 suite gate.`)
- **Gitleaks Check on Updated Workflow & Scripts:** `0` Gitleaks findings on `.github/workflows/dfarm-restart03-postgres17.yml`, `docker-compose.pg17-verify.yml`, `scripts/ci-pg17-bootstrap.js`, and `scripts/ci-run-pg17-suites.js`.
- **Host / CI Blocker:** Local workstation has no native PostgreSQL (`postgres`/`pg_ctl`/`psql` absent) and Docker Desktop Linux engine (`com.docker.service` Stopped, `npipe:////./pipe/dockerDesktopLinuxEngine` absent) is not running; changes are uncommitted/unpushed per RESTART-03.4 rules (`No commit`, `No push`).
