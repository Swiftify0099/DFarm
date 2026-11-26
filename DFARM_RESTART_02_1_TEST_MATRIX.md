# DFarm — RESTART-02.1 Verification & Test Matrix

**Phase:** `RESTART-02.1`  
**Date:** `2026-11-26`  
**Baseline HEAD:** `c67dbb94694a67882b0cf92a3d8e6c41b049de2d` (`fix/cloudflare-pages-production-deploy`)  
**Execution Honest Disclosure:** Local PostgreSQL ports `5432` and `54322` were closed (`False`) during all test runs. All backend DB tests below ran against the isolated `pg-mem` test double (`TENANT_POOL_CONNECTION_TIMEOUT_MS=500`), **not** physical PostgreSQL or Supabase Cloud.

---

## 1. Backend Build & Offline Security/Regression Suite Results (`pg-mem` / Unit)

- **TypeScript Build (`npx tsc --project services/backend/tsconfig.json`):** **`EXIT 0`** (`0` errors)
- **`node --test` (17 Suites, `task-1076` post-final-edit):** **`243` tests · `243` pass · `0` fail · `0` skipped · `44410.14 ms`** (`EXIT 0`)

| # | Test File | Coverage Focus | Environment | Result |
| :---: | :--- | :--- | :---: | :---: |
| 1 | `restart021-auth-session-integrity.test.js` | Cross-instance revocation, fail-closed `503` on lookup/logout DB outage, bounded expired retention cleanup preserving unexpired entries, 3-way concurrent refresh atomicity (`1` winner / `2` `401`), unified active/suspended/deleted/unmapped/org checks across both middlewares, `/customers/register` OTP proof + active org/center + no dummy center + biometric consent, `AuthService.getCenters()` scoping & Super Admin `401/403/200` | `pg-mem` + Express `supertest` + mocked `db.query` for outage subtest | **PASS (`6/6` subtests)** |
| 2 | `restart02-auth-security-remediation.test.js` | `DF-001`, `DF-002`, `DF-004..006`, `DF-008`, `DF-009`, `DF-010`, `DF-011`, `DF-013`, `DF-014`, `DF-015` | `pg-mem` + Express + Unit | **PASS (`8/8` subtests)** |
| 3 | `fix01-production-auth-otp-security.test.js` | Production OTP, CORS, startup secret validation | `pg-mem` + Unit | **PASS** |
| 4 | `clean-architecture.test.js` | Value objects, SFace encryption, JWT, rate engine, OTP, OTP-verified farmer onboarding | `pg-mem` + Express | **PASS** |
| 5 | `dairy-activation-workflow.test.js` | Admin invitation & activation workflow | `pg-mem` + Express | **PASS** |
| 6 | `dairy-location.test.js` | Dairy coordinates & location API | `pg-mem` + Express | **PASS** |
| 7 | `multi-dairy-membership.test.js` | Multi-dairy global identity, switching & tenant isolation | `pg-mem` + Express | **PASS** |
| 8 | `super-admin-production.test.js` | 7 Super Admin authorization & control suites | `pg-mem` + Express | **PASS** |
| 9 | `super-admin-tenant-database-control.test.js` | Tenant database control plane | `pg-mem` + Express | **PASS** |
| 10 | `tenant-database-isolation.test.js` | Manifest (`044` included), AES envelope, provisioning, isolation & IDOR | `pg-mem` + Express | **PASS (`6/6`)** |
| 11 | `dairy-admin-production.test.js` | Dairy admin ops, approvals, rates, devices & ledger | `pg-mem` + Express | **PASS** |
| 12 | `collection-operator-authorization-fix.test.js` | Operator OTP, device challenge & collection auth | `pg-mem` + Express | **PASS** |
| 13 | `roadmap-phase-02-auth-rbac.test.js` | 8-role RBAC matrix & Super Admin `401/403` contract | `pg-mem` + Express | **PASS** |
| 14 | `roadmap-phase-06-dairy-admin.test.js` | Dairy admin approval, status, RFID & consistency | `pg-mem` + Express | **PASS** |
| 15 | `face-biometric-and-tenant-isolation-e2e.test.js` | End-to-end encrypted biometrics & isolation | `pg-mem` + Express | **PASS** |
| 16 | `customer-face-biometrics-update-resolution.test.js` | `/customers/:id` & `/me` biometrics + unmapped `401` + central membership healing | `pg-mem` + Express | **PASS** |
| 17 | `sample-p08.test.js` | Core sanity check | Unit | **PASS** |

---

## 2. Database Package & Frontend Application Test Results

| Target | Runner | Environment | Observed Result |
| :--- | :--- | :---: | :--- |
| `packages/database` (`npm run db:validate`) | `schema-validation.test.js` | Static SQL check | **`13 / 13` PASS** |
| `packages/database` (`npm run db:test`) | `node --test` | `pg-mem` + Offline | **`22 / 22` PASS** + `DFarm Real PostgreSQL Database & RLS Security Verification Suite` **SKIP** (offline) |
| `apps/dfarm-customer-app` | `tsc --noEmit` & Jest | Unit / Contract | `tsc` **EXIT `0`**; Jest **`8 / 8` suites (`31 / 31` tests) PASS** |
| `apps/dfarm-dairy-admin` | Vitest (`v5.1.0`) | `jsdom` / Mocked API | **`5 / 5` files (`14 / 14` tests) PASS** |
| `apps/dfarm-super-admin` | Vitest | `jsdom` / Mocked API | **`10 / 10` files (`48 / 48` tests) PASS** |
| `apps/dfarm-collection-app` | Vitest | `jsdom` / IDB Mock | **`17 / 17` files (`162 / 162` tests) PASS** |

---

## 3. Unverified / Blocked Categories Requiring External Infrastructure

- **Physical PostgreSQL & Supabase Integration Tests (`DF-030`):** Not run (ports `5432` and `54322` closed). Specifically includes live application/idempotency/RLS testing of migration `044_revoked_tokens_durable_revocation.sql`, `001`–`043` parity under `DF-020`, `real-postgres-verification.test.js`, `health-and-auth.test.js`, and PG-gated E2E/reconciliation suites (`prompt423`, `prompt425`, `prompt6`, `prompt7`).
- **Live Provider Verification (`DF-003`, `DF-013`, `DF-032`):** External Dove SMS, Supabase Auth OTP delivery, Render deployment env injection, and public Git history rewrite remain unexecuted pending operator credentials and approval.
