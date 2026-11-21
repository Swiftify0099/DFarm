# DFARM — SUPER ADMIN EXISTING FUNCTIONALITY AUDIT

**Execution Reference:** DFARM-SUPER-ADMIN-FUNCTIONALITY-VISIBILITY  
**Target Application:** `apps/dfarm-super-admin`  
**Backend:** `services/backend`  
**Control Plane Database:** `dfarm_central`  
**Audit Date:** 2026-11-18  

---

## 1. Executive Summary

A comprehensive architectural and source-code audit of `apps/dfarm-super-admin`, `services/backend`, `packages/database`, and the PostgreSQL `dfarm_central` schema was performed. 

The audit revealed that **the vast majority of core backend services, controllers, repositories, database tables, and access-control policies are already fully implemented, tested, and passing integration suites** (notably `services/backend/tests/roadmap-phase-04-platform-services.test.js` and `services/backend/tests/roadmap-phase-03-super-admin-core.test.js`). 

However, in `apps/dfarm-super-admin`, several critical modules were not exposed in the UI or navigation menu:
1. **Global Rate Policies** and **Global FAT/SNF Adjustment Policies** existed in the database and API routes (`/api/v1/super-admin/policies/rate`, `/policies/fat-snf`), but had no React feature pages, router entries, or sidebar links.
2. **Central Hardware Inventory & Allocation** and **Central AMC & Service Management** existed in database migrations (032), repository methods, backend routes, and even frontend `apiClient` methods (`getHardware`, `getAmcPlans`, etc.), but lacked React pages, routes, and navigation items.
3. **Platform Operator Management** had a view-only permission list on `PlatformAccessPage`, but lacked an operator creation/invitation modal and dedicated management interface.
4. **Dairy Locations & Discovery** was implemented as an internal component (`DairyLocationPicker` in `DairyDetailPage`), but had no dedicated platform-level overview page in the main navigation.
5. **Super Admin Dashboard** had only 4 KPI cards and lacked representation for AMC, hardware allocation breakdown, global policies, and active support sessions.
6. **Platform Settings** lacked a dedicated UI page displaying the operational status of SMS, SMTP, WhatsApp, DB pools, and security policies.

---

## 2. Module Audit Status Matrix

| Module | Database | Backend | API | Frontend | Navigation | Real Data | Final Status |
|---|---|---|---|---|---|---|---|
| Global Rate Policies | YES (`033_central_platform_policies_and_support.sql`) | YES (`PostgresSuperAdminRepository`) | YES (`/api/v1/super-admin/policies/rate`) | NO | NO | YES | BACKEND IMPLEMENTED / UI MISSING |
| FAT/SNF Policies | YES (`033_central_platform_policies_and_support.sql`) | YES (`PostgresSuperAdminRepository`) | YES (`/api/v1/super-admin/policies/fat-snf`) | NO | NO | YES | BACKEND IMPLEMENTED / UI MISSING |
| Hardware | YES (`032_central_super_admin_features.sql`) | YES (`PostgresSuperAdminRepository`) | YES (`/api/v1/super-admin/hardware`) | NO | NO | YES | BACKEND IMPLEMENTED / UI MISSING |
| AMC | YES (`032_central_super_admin_features.sql`) | YES (`PostgresSuperAdminRepository`) | YES (`/api/v1/super-admin/amc`) | NO | NO | YES | BACKEND IMPLEMENTED / UI MISSING |
| Monitoring | YES (`platform_alerts`, `organizations`) | YES (`getSystemHealth`) | YES (`/api/v1/super-admin/health`) | YES (`MonitoringPage`) | YES | YES | FULLY IMPLEMENTED AND VISIBLE |
| Support | YES (`033_central_platform_policies_and_support.sql`) | YES (`support_diagnostic_sessions`) | YES (`/api/v1/super-admin/support/sessions`) | YES (`SupportAccessPage`) | YES | YES | FULLY IMPLEMENTED AND VISIBLE |
| Operators | YES (`users` table, role check) | YES (`getPlatformUsers`, `createPlatformUser`) | YES (`/api/v1/super-admin/users`) | PARTIAL (`PlatformAccessPage` read-only) | YES | YES | PARTIALLY IMPLEMENTED |
| Reports | YES (`PostgresSuperAdminRepository.generateReport`) | YES (`generateReport`) | YES (`/api/v1/super-admin/reports/generate`) | YES (`ReportsPage`) | YES | YES | FULLY IMPLEMENTED AND VISIBLE |
| Audit Logs | YES (`032_central_super_admin_features.sql`) | YES (`getAuditLogs`, `logAudit`) | YES (`/api/v1/super-admin/audit`) | YES (`AuditLogsPage`) | YES | YES | FULLY IMPLEMENTED AND VISIBLE |
| Dairy Locations & Discovery | YES (`organizations` coordinates) | YES (`/nearby`, `PATCH /:id/location`) | YES (`/api/v1/dairies/:id/location`) | PARTIAL (Only inside `DairyDetailPage`) | NO | YES | BACKEND IMPLEMENTED / UI MISSING |
| Platform Settings | YES (`env.ts` config) | PARTIAL (Health check covers services) | NEEDS ENDPOINT | NO | NO | YES | BACKEND IMPLEMENTED / UI MISSING |
| Super Admin Dashboard | YES (Aggregate queries) | YES (`getDashboardMetrics`, `getGlobalAnalytics`) | YES (`/dashboard/metrics`) | PARTIAL (Only 4 cards) | YES | YES | PARTIALLY IMPLEMENTED |

