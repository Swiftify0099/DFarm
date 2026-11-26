# DFarm — RESTART-01 Fix Dependency Roadmap (`RESTART-02` to `RESTART-12`)

**Audit Sequence:** `RESTART-01`  
**Generated At:** `2026-11-26`  
**Rule:** Audit -> Fix -> Test -> Retest -> Security Verification -> Sign-off

---

## 1. Dependency Ordering Rationale

1. **Identity & Secrets First (`RESTART-02`):** Nothing else can be trusted while `/api/v1/auth/login` allows passwordless JWT minting (`DF-001`), `dairies.routes.ts` is open without auth (`DF-002`), hardcoded encryption fallback keys exist (`DF-008`), or fallback auth claims bypass DB revocation (`DF-009`).
2. **Tenant Boundaries & Offline Sync Second (`RESTART-03` & `RESTART-04`):** Once authentication is trustworthy, every route (`customers`, `collections`, `sync`, `devices`, `rfid`) must switch from `optionalAuthenticate` / no-op `authorizePermission` / multi-DB scans (`DF-016`) / central-pool `dairy_centers` queries (`DF-017`) to strict fail-closed tenant scoping and real `authenticateDevice` (`DF-007`).
3. **Authoritative Schema Before Financial/Realtime/E2E (`RESTART-05`):** Synchronizing migrations `001`–`043` across `supabase/migrations/`, `MigrationRunner.ts`, and `packages/database` (`DF-020`) unblocks tenant-scoped outbox events (`RESTART-09`), Union Bank reconciliation (`RESTART-10`), and real PostgreSQL E2E suites (`RESTART-11`).
4. **Financial, Biometric, App Flows, Realtime, Banking (`RESTART-06`..`RESTART-10`):** Layer financial ledger ACID fixes (`RESTART-06`), biometric encryption/endpoints (`RESTART-07`), multi-app UI & operational cleanup (`RESTART-08`), tenant-scoped SSE outbox (`RESTART-09`), and tenant-safe Union Bank reconciliation (`RESTART-10`).
5. **Full Real PostgreSQL / Chrome Verification & Production Release Gate (`RESTART-11` & `RESTART-12`):** Run every skipped/blocked PG and Chrome E2E suite (`DF-030`), complete remote git history rewrite & secret rotation verification (`DF-003`, `DF-032`), harden Cloudflare CSP/Wrangler (`DF-027`, `DF-028`), and obtain final sign-off.

---

## 2. Updated Fixing Sequence & Issue Allocation

