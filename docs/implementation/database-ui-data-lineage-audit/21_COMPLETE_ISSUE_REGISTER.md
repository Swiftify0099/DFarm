# DFARM — COMPLETE ISSUE REGISTER
## 10 DOCUMENTED DEFICIENCIES WITH ROOT CAUSES, SEVERITIES & REMEDIATIONS

**Audit Reference:** `DFARM-AUDIT-ISSUES-001`  
**Date:** 2026-11-18  

---

### 1. Master Issue Catalog

#### [DFARM-AUDIT-001] — Migration Manifest Omission of Central Policies (Migration 033)
- **Severity:** CRITICAL | **Confidence:** CONFIRMED
- **Affected Module:** Database Infrastructure / Migration Runner
- **Backend Location:** `services/backend/src/infrastructure/database/MigrationRunner.ts` & `packages/database/src/index.ts`
- **Database / Table:** `dfarm_central`: `otp_rate_limits`, `support_diagnostic_sessions`, `global_rate_policies`, `global_fat_snf_adjustment_policies`
- **Finding:** Migration 033 exists on disk (`supabase/migrations/033_central_platform_policies_and_support.sql`) but is missing from `MIGRATION_MANIFEST`.
- **Root Cause:** Added in Phase 10 without updating manifest registries in database package.
- **Impact:** Migration 033 will not be executed on fresh deployments.
- **Recommended Correction:** Append version '033' entry with target `CONTROL_PLANE` to `MIGRATION_MANIFEST`.

#### [DFARM-AUDIT-002] — Duplicate Migration Version 031 and Residual Quarantined File
- **Severity:** CRITICAL | **Confidence:** CONFIRMED
- **Affected Module:** Database Infrastructure / Supabase Migrations
- **Backend Location:** `supabase/migrations/031_remove_dairy_admin_7507495615.sql`
- **Database / Table:** `dfarm_central`: `users`
- **Finding:** Two files share prefix 031: `031_dairy_database_mappings.sql` and `031_remove_dairy_admin_7507495615.sql`.
- **Root Cause:** Targeted maintenance script committed directly into migrations folder.
- **Impact:** Lexicographical sorting ambiguity in migration tools.
- **Recommended Correction:** Move `031_remove_dairy_admin_7507495615.sql` to `scripts/maintenance/`.

#### [DFARM-AUDIT-003] — Silent In-Memory Mock Fallback in Super Admin Client
- **Severity:** HIGH | **Confidence:** CONFIRMED
- **Affected Module:** Super Admin Web (`apps/dfarm-super-admin`)
- **Location:** `apps/dfarm-super-admin/src/api/client.ts:181, 220`
- **Finding:** Network error catch blocks silently return synthetic mock data without UI warnings.
- **Root Cause:** Development test mocks retained in production API client.
- **Impact:** Super Admins may observe synthetic data during backend outages without realizing data is not live.
- **Recommended Correction:** Remove silent fallbacks; throw errors to render explicit error banners.

#### [DFARM-AUDIT-004] — Physical Database Connectivity Failure in Default Host Environment
- **Severity:** HIGH | **Confidence:** CONFIRMED
- **Affected Module:** Backend Database Connection (`services/backend`)
- **Location:** `services/backend/src/infrastructure/database/PostgresPool.ts:56`
- **Finding:** Connection to `127.0.0.1:54322` fails with ECONNREFUSED in audit environment.
- **Root Cause:** PostgreSQL daemon is stopped on the local machine.
- **Impact:** Operational server cannot process live relational queries without starting container.
- **Recommended Correction:** Ensure Docker/PostgreSQL is running prior to starting backend in non-test mode.

#### [DFARM-AUDIT-005] — Default Sensor Mock Measurements in Collection App Hardware Context
- **Severity:** HIGH | **Confidence:** CONFIRMED
- **Affected Module:** Collection Kiosk Terminal (`apps/dfarm-collection-app`)
- **Location:** `apps/dfarm-collection-app/src/context/HardwareContext.tsx:67-80`
- **Finding:** Disconnected sensors display prefilled test values (`fat: 4.2`, `snf: 8.7`, `weight: 12.5`).
- **Root Cause:** Hardcoded mock defaults intended for UI preview.
- **Impact:** Operators could accidentally commit mock data as real milk intake.
- **Recommended Correction:** Default to null/zero and disable save button until hardware handshake succeeds.

#### [DFARM-AUDIT-006] — Dual Route Mounting in Backend Server
- **Severity:** MEDIUM | **Confidence:** CONFIRMED
- **Affected Module:** Express App Router Mounting (`services/backend/src/app.ts`)
- **Finding:** `cleanApiRouter` is mounted at `/api/v1`, followed by duplicate legacy domain mounts.
- **Root Cause:** Backward-compatibility layer preserved after clean architecture refactor.
- **Impact:** Potential route shadowing and maintenance ambiguity.
- **Recommended Correction:** Consolidate all routes exclusively into `cleanApiRouter`.

#### [DFARM-AUDIT-007] — Redundant Client-Supplied Tenant Headers
- **Severity:** LOW | **Confidence:** CONFIRMED
- **Affected Module:** Frontend API Clients
- **Finding:** Web apps send `X-Dairy-Tenant-ID` headers from `localStorage`.
- **Root Cause:** Legacy prototyping artifact before JWT claims became authoritative.
- **Impact:** Code hygiene issue; server correctly ignores headers in favor of token claims.
- **Recommended Correction:** Remove client-side tenant header injection.

#### [DFARM-AUDIT-008] — Unbounded Historical Queries in Customer Mobile App
- **Severity:** MEDIUM | **Confidence:** CONFIRMED
- **Affected Module:** Customer Mobile App (`apps/dfarm-customer-app`)
- **Location:** `src/features/collection/useCollection.ts`
- **Finding:** Collection and statement queries lack default pagination parameters.
- **Root Cause:** Mobile hook omitted pagination query parameters.
- **Impact:** Memory bloat on long-standing farmer accounts.
- **Recommended Correction:** Add mandatory `page=1&pageSize=30` pagination.

#### [DFARM-AUDIT-009] — Passive Polling Lag in Cross-App Customer Passbook Update
- **Severity:** LOW | **Confidence:** CONFIRMED
- **Affected Module:** Customer App Synchronization
- **Finding:** No push event invalidates customer passbook immediately upon kiosk intake save.
- **Root Cause:** Real-time push / WebSocket event dispatch not connected to React Native client.
- **Impact:** Farmer must pull-to-refresh to see newly recorded collection.
- **Recommended Correction:** Implement FCM push notifications on intake commit.

#### [DFARM-AUDIT-010] — Vestigial Large Mock Server Files in Frontend Directories
- **Severity:** LOW | **Confidence:** CONFIRMED
- **Affected Module:** Frontend Monorepo Hygiene
- **Finding:** `mock-server.ts` (83KB) and `mock-backend.ts` (12KB) reside in `src/api/`.
- **Root Cause:** Early UI mock servers kept for unit test suites.
- **Impact:** Bloats source directories and risks accidental production import.
- **Recommended Correction:** Relocate to `src/test/fixtures/`.