---

## 3. Detailed Per-Module Audit

### 3.1 Global Rate Policy Management
1. **Database Schema:** `global_rate_policies` and `global_rate_policy_versions` in `dfarm_central`.
2. **Migrations:** `033_central_platform_policies_and_support.sql` lines 49–88.
3. **Applied:** Yes, tables verified in active PostgreSQL instance.
4. **Repository:** `PostgresSuperAdminRepository` (`listGlobalRatePolicies`, `createGlobalRatePolicy`, `createGlobalRatePolicyVersion`, `publishGlobalRatePolicyVersion`).
5. **Service:** Clean architecture use cases & repository methods.
6. **API Routes:** Registered in `super-admin.routes.ts` (`GET /policies/rate`, `POST /policies/rate`, `POST /policies/rate/:id/versions`, `POST /policies/rate/:id/versions/:vId/publish`).
7. **Authorization:** `requireSuperAdminRole` enforced on mutations; `requirePlatformStaffRole` on reads.
8. **Frontend Page:** Missing in `apps/dfarm-super-admin/src/features/`.
9. **Routing Registration:** Not registered in `App.tsx`.
10. **Navigation Link:** Not present in `Sidebar.tsx`.
11. **Frontend API Call:** Missing in `client.ts`.
12. **Real Data Display:** Not rendered yet.
13. **Action Execution:** Not wired.
14. **Error/Loading States:** N/A (UI missing).
15. **Integration Tests:** Passing in `services/backend/tests/roadmap-phase-04-platform-services.test.js` Group 3.

### 3.2 Global FAT/SNF Adjustment Policy
1. **Database Schema:** `global_fat_snf_adjustment_policies` and `global_fat_snf_adjustment_policy_versions` in `dfarm_central`.
2. **Migrations:** `033_central_platform_policies_and_support.sql` lines 90–130.
3. **Applied:** Yes, verified.
4. **Repository:** `PostgresSuperAdminRepository` (`listGlobalFatSnfPolicies`, `createGlobalFatSnfPolicy`, `createGlobalFatSnfPolicyVersion`, `publishGlobalFatSnfPolicyVersion`).
5. **Service:** Policy engine with checksum generation (SHA-256).
6. **API Routes:** Registered in `super-admin.routes.ts` (`GET /policies/fat-snf`, `POST /policies/fat-snf`, etc.).
7. **Authorization:** Server-side RBAC with `requireSuperAdminRole`.
8. **Frontend Page:** Missing in `apps/dfarm-super-admin/src/features/`.
9. **Routing Registration:** Not registered in `App.tsx`.
10. **Navigation Link:** Not present in `Sidebar.tsx`.
11. **Frontend API Call:** Missing in `client.ts`.
12. **Real Data Display:** Not rendered yet.
13. **Action Execution:** Not wired.
14. **Error/Loading States:** N/A.
15. **Integration Tests:** Passing in `roadmap-phase-04-platform-services.test.js` Group 4.