| Prompt | Primary Scope | Mapped Issue IDs | Exit Gate / Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **`RESTART-02`** | **Authentication, OTP, JWT, CORS, Secrets** | `DF-001`, `DF-002`, `DF-003` (local/rotation prep), `DF-008`, `DF-009`, `DF-011`, `DF-013`, `DF-014` | Zero unauthenticated/passwordless login mounts; `dairies.routes.ts` requires `SUPER_ADMIN`; `authenticate.ts` & `RefreshTokenUseCase` fail closed; `DATA_ENCRYPTION_KEY_HEX` & webhook/SMS secrets validated on boot; client SMS key removed from `dfarm-customer-app`; exposed keys queued/rotated. |
| **`RESTART-03`** | **Tenant Isolation, Shift Sessions, Offline Sync** | `DF-006`, `DF-007`, `DF-015`, `DF-016`, `DF-017` | Remove `optionalAuthenticate` & default `00000000-...` UUID fallbacks from `collections`, `customers`, `sync`; fix `sync.routes.ts` route-shadowing so `authenticateDevice` executes; pass `organizationId` into `CloseShiftSessionUseCase` & `BulkCollectionSyncUseCase`; eliminate multi-DB scans & fake org/user creation in `PostgresShiftSessionRepository`; look up `dairy_centers` in `tenantDb` during `/register`; add `organizationId` check on `PUT /:id/bank-details`. |
| **`RESTART-04`** | **Device APIs & Device Security** | `DF-007`, `DF-012` (`devices`/`rfid`), `DF-018` (`deviceRouter`), `DF-019`, `DF-033` | Mount hardened device registration/rotation/revocation routes; enforce `authenticate` + `authorizePermission` on `devices` & `rfid`; replace mock telemetry/IP/MAC/calibration/device counts with tenant DB queries; update `sync-performance.bench.js` & Group E tests so `roadmap-phase-07` (`41/41`) passes. |
| **`RESTART-05`** | **Database Schema, Migrations, Data Integrity** | `DF-020`, `DF-025` | Resolve duplicate `031` prefix conflict cleanly; bring `MigrationRunner.ts` and `packages/database/src/index.ts` in exact lockstep with `supabase/migrations/001..043`; expand `schema-validation.test.js` beyond `010`; eliminate `pg-mem` auto-DDL compatibility warnings (`DeviceChallengeService` & `TenantDatabaseManager`). |
| **`RESTART-06`** | **Collection, Ledger & Financial Transaction Safety** | `DF-006` (adjust), `DF-010`, `DF-023` | Remove `optionalAuthenticate` & no-op `authorizePermission` from `ledger`, `payments`, `bills`, `feed`, `rate-charts`; fix `collections/transactions/:id/adjust` & `ledger/adjustment` (`balanceAfter` calculation, tenant DB transaction); align `payments`, `bills`, and `reports` SQL with migrations `019`–`026`. |
| **`RESTART-07`** | **Biometric APIs & Registration Security** | `DF-004` (biometrics), `DF-005`, `DF-008`, `DF-018` (`biometricRouter`) | Require JWT auth + tenant match on `identity.routes.ts` & customer biometric endpoints; fix `authorizePermission` callback bug; consolidate/mount modular biometric router cleanly; enforce `DATA_ENCRYPTION_KEY_HEX`; fix `biometric-engine` (`21/21`), `face-1n-recognition`, and `face-biometric-and-search-e2e` suites. |
| **`RESTART-08`** | **Customer, Collection, Dairy Admin, Super Admin Flows** | `DF-004`, `DF-012` (`staff`/`reports`/`audit`/`dashboard`), `DF-014`, `DF-015`, `DF-019` (`SuperAdminRepo`), `DF-026`, `DF-029`, `DF-033` | Remove remaining `optionalAuthenticate` across customer/admin/operational routes; remove `mockBackend` production fallback in `dfarm-super-admin`; replace hardcoded `syncLatency` analytics fallback; retire unmounted legacy `src/modules/` duplicates; resolve all remaining non-PG E2E test failures (`collection-kiosk-production`, `customer-app-production`, `customer-tenant-approval-e2e`, `customer-data-lifecycle-e2e`, `customer-face-api-404`, `offline-sync-22-scenarios`). |
| **`RESTART-09`** | **Realtime, Outbox & Notification Reliability** | `DF-013` (WhatsApp), `DF-021` | Poll/publish `dashboard_events_outbox` from tenant DBs (or route outbox notifications consistently with tenant transaction guarantees) without silently swallowing outbox insert errors; enforce fail-closed WhatsApp HMAC verification in production; verify `prompt6-*` realtime & SSE suites. |
| **`RESTART-10`** | **Payments, Union Bank Integration & Reconciliation** | `DF-022`, `DF-024` | Refactor `UnionBankReconciliationService` & `payout.service.ts` to run atomic double-entry reconciliation transactions inside resolved `tenantDbManager` pools (not control-plane `pool`); remove `'00000000000000'` default debit account fallback; establish UAT/Prod Union Bank certification readiness & verify `prompt7-*` suite (`10/10`) across multiple tenants. |
| **`RESTART-11`** | **Offline PostgreSQL / Supabase & Browser E2E Regression** | `DF-025`, `DF-029`, `DF-030` | Boot isolated PostgreSQL + Chrome environment; run `db:validate`, `db:test` (`real-postgres-verification`), `reconciliation-audit.js`, and all `64` backend `*.test.*` suites + all `40` frontend suites with `0` failures and `0` unapproved skips. |
| **`RESTART-12`** | **Production Security Audit & Deployment Readiness** | `DF-003`, `DF-027`, `DF-028`, `DF-031`, `DF-032` | Execute user-approved remote history rewrite & verify `origin` Gitleaks `0` findings; confirm all exposed keys/credentials rotated; align `dfarm-super-admin/wrangler.json` (`dfarm-super-admin`); harden `_headers` CSP; triage sibling worktree `C:/Users/panka/OneDrive/Desktop/DFarm`; verify Render/Cloudflare/Supabase live deployment readiness. |

---

## 3. Critical Dependency Graph

```text
RESTART-02 (Auth / Passwordless Bypass / Encryption / Middleware Fail-Closed)
   ├──> RESTART-03 (Tenant Isolation / Shift Repo / Sync Shadowing / Tenant Register Lookup)
   │       ├──> RESTART-04 (Device Registry / Telemetry / Mount deviceRouter)
   │       ├──> RESTART-07 (Biometric Endpoints / Identity Default Org Removal)
   │       └──> RESTART-08 (All 4 App Flows / Remove mockBackend / Operational Routes)
   └──> RESTART-05 (Migration 001..043 Parity / Resolve 031 Collision / Clean Test DDL)
           ├──> RESTART-06 (Ledger / Billing / Payments / Rate Charts Acid Safety)
           ├──> RESTART-09 (Tenant Outbox -> Realtime SSE Publisher)
           └──> RESTART-10 (Tenant-Scoped Union Bank Reconciliation & Payouts)
                   └──> RESTART-11 (Real PG + Chrome Full E2E Regression Matrix)
                           └──> RESTART-12 (Remote History Rewrite + Rotation + Cloud Deployment Sign-off)
```
