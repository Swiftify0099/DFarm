# DFARM RESTART-03.3 — PostgreSQL 17 CI Workflow Report

## 1. Executive Summary & Classification

- **Repository:** `Swiftify0099/DFarm` (`fix/cloudflare-pages-production-deploy`, verified base HEAD `ea8bf416136afab9cc692edde7394827d1d96081`)
- **Workflow File Created:** `.github/workflows/dfarm-restart03-postgres17.yml`
- **CI Workflow Status:** `CI PREPARED — NOT EXECUTED` (created locally; not committed or pushed per RESTART-03.3 constraints).
- **Overall Phase Classification:** `PARTIAL — SOURCE FIXES VERIFIED BUT REAL POSTGRESQL OR REQUIRED REGRESSION GATES REMAIN`

---

## 2. Root Cause & Files Changed

### Root Cause
Previously, the repository contained only `.github/workflows/secret-scan.yml` and `docker-compose.pg17-verify.yml`, with no executable GitHub Actions workflow running real PostgreSQL 17 repository integration, ledger concurrency, or database-per-dairy isolation suites with non-skipping enforcement.

### Files Changed / Created
- `.github/workflows/dfarm-restart03-postgres17.yml` (Created)
- `services/backend/tests/restart033-real-postgres-repositories.test.js` (Created)
- `services/backend/tests/restart03-real-postgres.test.js` (Modified — added `REQUIRE_REAL_POSTGRES=1` fail guard)
- `services/backend/tests/restart032-real-postgres.test.js` (Modified — added `REQUIRE_REAL_POSTGRES=1` fail guard)
- `services/backend/tests/customer-ledger-accounting.test.js` (Modified — isolated 3-DB setup, explicit `TEST_POSTGRES_URL`, `REQUIRE_REAL_POSTGRES=1` fail guard)
- `services/backend/tests/concurrent-idempotency-financial.test.js` (Modified — isolated 3-DB setup via `MigrationRunner` + `TenantDatabaseManager`, explicit `TEST_POSTGRES_URL`, `REQUIRE_REAL_POSTGRES=1` fail guard)

---

## 3. Workflow Design: Old vs New Behavior

- **Old Behavior:**
  - Real PostgreSQL verification depended on manual execution with local Docker (`docker-compose.pg17-verify.yml`) and allowed suites to skip silently when PostgreSQL was unreachable.
- **New Behavior:**
  - `.github/workflows/dfarm-restart03-postgres17.yml` defines a dedicated GitHub Actions gate with minimal token permissions (`permissions: contents: read`) and a PostgreSQL 17 service container.
  - The workflow runs:
    1. `npm run build:backend`
    2. `npm run db:validate`
    3. All 5 real PostgreSQL 17 integration suites under `REQUIRE_REAL_POSTGRES: "1"` and explicit `TEST_POSTGRES_URL`:
       - `services/backend/tests/restart03-real-postgres.test.js`
       - `services/backend/tests/restart032-real-postgres.test.js`
       - `services/backend/tests/restart033-real-postgres-repositories.test.js`
       - `services/backend/tests/customer-ledger-accounting.test.js`
       - `services/backend/tests/concurrent-idempotency-financial.test.js`

---

## 4. Database Ownership, Actor/Org Context, Idempotency & Concurrency in CI

- All 5 PG17 suites provision fresh ephemeral control-plane and tenant databases against the CI PostgreSQL 17 service container via explicit `TEST_POSTGRES_URL` (never connecting to a production database or silently inheriting `DATABASE_URL`).
- Actual DFarm repository implementations (`PostgresLedgerRepository`, `PostgresShiftSessionRepository`, `PostgresCollectionTransactionRepository`) are exercised end-to-end with `MigrationRunner` and `TenantDatabaseManager.getStrictTenantDb`.
- `PostgresLedgerRepository.save()` enforces actor (`options.operatorId` UUID when `newEntry` is present), locks accounts (`FOR UPDATE` + `ON CONFLICT (customer_id) DO UPDATE`), re-checks idempotency inside the transaction after lock acquisition, and updates balances atomically from locked DB state.
- `REQUIRE_REAL_POSTGRES: "1"` guarantees fail-closed behavior if PostgreSQL 17 fails to start or cannot be reached (`EXIT=1` instead of silent pass/skip).

---

## 5. Excluded Legacy Suite Rationale

- `services/backend/tests/customer-lifecycle-security.test.js` is intentionally excluded from `.github/workflows/dfarm-restart03-postgres17.yml`:
  - It fails `0/11` (`11` fail, `EXIT=1`) because it depends on the removed legacy `/api/v1/auth/login` route (`DF-001` / `DF-004` / `DF-018`), which is already documented and tracked separately in `DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`.
- `services/backend/tests/offline-sync-22-scenarios.test.js` is similarly triaged for open `DF-007` / `DF-018` findings (`10/23` pass, `13` fail, `EXIT=1`) and tracked separately from the PG17 repository isolation gate.

---

## 6. SQL & Migrations Validation

- `npm run db:validate` is included in the workflow and verified locally after final edits: `13/13` PASS, `0` fail, `0` skipped (`EXIT=0`).
- `031` prefix duplication and `040_device_auth_challenges.sql` tier mismatch (`CONTROL_PLANE` in `packages/database/src/index.ts` vs `SHARED` in `MigrationRunner.ts`) remain tracked as open `DF-020`.

---

## 7. Exact Commands & Observed Fail-Closed Proof

| Command | Outcome | Observed Result |
| :--- | :--- | :--- |
| `npm run build:backend` | Passed | `EXIT=0` |
| `npm run db:validate` | Passed | `13/13` PASS, `0` fail, `0` skipped, `EXIT=0` |
| `node --test services/backend/tests/restart033-real-postgres-repositories.test.js` (no PG17, default) | Skipped | `0/1` (`skipped 1`, `EXIT=0`) |
| `REQUIRE_REAL_POSTGRES=1` on `restart033-real-postgres-repositories.test.js` (no PG17) | Failed closed (`GATE_EXIT=1`) | `0/1`, `fail 1`, `EXIT=1` |
| GitHub Actions execution of `.github/workflows/dfarm-restart03-postgres17.yml` | Not executed | `CI PREPARED — NOT EXECUTED` (local-only uncommitted workflow file) |

---

## 8. Local vs Remote State, Blockers & Next Phase Dependency

- **Local vs Remote State:** `.github/workflows/dfarm-restart03-postgres17.yml` exists locally as an untracked file; remote `origin/fix/cloudflare-pages-production-deploy` at `ea8bf416136afab9cc692edde7394827d1d96081` does not contain it yet.
- **Blockers:** Host lacks both `psql`/`pg_ctl` and a running Docker Linux daemon; workflow has not been pushed to trigger GitHub Actions.
- **Next Phase Dependency:** Push changes (when authorized) or run the exact `REQUIRE_REAL_POSTGRES=1` PG17 gate against PostgreSQL 17 and verify green execution of all 5 suites before starting RESTART-04.