### 3.3 Central Hardware Inventory & Allocation
1. **Database Schema:** `central_hardware_inventory`, `hardware_assignment_history` in `dfarm_central`.
2. **Migrations:** `032_central_super_admin_features.sql` lines 26–66.
3. **Applied:** Yes, verified.
4. **Repository:** `PostgresSuperAdminRepository` (`listHardware`, `registerHardware`, `assignHardware`, `unassignHardware`, `updateHardwareStatus`).
5. **Service:** Hardware lifecycle engine with immutable assignment audit.
6. **API Routes:** `super-admin.routes.ts` lines 177–264.
7. **Authorization:** `requireSuperAdminRole` on register/assign/unassign/status; staff on read.
8. **Frontend Page:** Missing in `src/features/`.
9. **Routing Registration:** Not registered in `App.tsx`.
10. **Navigation Link:** Not present in `Sidebar.tsx`.
11. **Frontend API Call:** Present in `client.ts` (`getHardware`, `registerHardware`, `assignHardware`, `unassignHardware`, `updateHardwareStatus`).
12. **Real Data Display:** Not displayed in UI due to missing page.
13. **Action Execution:** Client methods exist but no UI triggers.
14. **Error/Loading States:** Handled in client fetch, page pending.
15. **Integration Tests:** Passing in `roadmap-phase-04-platform-services.test.js` Group 1.

### 3.4 Central AMC & Service Management
1. **Database Schema:** `amc_plans`, `amc_subscriptions` in `dfarm_central`.
2. **Migrations:** `032_central_super_admin_features.sql` lines 68–112.
3. **Applied:** Yes, seeded with standard plans.
4. **Repository:** `PostgresSuperAdminRepository` (`listAmcPlans`, `createAmcPlan`, `listAmcSubscriptions`, `createAmcSubscription`, `verifyAmcPayment`).
5. **Service:** AMC lifecycle engine with Razorpay payment verification boundary.
6. **API Routes:** `super-admin.routes.ts` lines 269–358.
7. **Authorization:** `requireSuperAdminRole` on mutations; staff on read.
8. **Frontend Page:** Missing in `src/features/`.
9. **Routing Registration:** Not registered in `App.tsx`.
10. **Navigation Link:** Not present in `Sidebar.tsx`.
11. **Frontend API Call:** Present in `client.ts` (`getAmcPlans`, `createAmcPlan`, `getAmcSubscriptions`, `createAmcSubscription`, `verifyAmcPayment`).
12. **Real Data Display:** Not rendered due to missing page.
13. **Action Execution:** Client methods exist but no UI triggers.
14. **Error/Loading States:** Handled in client fetch, page pending.
15. **Integration Tests:** Passing in `roadmap-phase-04-platform-services.test.js` Group 2.

### 3.5 Platform Monitoring & Alerts
1. **Database Schema:** `platform_alerts` and central organizations.
2. **Migrations:** `032_central_super_admin_features.sql` lines 114–133.
3. **Applied:** Yes.
4. **Repository:** `PostgresSuperAdminRepository` (`listAlerts`, `acknowledgeAlert`, `resolveAlert`, `getSystemHealth`).
5. **Service:** System health telemetry and incident tracking.
6. **API Routes:** `super-admin.routes.ts` lines 130–173.
7. **Authorization:** `requirePlatformStaffRole` for viewing/acknowledging/resolving.
8. **Frontend Page:** `MonitoringPage.tsx` and `AlertsPage.tsx`.
9. **Routing Registration:** Registered in `App.tsx` (`/monitoring`, `/alerts`).
10. **Navigation Link:** Registered as separate items ("System Health", "Platform Alerts").
11. **Frontend API Call:** Fully connected to `/super-admin/health` and `/super-admin/alerts`.
12. **Real Data Display:** Displays real cluster status and database alerts.
13. **Action Execution:** Acknowledge and resolve work with real mutations.
14. **Error/Loading States:** Fully implemented with TanStack Query.
15. **Integration Tests:** Passing in `reportsAndMonitoring.test.ts` and backend suites.

