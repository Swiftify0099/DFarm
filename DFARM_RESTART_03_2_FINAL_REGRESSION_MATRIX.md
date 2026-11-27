# DFarm RESTART-03.2 — Final Post-Edit Regression Matrix

**Phase:** `RESTART-03.2`  
**Date:** `2026-11-27`  
**Remote & Local Base HEAD:** `47f97db6ce1e29952547b6946f303f59666ee694` (`origin` untouched)  
**Important Environment Disclosure:** Backend suites below executed after the final source/dist build edit against isolated `pg-mem` offline test doubles (`NODE_ENV=test`, `TENANT_POOL_CONNECTION_TIMEOUT_MS=500`). Real PostgreSQL 17 remained **UNAVAILABLE (`SKIP / BLOCKED`)** on host.

---

## 1. Workspace Builds, Schema Validation & Frontend Suites

| Workspace / Target | Command | Exit | Exact Observed Output |
| :--- | :--- | :---: | :--- |
| Backend Monorepo Build | `npm run build:backend` | `0` | Clean `tsc` build across `shared-types`, `shared-validation`, `database`, `backend` (`services/backend/dist` = `872` tracked files) |
| `@dfarm/database` Static Validation | `npm run db:validate` | `0` | `13` tests · `13` pass · `0` fail · `0` skipped |
| `@dfarm/database` Runtime Integration | `npm run db:test` | `0` | `22` tests · `22` pass · `0` fail · `0` skipped (offline suite) |
| `apps/dfarm-customer-app` TypeCheck | `npx tsc --noEmit -p apps/dfarm-customer-app/tsconfig.json` | `0` | `EXIT=0` (`0` TypeScript errors) |
| `apps/dfarm-customer-app` Jest Tests | `npm --prefix apps/dfarm-customer-app test -- --watchAll=false` | `0` | `8/8` test suites · `31/31` tests pass (`6.624s`) |
| `apps/dfarm-collection-app` Vitest | `npm --prefix apps/dfarm-collection-app test -- --run` | `0` | `17/17` test files · `162/162` tests pass (`24.01s`) |

---

## 2. Backend Security, Isolation & Regression Suites (`23` Executed Suites)

All suites below executed post-final-edit (`task-290`, `task-296`, `task-329`, `task-350`):

