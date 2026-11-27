# DFarm RESTART-03.1 — Regression Failure Triage Report

**Audit Phase:** `RESTART-03.1`  
**Date:** `2026-11-26`  
**Baseline Comparisons:** `DFARM_RESTART_01_TEST_BASELINE_MATRIX.md` & remote `2c15eabff12dfe1cae94c4c4bd09d364ceb106a1`  
**Conclusion:** **Zero** of the `6` failing suites were caused by `RESTART-03` or `RESTART-03.1` isolation/ownership changes. All failures trace to `RESTART-01` pre-existing unmounted routes (`DF-018`), `DF-007` `/push` shadowing (explicitly deferred to `RESTART-04`), `DF-030` offline PG absence, a pre-existing SQL parameter bug in `PostgresCollectionTransactionRepository.save()`, or legacy test fixtures violating `RESTART-02`/`02.1` auth & OTP security (`DF-001`, `DF-004`, `DF-009`).

---

## Summary Table

| # | Test File | RESTART-01 Baseline | Current Observed (`task-691`) | Root Cause Category | Caused by RESTART-03? | Fix Target |
| :---: | :--- | :---: | :---: | :--- | :---: | :--- |
| 1 | `customer-data-lifecycle-e2e.test.js` | `4 pass / 5 fail` | `2 pass / 7 fail` (`EXIT=1`) | Static OTP `123456` rejected (`DF-004`), unseeded synthetic `superAdminToken` (`DF-009`), pre-existing `PostgresCollectionTransactionRepository.save()` `LITERS` param shift | **No** | Test fixtures (`RESTART-02/03`) + `PostgresCollectionTransactionRepository.save()` (`RESTART-06`) |
| 2 | `offline-sync-22-scenarios.test.js` | `10 pass / 13 fail` | `10 pass / 13 fail` (`EXIT=1`) | Unmounted `/api/v1/devices/register` (`DF-018`), `/sync/push` route shadowing (`DF-007`), duplicate `pool.end()` cleanup | **No** | `RESTART-04` (`DF-007`, `DF-018`) |
| 3 | `roadmap-phase-07-dairy-admin.test.js` | `37 pass / 4 fail` | `37 pass / 4 fail` (`EXIT=1`) | Group E (`19`, `20`) calls unmounted `POST /api/v1/devices/:id/{mapping,calibration}` (`404`, `DF-018`) | **No** | `RESTART-04` (`DF-018`) |
| 4 | `customer-app-production.test.js` | `37 pass / 5 fail` | `26 pass / 16 fail` (`EXIT=1`) | `testAdminA` (`00000000-...01`) omitted from `users` table -> `401` in `AccountAuthorityService` (`DF-009`); `pg-mem` AST rejection on `feed_categories` DDL | **No** | Test fixture user seeding + `feed_categories` DDL / real PG (`DF-025`, `DF-030`) |
| 5 | `customer-lifecycle-security.test.js` | `0 pass / 1 fail` | `0 pass / 1 fail` (`EXIT=1`) | Direct `new pg.Client({ connectionString: DATABASE_URL })` connect at L18 -> `ECONNREFUSED 127.0.0.1:59999` (`DF-030`) | **No** | Real PG (`DF-030`, `RESTART-11`) |
| 6 | `customer-face-api-404-network-fix.test.js` | `34 pass / 4 fail` | `9 pass / 29 fail` (`EXIT=1`) | Subtest `0` calls `/customers/register` without OTP proof (`401`, `DF-004`) & omits `dairyAdminAToken`/`operatorAToken` DB users (`DF-009`), leaving `customerAId = ''` and triggering `401`/`403 TENANT_CONTEXT_MISMATCH` in 28 downstream tests | **No** | Test fixture OTP proof & user seeding |

---

## Detailed Per-Suite Diagnosis