### 3.6 Authorized Support Management
1. **Database Schema:** `support_diagnostic_sessions` in `dfarm_central`.
2. **Migrations:** `033_central_platform_policies_and_support.sql` lines 25–47.
3. **Applied:** Yes.
4. **Repository:** `PostgresSuperAdminRepository` (`getActiveSupportSession`, `getAllSupportSessions`, `requestSupportSession`, `revokeSupportSession`).
5. **Service:** Cryptographic session token generation (SHA-256 hash stored).
6. **API Routes:** `super-admin.routes.ts` lines 495–558.
7. **Authorization:** `requireSuperAdminRole` on session creation and revocation.
8. **Frontend Page:** `SupportAccessPage.tsx`.
9. **Routing Registration:** Registered in `App.tsx` (`/support-access`).
10. **Navigation Link:** Registered as "Controlled Support".
11. **Frontend API Call:** Fully connected to `/super-admin/support/*`.
12. **Real Data Display:** Displays real persisted sessions from `dfarm_central`.
13. **Action Execution:** Session request and revocation trigger real backend operations.
14. **Error/Loading States:** Handled.
15. **Integration Tests:** Passing in `auditAndSecurity.test.ts` and backend Group 5.

### 3.7 Platform Operator Management
1. **Database Schema:** `users` table with roles `SUPER_ADMIN` and `PLATFORM_OPERATOR`.
2. **Migrations:** Core user identity foundation.
3. **Applied:** Yes.
4. **Repository:** `PostgresSuperAdminRepository` (`getPlatformUsers`, `createPlatformUser`).
5. **Service:** Platform staff credential and RBAC management.
6. **API Routes:** `super-admin.routes.ts` lines 376–416 (`GET /users`, `POST /users`).
7. **Authorization:** `requireSuperAdminRole` on `POST /users`.
8. **Frontend Page:** `PlatformAccessPage.tsx` lists provisioned operators.
9. **Routing Registration:** Registered in `App.tsx` (`/platform-access`).
10. **Navigation Link:** Registered as "Access & Permissions".
11. **Frontend API Call:** `client.getPlatformUsers()` is connected; `createPlatformUser()` is not wired in UI.
12. **Real Data Display:** Displays real platform users.
13. **Action Execution:** Missing Create Operator modal/action.
14. **Error/Loading States:** Handled for query.
15. **Integration Tests:** Verified in `auth.test.ts` and backend Group 6.

### 3.8 Super Admin Dashboard
1. **Database Schema:** Cross-table aggregate queries across `dfarm_central`.
2. **Migrations:** Applied.
3. **Repository:** `PostgresSuperAdminRepository` (`getDashboardMetrics`, `getGlobalAnalytics`).
4. **API Routes:** `/super-admin/dashboard/metrics`, `/super-admin/dashboard/analytics`.
5. **Frontend Page:** `DashboardPage.tsx`.
6. **Routing Registration:** Registered at `/`.
7. **Navigation Link:** Registered as "Platform Overview".
8. **Frontend API Call:** Connected to real endpoints.
9. **Real Data Display:** Displays real counts, but only 4 cards present; lacks breakdown of AMC, hardware allocation, global policies, support sessions.
10. **Action Execution:** Create Dairy modal works; card navigation works.
11. **Integration Tests:** Passing.