| # | Test File | Runner / Mode | Tests | Pass | Fail | Skipped | Exit | Classification |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| 1 | `restart032-operational-repository-isolation.test.js` | `pg-mem` + Supertest | `15` | `15` | `0` | `0` | `0` | **PASS** (RESTART-03.2 core suite) |
| 2 | `restart03-tenant-isolation-and-ownership.test.js` | `pg-mem` + Supertest | `18` | `18` | `0` | `0` | `0` | **PASS** |
| 3 | `restart02-auth-security-remediation.test.js` | `pg-mem` + Supertest | `9` | `9` | `0` | `0` | `0` | **PASS** |
| 4 | `restart021-auth-session-integrity.test.js` | `pg-mem` + Supertest | `7` | `7` | `0` | `0` | `0` | **PASS** |
| 5 | `collection-kiosk-production.test.js` | `pg-mem` + Supertest | `24` | `24` | `0` | `0` | `0` | **PASS** |
| 6 | `customer-tenant-approval-e2e.test.js` | `pg-mem` + Supertest | `11` | `11` | `0` | `0` | `0` | **PASS** |
| 7 | `face-biometric-and-search-e2e.test.js` | `pg-mem` + Supertest | `7` | `7` | `0` | `0` | `0` | **PASS** |
| 8 | `tenant-database-isolation.test.js` | `pg-mem` + Supertest | `7` | `7` | `0` | `0` | `0` | **PASS** |
| 9 | `multi-dairy-membership.test.js` | `pg-mem` + Supertest | `9` | `9` | `0` | `0` | `0` | **PASS** |
| 10 | `dairy-admin-production.test.js` | `pg-mem` + Supertest | `36` | `36` | `0` | `0` | `0` | **PASS** |
| 11 | `roadmap-phase-06-dairy-admin.test.js` | `pg-mem` + Supertest | `41` | `41` | `0` | `0` | `0` | **PASS** |
| 12 | `customer-face-biometrics-update-resolution.test.js` | `pg-mem` + Supertest | `8` | `8` | `0` | `0` | `0` | **PASS** |
| 13 | `collection-operator-authorization-fix.test.js` | `pg-mem` + Supertest | `9` | `9` | `0` | `0` | `0` | **PASS** |
| 14 | `restart03-real-postgres.test.js` | Real PG17 (`pg.Pool`) | `1` | `0` | `0` | `1` | `0` | **SKIP / BLOCKED** (`DF-030` host PG17 unavailable) |
| 15 | `restart032-real-postgres.test.js` | Real PG17 (`pg.Pool`) | `1` | `0` | `0` | `1` | `0` | **SKIP / BLOCKED** (`DF-030` host PG17 unavailable) |
| 16 | `concurrent-idempotency-financial.test.js` | PG check + `pg` | `1` | `0` | `0` | `1` | `0` | **SKIP / BLOCKED** (PG unavailable under `NODE_ENV=test`) |
| 17 | `customer-ledger-accounting.test.js` | Raw `pg.Client` | `24` | `2` | `22` | `0` | `1` | **FAIL (PG-seeded legacy test — `Org 1 must exist` / `uuid: ""`)** |
| 18 | `offline-sync-22-scenarios.test.js` | `pg-mem` + Supertest | `23` | `10` | `13` | `0` | `1` | **FAIL (Pre-existing Triaged — `DF-007` `/push` shadow + `DF-018`)** |
| 19 | `customer-data-lifecycle-e2e.test.js` | `pg-mem` + Supertest | `9` | `2` | `7` | `0` | `1` | **FAIL (Pre-existing Triaged + L343 `ledgerRepo.save()` missing `operatorId` security enforcement)** |
| 20 | `roadmap-phase-07-dairy-admin.test.js` | `pg-mem` + Supertest | `41` | `37` | `4` | `0` | `1` | **FAIL (Pre-existing Triaged — `DF-018` unmounted routes)** |
| 21 | `customer-app-production.test.js` | `pg-mem` + Supertest | `42` | `26` | `16` | `0` | `1` | **FAIL (Pre-existing Triaged — unseeded test users / `pg-mem` DDL)** |
| 22 | `customer-lifecycle-security.test.js` | Legacy routes + PG | `11` | `0` | `11` | `0` | `1` | **FAIL (Pre-existing Triaged — `DF-004`/`DF-018`/`DF-030`)** |
| 23 | `customer-face-api-404-network-fix.test.js` | `pg-mem` + Supertest | `38` | `9` | `29` | `0` | `1` | **FAIL (Pre-existing Triaged — static OTPs & unseeded users)** |

**Aggregate Summary (`23` Backend Suites Executed):**
- **Passing Core / Security / Isolation Suites:** **`13` / `13` PASS** (`201/201` subtests passing, `0` fail, `0` skipped).
- **Real PostgreSQL 17 / PG-Gated Suites:** **`3` SKIP** (`0` pass, `0` fail, `3` skipped).
- **Pre-Existing / Non-RESTART-03.2 Failing Legacy Suites:** **`7` FAIL** (`86` pass, `102` fail across `188` subtests on legacy/RESTART-04..11 targets; exact counts itemized above).

---

## 3. Repository & Safety Invariants

- **`.temp/` local files preserved:** `1,829` (`git ls-files .temp` = `0`)
- **`getAllTenantDbs()` references inside `services/backend/src/`:** `1` line (`TenantDatabaseManager.ts:337` definition only; `0` call sites)
- **`origin/fix/cloudflare-pages-production-deploy`:** Untouched at `47f97db6ce1e29952547b6946f303f59666ee694`
