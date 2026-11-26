# DFARM RESTART-03 — Test & PostgreSQL Verification Matrix

**Generated:** `2026-11-26`  
**Branch:** `fix/cloudflare-pages-production-deploy` (Baseline HEAD: `2c15eabff12dfe1cae94c4c4bd09d364ceb106a1`)  
**Classification:** **PARTIAL — REAL POSTGRESQL VERIFICATION BLOCKED**

---

## 1. Environment & PostgreSQL 17 Readiness Check

| Target | Observed Status | Evidence |
| :--- | :--- | :--- |
| Local PostgreSQL (`127.0.0.1:5432`) | **Closed (`False`)** | `Test-NetConnection 127.0.0.1 5432` -> `False` |
| Local Supabase PG (`127.0.0.1:54322`) | **Closed (`False`)** | `Test-NetConnection 127.0.0.1 54322` -> `False` |
| Docker Desktop Linux Engine (`docker.exe info`) | **Unavailable (`500`)** | `http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.54/info` returned `500 Internal Server Error` |
| Isolated PG 17 Compose Runner | **Created** | [`docker-compose.pg17-verify.yml`](file:///C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docker-compose.pg17-verify.yml) + [`restart03-real-postgres.test.js`](file:///C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart03-real-postgres.test.js) |
| Real PostgreSQL 17 Suite Run | **BLOCKED / SKIP (`NOT RUN`)** | `TEST_POSTGRES_URL` unset/unreachable; no `pg-mem` fallback allowed in real PG suite. |

---

## 2. Build, Schema & Frontend Gates

| Check / Workspace | Command | Result | Observed Counts |
| :--- | :--- | :---: | :--- |
| Monorepo Backend & Shared TypeScript Build | `npm run build --workspace=@dfarm/database` & `npm run build:backend` | **PASS** | `0` errors across `@dfarm/shared-types`, `@dfarm/shared-validation`, `@dfarm/database`, `@dfarm/backend` |
| Database Static Validation | `npm run db:validate` | **PASS** | `13/13` tests pass |
| Database Runtime Verification (`@dfarm/database`) | `npm run db:test` | **PASS (Offline PG SKIP)** | `22/22` pass, `1` real PG suite `# SKIP` |
| Customer Mobile/Web Typecheck | `npm exec --workspace=apps/dfarm-customer-app -- tsc --noEmit` | **PASS** | `0` errors |
| Customer App Unit/Contract Tests | `npm run test --workspace=apps/dfarm-customer-app` | **PASS** | `8` suites, `31/31` tests pass |
| Collection App Tests | `npm run test --workspace=apps/dfarm-collection-app` | **PASS** | `17` files, `162/162` tests pass |
| Dairy Admin App Tests | `npm run test --workspace=apps/dfarm-dairy-admin` | **PASS** | `5` files, `14/14` tests pass |
| Super Admin App Tests | `npm run test --workspace=apps/dfarm-super-admin` | **PASS** | `10` files, `48/48` tests pass |

**Frontend Aggregate:** `255 / 255` passing tests across all 4 apps (`0` failures).

---

## 3. Backend Offline Test Suites (Executed Under `NODE_ENV=test` with `pg-mem` Doubles)

Combined verification run across 21 backend test files exited `0` (`# tests 294`, `# pass 293`, `# fail 0`, `# skipped 1` for real PG):

| Test File | Result | Breakdown / Notes |
| :--- | :---: | :--- |
| `services/backend/tests/restart03-tenant-isolation-and-ownership.test.js` | **PASS** | All `15/15` TAP test/subtest items pass (`6A` Shift Session Isolation & Concurrency, `6B` Customer Registration DB Ownership, `6C` Sync Tenant Context) |
| `services/backend/tests/collection-kiosk-production.test.js` | **PASS** | `GROUP A`–`F` pass after seed role alignment (`DAIRY_ADMIN` + `PRIMARY_DAIRY_ADMIN`) |
| `services/backend/tests/collection-operator-authorization-fix.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/customer-tenant-approval-e2e.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/face-biometric-and-search-e2e.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/customer-face-biometrics-update-resolution.test.js` | **PASS** | All subtests pass (updated Test 3 to enforce `404` on unregistered guests per `DF-015`) |
| `services/backend/tests/restart02-auth-security-remediation.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/restart021-auth-session-integrity.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/tenant-database-isolation.test.js` | **PASS** | All subtests (`Test A`–`Test F`) pass |
| `services/backend/tests/multi-dairy-membership.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/dairy-admin-production.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/super-admin-production.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/super-admin-tenant-database-control.test.js` | **PASS** | All `7/7` subtests pass |
| `services/backend/tests/clean-architecture.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/dairy-activation-workflow.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/dairy-location.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/fix01-production-auth-otp-security.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/roadmap-phase-02-auth-rbac.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/roadmap-phase-06-dairy-admin.test.js` | **PASS** | All subtests pass |
| `services/backend/tests/sample-p08.test.js` | **PASS** | `1/1` pass |
| `services/backend/tests/concurrent-idempotency-financial.test.js` | **SKIP** | `# SKIP Real PostgreSQL environment unavailable` |
| `services/backend/tests/prompt4-bulk-sync-rate-matrix.test.js` | **SKIP** | `# SKIP Real PostgreSQL environment unavailable` |
| `services/backend/tests/restart03-real-postgres.test.js` | **SKIP** | `# SKIP Real PostgreSQL 17 server unavailable; boot docker-compose.pg17-verify.yml and set TEST_POSTGRES_URL` |

### Pre-Existing Failures Outside RESTART-03 Scope (Documented Honestly)

- `customer-data-lifecycle-e2e.test.js`: Fails pre-existing RESTART-02/02.1 security checks (deprecated static `'123456'` OTP & unseeded `SUPER_ADMIN`).
- `offline-sync-22-scenarios.test.js`: Fails pre-existing unmounted `/api/v1/devices/register` (`DF-018`) & test pool cleanup.
- `roadmap-phase-07-dairy-admin.test.js`: Passes `9/10` groups; `Group E` tests `19` & `20` fail `404 DEVICE_NOT_FOUND` on unseeded `KIOSK_MAIN_01` (`DF-018`/`DF-019`).
- `customer-app-production.test.js`, `customer-lifecycle-security.test.js`, `customer-face-api-404-network-fix.test.js`: Contain pre-existing RESTART-02/02.1 auth (`401` on unseeded/mock tokens) and tenant-scoped `404` vs `403` mismatches.

---

## 4. Live PostgreSQL 17 Verification Gate (For Execution Once Docker/PG Available)

```powershell
docker compose -f docker-compose.pg17-verify.yml up -d --wait
$env:TEST_POSTGRES_URL = "postgresql://dfarm_verify:dfarm_verify_local@127.0.0.1:55432/dfarm_central"
node --test services/backend/tests/restart03-real-postgres.test.js
docker compose -f docker-compose.pg17-verify.yml down -v
```
