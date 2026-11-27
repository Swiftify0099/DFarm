# DFARM RESTART-03.5 / 03.5A — Real PostgreSQL 17 Failure Remediation Report

## 1. Executive Summary & Classification

- **Repository:** `Swiftify0099/DFarm`
- **Branch:** `fix/cloudflare-pages-production-deploy`
- **Verified Public Remote HEAD:** `9d0568b32e117dc93d8c62389c482b5a77d68f40` (`RESTART-03.5A`, committed and pushed after `805326112c6daf0c902a3abbefc5be1a8f740023`)
- **Verified CI Evidence (`9d0568b`):**
  - **PostgreSQL 17 Workflow Run:** [`45943003261`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261) / Job [`140321315106`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261/job/140321315106) (`conclusion: success`) — Real PostgreSQL `17.12` executed build (`build:backend`), `db:validate`, compatibility role bootstrap, and all 5 PG17 suites: `44` passed, `0` failed, `0` skipped.
  - **Gitleaks Workflow Run:** [`45943003232`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003232) / Job [`140321315158`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003232/job/140321315158) (`conclusion: failure`) — Full-history scan reports `54` historical findings across `41` commits; no Gitleaks finding record was reported for current HEAD `9d0568b` (`DF-003` remains OPEN under `RESTART-12`).
- **Final Classification:** **`PASS (CI PostgreSQL 17 Gate Verified on `9d0568b`; Local Host Lacks Docker/PG17)`** — All 7 `RESTART-03.5A` failures (Fixes A–G) are committed at `9d0568b` and passed the real PostgreSQL `17.12` five-suite gate in GitHub Actions Run [`45943003261`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261) (`44` passed, `0` failed, `0` skipped), alongside local verification across TypeScript build (`build:backend`), DB manifest validation (`db:validate` `13/13`), DB package tests (`db:test` `22/22` offline), all `13` core offline backend suites (`230/230` subtests), and all `4` frontend workspaces (`31/31`, `162/162`, `14/14`, `48/48`). Local host PG17 execution remains unavailable when `com.docker.service` is stopped and native PG17 is absent, so live PG17 verification relies on GitHub Actions CI.
- **Workspace Safety Preserved:** Zero `git reset`, `git clean`, `git stash`, commit, push, force-push, rebase, branch switch, or deployments; `.temp/` preserved intact (`0` tracked files, `1,829` files on disk); already-applied migrations (`017`, `019`, `037`, `039`, `045`, `046`) untouched; additive migration `047` registered in both `MigrationRunner.ts` and `packages/database/src/index.ts`.

---

## 2. Historical & Latest CI Baselines