### 3.9 Platform Reports
1. **Database Schema:** Real database tables across `dfarm_central`.
2. **Repository:** `PostgresSuperAdminRepository.generateReport`.
3. **API Routes:** `POST /api/v1/super-admin/reports/generate`.
4. **Frontend Page:** `ReportsPage.tsx`.
5. **Routing Registration:** Registered at `/reports`.
6. **Navigation Link:** Registered as "Platform Reports".
7. **Frontend API Call:** Connected.
8. **Real Data Display:** Real report output.
9. **Action Execution:** Generates reports with filters.
10. **Integration Tests:** Passing.

### 3.10 Audit Logs
1. **Database Schema:** `platform_audit_logs`.
2. **Migrations:** `032_central_super_admin_features.sql`.
3. **Repository:** `PostgresSuperAdminRepository.getAuditLogs`.
4. **API Routes:** `GET /api/v1/super-admin/audit`.
5. **Frontend Page:** `AuditLogsPage.tsx`.
6. **Routing Registration:** Registered at `/audit`.
7. **Navigation Link:** Registered as "Audit Trail".
8. **Frontend API Call:** Connected.
9. **Real Data Display:** Real audit log entries.
10. **Action Execution:** Read-only table with filtering.
11. **Integration Tests:** Passing.

### 3.11 Dairy Locations & Discovery
1. **Database Schema:** `organizations` table geospatial columns (`latitude`, `longitude`, `formatted_address`, `district`, `state`, etc.).
2. **API Routes:** `GET /api/v1/dairies`, `GET /api/v1/dairies/nearby`, `PATCH /api/v1/dairies/:id/location`.
3. **Frontend Component:** `DairyLocationPicker.tsx` used inside `DairyDetailPage.tsx`.
4. **Dedicated Overview Page:** Missing top-level `/locations` page in navigation to view all dairies' coordinates, address details, discovery eligibility, and geospatial pin adjustments.
5. **Status:** Component exists; dedicated top-level page missing.

### 3.12 Platform Settings
1. **Database / Env:** `services/backend/src/config/env.ts` contains SMS, SMTP, WhatsApp, DB pool, security settings.
2. **API Route:** Needs dedicated `/api/v1/super-admin/settings` endpoint returning masked values.
3. **Frontend Page:** Missing `/settings` page in router and navigation.
4. **Status:** Backend environment exists; API endpoint and UI page missing.

---

## 4. Immediate Action Plan

To achieve **100% complete Super Admin functionality visibility and operation**, the following implementation steps will be executed:

1. **Backend Route Expansion:**
   - Add `GET /api/v1/super-admin/settings` to expose masked configuration status.
   - Enhance `getDashboardMetrics()` to include all required metrics (allocated/unallocated hardware, active/expiring AMC, global policies, published versions, support sessions).

2. **Frontend API Client (`apps/dfarm-super-admin/src/api/client.ts`):**
   - Add methods for Global Rate Policies (`getGlobalRatePolicies`, `createGlobalRatePolicy`, `createGlobalRatePolicyVersion`, `publishGlobalRatePolicyVersion`).
   - Add methods for Global FAT/SNF Policies (`getGlobalFatSnfPolicies`, `createGlobalFatSnfPolicy`, `createGlobalFatSnfPolicyVersion`, `publishGlobalFatSnfPolicyVersion`).
   - Add methods for Platform Operators (`createPlatformUser`).
   - Add methods for Platform Settings (`getPlatformSettings`).

3. **Frontend Feature Pages Creation:**
   - `features/rate-policies/GlobalRatePoliciesPage.tsx`
   - `features/fat-snf-policies/GlobalFatSnfPoliciesPage.tsx`
   - `features/hardware/HardwareInventoryPage.tsx`
   - `features/amc/AmcManagementPage.tsx`
   - `features/locations/DairyLocationsPage.tsx`
   - `features/settings/PlatformSettingsPage.tsx`
   - Enhanced `features/admins/AdminListPage.tsx` with Operator Management and Operator Creation Modal.
   - Enhanced `features/dashboard/DashboardPage.tsx` with complete 16-card metrics grid.

4. **Router & Navigation Integration:**
   - Register all 13 required modules in `App.tsx`.
   - Update `Sidebar.tsx` to match the exact required navigation structure.