### 1. `services/backend/tests/customer-data-lifecycle-e2e.test.js` (`2 pass / 7 fail`)
- **Step 2 (`400 !== 200`):** Sends hardcoded static OTP `'123456'` to `/api/v1/auth/customer/verify-otp` without calling `/request-otp`, rejected by RESTART-02 dynamic OTP validation (`DF-004`).
- **Steps 3, 5, 7, 8 (`401`):** `customerTokenDairyA` is empty because Step 2 failed; Step 8 uses synthetic `superAdminToken` (`00000000-...99`) not inserted into `users`, rejected by RESTART-02.1 `AccountAuthorityService` (`DF-009`).
- **Step 6 (`invalid input syntax for float: LITERS`):** Pre-existing bug in [PostgresCollectionTransactionRepository.ts:156-168](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresCollectionTransactionRepository.ts#L156-L168) (`save()`), verified identically present at `2c15eab`: column list lists `(..., milk_category, net_weight, measurement_unit, ...)` (`$8, $9, 'LITERS'`) while `VALUES` passes `($8, 'LITERS', $9, ...)` putting `'LITERS'` into `net_weight` (float/numeric). Note `MilkIntakeUseCases` & `saveBatch` (`L468`) do not share that shift.
- **Step 9 (`organizations` PK violation):** Because Step 8 failed (`401`), Dairy A was not purged before re-inserting `dairyAId`.

### 2. `services/backend/tests/offline-sync-22-scenarios.test.js` (`10 pass / 13 fail`)
- Identical pass/fail counts to `RESTART-01` (`10/23`).
- **Scenario 0 (`404 !== 200`):** Calls `POST /api/v1/devices/register`, unmounted in `cleanApiRouter` (`DF-018`).
- **Scenarios 4–12 (`401 !== 200`):** Calls `POST /api/v1/sync/push`, intercepted by [sync.routes.ts:137](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/sync.routes.ts#L137) before `syncRouter` (`DF-007`, intentionally left for `RESTART-04`) with unprovisioned/empty `deviceToken`.
- **Scenarios 13–21 & cleanup:** Downstream `404` on unmounted endpoints + `Called end on pool more than once` in `after()` hook (`L22-L24`).

### 3. `services/backend/tests/roadmap-phase-07-dairy-admin.test.js` (`37 pass / 4 fail`)
- Identical pass/fail counts to `RESTART-01` (`37/41`).
- **Group E (`19`, `20`):** Requests `POST /api/v1/devices/KIOSK_MAIN_01/mapping` and `POST /api/v1/devices/KIOSK_MAIN_01/calibration`, which are unmounted (`404`, `DF-018`, `RESTART-04`).

### 4. `services/backend/tests/customer-app-production.test.js` (`26 pass / 16 fail`)
- **Groups A & B (`1`–`6`) + Subtest `7` (`POST /customers/register`):** **ALL PASS**, proving RESTART-03 customer registration with `guestAccessToken` + active org/center works cleanly.
- **Subtests `8`–`15`, `17`:** Test seeds `operator_vikas` (`...03`) and `operator_ramesh` (`...04`) at `L75-79`, but **never inserts `testAdminA` (`00000000-...01`)** used by `adminTokenA`. RESTART-02.1 `AccountAuthorityService` rejects `adminTokenA` with `401` on `GET /status`, `POST /collections/intake`, and `PATCH /approve` (`Subtest 10`), leaving Customer A unapproved and cascading into `Subtests 11`–`15, 17`.
- **Subtest `21`:** `pg-mem` rejects inline `status VARCHAR(20) DEFAULT 'ACTIVE'` on test-local `CREATE TABLE IF NOT EXISTS feed_categories` (`L83-89`), leaving `feed_products` empty (`DF-025`).

### 5. `services/backend/tests/customer-lifecycle-security.test.js` (`0 pass / 1 fail`)
- Identical to `RESTART-01` (`0/1`). Lines `9-18` instantiate a raw `pg.Client` against `DATABASE_URL` (`127.0.0.1:59999`), failing immediately with `ECONNREFUSED` (`DF-030`).

### 6. `services/backend/tests/customer-face-api-404-network-fix.test.js` (`9 pass / 29 fail`)
- **Subtests `1`–`7` (CORS):** **ALL PASS**.
- **Subtest `0` (`401 !== 201`):** Sends unauthenticated `POST /api/v1/customers/register` without OTP/registration proof token (`DF-004` / `RESTART-02.1`) and creates synthetic tokens (`dairyAdminAToken`, `operatorAToken`) without inserting those users into `users` (`DF-009`).
- Because Subtest `0` fails before assigning `customerAId` / `customerBId` / `customerAToken`, Subtests `8`–`36` fail with `401`, empty UUID `customer_id = ''` queries, or `403 TENANT_CONTEXT_MISMATCH` on synthetic `operatorAToken`.