1. **Prior Run [`45935084366`](https://github.com/Swiftify0099/DFarm/actions/runs/45935084366) (`436b188`):** Exposed early `config/env.ts` evaluation (`ECONNREFUSED 127.0.0.1:54322`), uninjected `poolCtrl` adapter, brittle `045` regex, missing `organization_id` in `017` (`complete_milk_collection_session`), and `AccountAuthorityService` `m.customer_name` failure. Remediated in `8053261`.
2. **Latest Run [`45938275998`](https://github.com/Swiftify0099/DFarm/actions/runs/45938275998) (`8053261`):** Successfully executed real PostgreSQL `17.12` (`steps 1–8` passed), and failed in Step 9 (`Execute all five PostgreSQL 17 test suites and publish gate summary`) on the 7 root causes remediated in `RESTART-03.5A`.

---

## 3. RESTART-03.5A Failure Root Causes & Fixes Implemented

### Fix A — RESTART-03 Partial Unique Index Array Conversion
- **File:** [restart03-real-postgres.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart03-real-postgres.test.js)
- **Root Cause:** `a.attname` in `pg_attribute` has PostgreSQL type `name`, so `ARRAY(SELECT a.attname ...)` returned `name[]` which `node-postgres` (`pg`) serialized as raw string `"{organization_id,center_id,device_identifier}"` instead of a JavaScript array, and `indisvalid` / runtime `CLOSED`-session coexistence were not asserted.
- **Correction:**
  - Updated catalog query to select `i.indisvalid AS is_valid` and `array_to_json(ARRAY(SELECT a.attname::text ...)) AS columns`, plus added `normalizePgTextArray()` safe normalizer.
  - Preserved exact index name `uq_kiosk_shift_sessions_active_open`, `indisunique === true`, `indisvalid === true`, ordered columns `['organization_id', 'center_id', 'device_identifier']`, and `'OPEN'` predicate checks.
  - Added runtime verification in Test 3 confirming `CLOSED` sessions on the same `(organization_id, center_id, device_identifier)` do not collide with the `OPEN` session.
- **Migration `045`:** Untouched.

### Fix B — RESTART-03.2 Concurrency Pool Shutdown & DB Cleanup
- **File:** [restart032-real-postgres.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart032-real-postgres.test.js)
- **Root Cause:** Pool shutdown and `DROP DATABASE ... WITH (FORCE)` terminated connections while asynchronous pool sockets had not finished settling (`terminating connection due to administrator command`), and errors were masked with `.catch(() => {})`.
- **Correction:**
  - Added `assertDisposablePg17Cluster` preflight guard and attached explicit `pool.on('error', ...)` tracking across `adminPool`, `poolCtrl`, `poolA`, and `poolB` (failing the test if any background error occurs).
  - Removed error-swallowing `.catch(() => {})` on pool/DB cleanup; added `closePoolCleanly` waiting for `totalCount === idleCount && waitingCount === 0` before `await pool.end()`, and `waitForDbIdle` checking `pg_stat_activity` before `DROP DATABASE ... WITH (FORCE)`.
  - Preserved concurrent `FOR UPDATE` credit serialization (`120 + 80 = 200`).

### Fix C — Shift Session Zero-Valued Totals & Device Registry Error Handling
- **Files:**
  - [KioskShiftSession.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/domain/entities/KioskShiftSession.ts)
  - [PostgresShiftSessionRepository.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresShiftSessionRepository.ts)
  - [restart033-real-postgres-repositories.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart033-real-postgres-repositories.test.js)
- **Root Cause:**
  1. `KioskShiftSession` constructor did not initialize numeric totals (`totalLiters`, `cowLiters`, `buffaloLiters`, `transactionCount`, `totalAmount`, `averageFat`, `averageSnf`) to `0`, causing `NOT NULL` violation on `kiosk_shift_sessions.total_liters` and cascading failure in Test 4 (`activeSessA`).
  2. `PostgresShiftSessionRepository.checkRegisteredDevice` used an overly broad `catch (err)` that swallowed non-schema errors (e.g., connection/permission errors).
- **Correction:**
  - Made total properties optional in `KioskShiftSessionProps` and initialized all 7 numeric totals to `0` (safe against omitted or `undefined`/`null` values) in `KioskShiftSession` constructor without relaxing DB `NOT NULL` constraints.
  - Replaced the broad `catch` in `checkRegisteredDevice`: retries minimal projection on `42703` (`is_blocked`/`revoked_at` absent in minimal test doubles), permits missing `devices` (`42P01`) ONLY on the separate control-plane DB or offline non-PG mode (`REQUIRE_REAL_POSTGRES !== '1'`), and fails closed (`TenantDatabaseUnavailableError`) on real tenant schema/permission/connection errors.
  - Added assertions in `restart033` verifying zero-initialized totals and non-hidden device query errors.

### Fix D — Customer Authentication Must Query Tenant DB Strictly
- **Files:**
  - [AccountAuthorityService.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/AccountAuthorityService.ts)
  - [customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js)
  - Legacy `pg-mem` test fixtures aligned: [restart02-auth-security-remediation.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart02-auth-security-remediation.test.js), [restart021-auth-session-integrity.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart021-auth-session-integrity.test.js), [super-admin-production.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/super-admin-production.test.js)
- **Root Cause:** `AccountAuthorityService.verifyCustomer()` queried tenant-only `customers` on the control-plane `db` before resolving the tenant DB (`relation "customers" does not exist` -> false `503`), used raw `db` instead of `tenantDbManager.getControlPlaneDb()`, and silently returned `null` on wrong `organizationId` instead of rejecting mismatches with `403`.
- **Correction:**
  - Refactored `AccountAuthorityService` to use `tenantDbManager.getControlPlaneDb()` for control-plane lookups (`users`, `global_customer_identities`, `customer_dairy_memberships`, `organizations`) and **never** query `customers` on the control-plane DB.
  - Rejects mismatched `organizationId` or `globalCustomerId` claims with `403` (`TENANT_CONTEXT_MISMATCH` / `GLOBAL_IDENTITY_MISMATCH`), resolves tenant DB via `tenantDbManager.getStrictTenantDb(authoritativeOrgId)`, queries `customers` + `dairy_centers` inside the tenant DB, verifies center ownership, cross-plane org/global ID consistency, status, registration status, and deletion state, and fails closed on missing membership, missing tenant customer row, or DB outage (`503`).
  - Added PG17 Test 23 in `customer-ledger-accounting.test.js` covering all 8 required scenarios (valid customer auth, cross-customer ledger 403, wrong tenant ID 403, other-dairy customer 403, missing membership 401, suspended & soft-deleted 403, control-plane outage 503, tenant DB outage 503), plus offline verification in `restart032-operational-repository-isolation.test.js` Step 5d.

### Fix E — Membership Repository Schema Alignment (`037`)
- **Files:**
  - [PostgresCustomerMembershipRepository.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresCustomerMembershipRepository.ts)
  - [restart033-real-postgres-repositories.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart033-real-postgres-repositories.test.js)
- **Root Cause:** `PostgresCustomerMembershipRepository` queried/inserted/updated nonexistent `customer_name` on control-plane `customer_dairy_memberships` (`037` defines `dairy_name`, `dairy_code`, `dairy_address`, `center_name`, etc., but intentionally does NOT define `customer_name`).
- **Correction:**
  - Removed all `customer_name` SQL column references from `listMembershipsByGlobalId`, `findMembership`, `saveMembership`, and `updateMembershipStatus` without duplicating customer PII onto the control plane.
  - Added `resolveTenantCustomerNames()` to hydrate `CustomerMembership.customerName` from the authoritative tenant DB (`customers.full_name` scoped by `organization_id = $1 AND id IN (...) AND is_deleted = FALSE`) via `tenantDbManager.getStrictTenantDb(orgId)` when the tenant mapping is `ACTIVE` (leaving `null` if unavailable, never fabricating names).
  - Added PG17 Test 5 in `restart033-real-postgres-repositories.test.js` covering `037` column verification, global identity create/lookup, `saveMembership` insert/upsert, `listMembershipsByGlobalId`, `findMembership`, `updateMembershipStatus`, and cross-tenant isolation.

### Fix F — Advance Response Contract (`balanceAfter` + `newBalance`)
- **Files:**
  - [047_advance_response_contract_balanceAfter.sql](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/047_advance_response_contract_balanceAfter.sql) *(additive `TENANT_OPERATIONAL` migration; `019` untouched)*
  - [MigrationRunner.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/MigrationRunner.ts)
  - [packages/database/src/index.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/index.ts)
  - [customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js)
- **Root Cause:** `public.post_customer_advance(...)` in `019` returned `newBalance` on new execution and `balanceAfter` on idempotent replay, leaving `data.balanceAfter` undefined (`NaN`) on initial disbursement.
- **Correction:** Created additive migration `047` returning **both** `balanceAfter` and `newBalance` consistently on both new-execution and idempotent-replay paths without altering arithmetic or editing `019` in place. Expanded Test 2 in `customer-ledger-accounting.test.js` to assert initial disbursement, idempotent replay, `previousBalance`, `newBalance`, `balanceAfter`, `ledger_transactions`, and balanced `ledger_entries`.

### Fix G — Signed Customer Ledger Balance & Reconciliation Discrepancy
- **Files:**
  - [value-objects/index.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/domain/value-objects/index.ts)
  - [CustomerLedgerAccount.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/domain/entities/CustomerLedgerAccount.ts)
  - [PostgresLedgerRepository.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts)
  - [customer-ledger-accounting.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/customer-ledger-accounting.test.js)
- **Root Cause:**
  1. `CustomerLedgerAccount.postDebit()` wrapped `this.props.currentBalance - debit` in `Money`, which forbids negative numbers, whereas a farmer's running ledger balance can legitimately be negative (`100 - 750 = -650`, farmer owes dairy).
  2. `PostgresLedgerRepository.appendEntry()` ignored `params.sourceModule` (e.g., `'MANUAL_ADJUSTMENT'` from `POST /api/v1/ledger/adjustment` in Test 12) and hardcoded `transactionType = 'MILK_COLLECTION_CREDIT'` and `referenceEntity = 'MILK_COLLECTION'` pointing to `accountId`. Consequently, `reconcile_customer_ledger` Check 3 flagged Test 12's manual adjustment as an `ORPHAN_TRANSACTION` (`isReconciled: false`).
- **Correction:**
  - Added `LedgerBalance` value object in `value-objects/index.ts` (allows signed finite numbers rounded via `roundHalfUp(..., 2)` while keeping `Money` strictly non-negative for transaction amounts). Updated `CustomerLedgerAccount.postCredit()` / `postDebit()` to use `Money` for transaction amounts and `LedgerBalance` for running balances.
  - Updated `PostgresLedgerRepository.appendEntry()` to map `sourceModule: 'MANUAL_ADJUSTMENT'` -> `LEDGER_ADJUSTMENT_CREDIT`/`LEDGER_ADJUSTMENT_DEBIT` + `referenceEntity: 'MANUAL_ADJUSTMENT'` (compatible with both `009` and `019`), eliminating false `ORPHAN_TRANSACTION` discrepancies without mutating reconciliation balances.
  - Enhanced Test 17 in `customer-ledger-accounting.test.js` with full JSON diagnostics, summary net credit/debit parity, and balanced journal checks while preserving Test 18 mismatch detection.

---

## 4. Verification Matrix (Post-Final Edit)

| Check | Scope / Command | Observed Result | Status |
|---|---|---|---|
| TypeScript Build | `npm run build:backend` | Exited `0` | **PASS** |
| Static DB Validator | `npm run db:validate` | `13/13` checks passed, exit `0` | **PASS** |
| DB Package Tests | `npm run db:test` | `22/22` passed across `3` suites (internal PG suite 2 skipped), exit `0` | **PASS (PG skipped)** |
| 13 Core Backend Offline Suites | `NODE_ENV=test TENANT_POOL_CONNECTION_TIMEOUT_MS=500` across 13 suites | `230/230` subtests passed (`0` fail, `0` skip, `EXIT=0` each) | **PASS** |
| Customer App (Frontend) | `npm --workspace=apps/dfarm-customer-app test` | `8` suites, `31/31` passed, exit `0` | **PASS** |
| Collection App (Frontend) | `npm --workspace=apps/dfarm-collection-app test` | `17` files, `162/162` passed, exit `0` | **PASS** |
| Dairy Admin App (Frontend) | `npm --workspace=apps/dfarm-dairy-admin test` | `5` files, `14/14` passed, exit `0` | **PASS** |
| Super Admin App (Frontend) | `npm --workspace=apps/dfarm-super-admin test` | `10` files, `48/48` passed, exit `0` | **PASS** |
| PG17 Gate (Default / No Host PG17) | 5 PG17 suites without `TEST_POSTGRES_URL` | All 5 cleanly `SKIP` (`tests=1 pass=0 fail=0 skipped=1 exit=0`) | **SKIPPED (No Host PG17)** |
| PG17 Gate (`REQUIRE_REAL_POSTGRES=1`, No Host PG17) | 5 PG17 suites with `REQUIRE_REAL_POSTGRES=1` | All 5 fail closed (`tests=1 pass=0 fail=1 skipped=0 exit=1`) | **FAIL-CLOSED VERIFIED** |
| Secret Hygiene & `.temp/` Integrity | Regex scan across `18` edited/added source/test/migration files; `git ls-files .temp` | `0` new secret literals (`1` pre-existing negative assertion in `restart02`); `.temp/` tracked=`0`, `1,829` files preserved | **PASS** |
| Live PostgreSQL `17.12` 5-Suite Gate (CI `9d0568b`) | GitHub Actions Run [`45943003261`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261) / Job [`140321315106`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261/job/140321315106) | Build, `db:validate`, bootstrap, and all 5 suites passed: `44` passed, `0` failed, `0` skipped | **PASS** |

*(13 core offline backend suites `230/230`: `restart032-operational-repository-isolation` `17/17`, `restart03-tenant-isolation-and-ownership` `18/18`, `customer-data-lifecycle-e2e` `9/9`, `restart02-auth-security-remediation` `9/9`, `restart021-auth-session-integrity` `7/7`, `collection-kiosk-production` `24/24`, `customer-tenant-approval-e2e` `11/11`, `multi-dairy-membership` `9/9`, `tenant-database-isolation` `7/7`, `dairy-admin-production` `36/36`, `roadmap-phase-06-dairy-admin` `41/41`, `super-admin-production` `33/33`, `clean-architecture` `9/9`.)*

---

## 5. Status After CI Verification (`9d0568b`)

1. **`DF-030` (VERIFIED — 5-Suite PG17 Gate Passed):** GitHub Actions Run [`45943003261`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003261) (`9d0568b`) executed real PostgreSQL `17.12` and passed all 5 suites (`44` passed, `0` failed, `0` skipped); subject to additional coverage tracks (`RESTART-04`..`11`).
2. **`DF-016` (PARTIAL):** Fixes A–G verified on PG `17.12`, while other tenant integrity issues (e.g., `SyncService`, outbox, Union Bank) remain tracked under `RESTART-04`..`10`.
3. **`DF-003` (OPEN — Separate Track):** Gitleaks Run [`45943003232`](https://github.com/Swiftify0099/DFarm/actions/runs/45943003232) reports `54` historical findings across `41` commits (no finding record reported for current HEAD `9d0568b`); remains separately tracked under `DF-003` / `RESTART-12`.
