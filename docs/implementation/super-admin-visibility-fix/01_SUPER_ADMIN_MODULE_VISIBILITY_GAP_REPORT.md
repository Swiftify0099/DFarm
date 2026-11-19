# DFARM — SUPER ADMIN MODULE VISIBILITY GAP REPORT

**Execution Reference:** DFARM-SUPER-ADMIN-FUNCTIONALITY-VISIBILITY  
**Target Application:** `apps/dfarm-super-admin`  
**Backend:** `services/backend`  
**Database:** `dfarm_central`  
**Date:** 2026-11-18  

---

## 1. Root Cause Analysis of Visibility Gaps

Through comprehensive file and code tracing from database migrations to the React router, each visibility gap was identified:

### Gap 1: Global Rate Policies
- **Backend State:** Fully implemented in `services/backend/src/presentation/routes/super-admin.routes.ts` (`/policies/rate`) and `PostgresSuperAdminRepository.ts`. Backed by `global_rate_policies` and `global_rate_policy_versions` in `dfarm_central`.
- **Frontend State:** Neither `apps/dfarm-super-admin/src/api/client.ts` nor `features/` had policy methods or views.
- **Root Cause:** Page component was never authored in the UI layer; route was omitted in `App.tsx`; sidebar link was omitted in `Sidebar.tsx`.
- **Resolution:**
  1. Add typed API client methods in `apps/dfarm-super-admin/src/api/client.ts`.
  2. Implement `features/rate-policies/GlobalRatePoliciesPage.tsx` with draft creation, parameter configuration, checksum calculation, version history, Dairy applicability breakdown, and publishing.
  3. Register route `/policies/rate` in `App.tsx`.
  4. Add navigation item in `Sidebar.tsx`.

### Gap 2: Global FAT/SNF Adjustment Policies
- **Backend State:** Fully implemented in `super-admin.routes.ts` (`/policies/fat-snf`) with checksum calculation, temperature/bracket deductions, and rounding rules.
- **Frontend State:** No React page, no route, no sidebar link.
- **Root Cause:** UI implementation was deferred while backend testing was completed.
- **Resolution:**
  1. Add typed API client methods in `client.ts`.
  2. Implement `features/fat-snf-policies/GlobalFatSnfPoliciesPage.tsx` with deduction rule tables, milk category toggle, draft creation modal, publishing, and version history.
  3. Register route `/policies/fat-snf` in `App.tsx`.
  4. Add navigation item in `Sidebar.tsx`.

### Gap 3: Central Hardware Inventory & Allocation
- **Backend State:** Fully implemented with registration, assignment, status update, unassignment, and assignment history.
- **Frontend State:** `apiClient` had methods (`getHardware`, `registerHardware`, etc.), but NO feature page existed in `apps/dfarm-super-admin/src/features/`.
- **Root Cause:** Frontend page was missing despite API client methods being present.
- **Resolution:**
  1. Create `features/hardware/HardwareInventoryPage.tsx`.
  2. Implement device registration modal, Dairy allocation modal, status update modal, and filtering by category/status/dairy.
  3. Register route `/hardware` in `App.tsx`.
  4. Add navigation item in `Sidebar.tsx`.

### Gap 4: AMC & Service Management
- **Backend State:** Fully implemented with plan catalog, subscriptions, and Razorpay verification in backend.
- **Frontend State:** `apiClient` had methods (`getAmcPlans`, `getAmcSubscriptions`, etc.), but NO feature page existed in `apps/dfarm-super-admin/src/features/`.
- **Root Cause:** Frontend page was missing.
- **Resolution:**
  1. Create `features/amc/AmcManagementPage.tsx`.
  2. Implement plan display, subscription listing, new subscription modal, payment verification modal, and expiry tracking.
  3. Register route `/amc` in `App.tsx`.
  4. Add navigation item in `Sidebar.tsx`.

### Gap 5: Platform Operator Management
- **Backend State:** Backend supports `GET /users` and `POST /users` with role validation (`SUPER_ADMIN` vs `PLATFORM_OPERATOR`).
- **Frontend State:** `PlatformAccessPage.tsx` showed a read-only list of operators and static permissions, but lacked operator onboarding/invitation. Navigation labeled it "Access & Permissions".
- **Root Cause:** Missing operator creation modal and incomplete separation of Dairy Admins vs Platform Operators.
- **Resolution:**
  1. Integrate Operator Creation modal (`CreateOperatorModal`) with mobile OTP requirement and role selection.
  2. Unify Admin & Operator Management in `/admins` with clear tabs for "Primary Dairy Admins" and "Platform Operators", and retain `/platform-access` as the granular permission matrix.
  3. Connect `createPlatformUser()` in `apiClient`.

### Gap 6: Dairy Locations & Discovery
- **Backend State:** Proximity search `/dairies/nearby` and location patch `PATCH /dairies/:id/location` are operational.
- **Frontend State:** Location picker was nested exclusively inside `DairyDetailPage.tsx`. No platform-wide overview existed for discovering and verifying all dairies' geospatial pins.
- **Root Cause:** No dedicated top-level route was mapped for platform-wide discovery and location governance.
- **Resolution:**
  1. Create `features/locations/DairyLocationsPage.tsx` listing all dairies with geospatial coordinates, full address, village, district, state, pin status, and quick map picker modal.
  2. Register route `/locations` in `App.tsx`.
  3. Add navigation item in `Sidebar.tsx`.

### Gap 7: Platform Settings
- **Backend State:** Environment configuration exists in `env.ts` (SMS, SMTP, WhatsApp, DB pools, Security).
- **Frontend State:** No settings route or UI view existed.
- **Root Cause:** Dedicated endpoint `/super-admin/settings` was not exposed in backend routing.
- **Resolution:**
  1. Add `GET /api/v1/super-admin/settings` in `super-admin.routes.ts` returning masked configuration.
  2. Add `getPlatformSettings()` in `apiClient`.
  3. Create `features/settings/PlatformSettingsPage.tsx` displaying live connectivity status and provider configurations.
  4. Register route `/settings` in `App.tsx`.
  5. Add navigation item in `Sidebar.tsx`.

### Gap 8: Super Admin Dashboard Metrics Incompleteness
- **Backend State:** `getDashboardMetrics()` only computed 10 metrics.
- **Frontend State:** `DashboardPage.tsx` displayed only 4 cards.
- **Root Cause:** UI had not incorporated AMC counts, hardware allocation breakdown, policy counts, and support session counts.
- **Resolution:**
  1. Expand backend query in `PostgresSuperAdminRepository.getDashboardMetrics()` to calculate:
     - `allocatedHardware`
     - `unallocatedHardware`
     - `activeAmc`
     - `expiringAmc`
     - `expiredAmc`
     - `globalPolicies`
     - `publishedPolicyVersions`
     - `activeSupportSessions`
  2. Update `DashboardPage.tsx` with a rich 12-to-16 card metric dashboard with direct navigation to corresponding detail pages.

---

## 2. Gap Remediation Action Matrix

| Module | Gap Type | Actions to Execute | Target Files |
|---|---|---|---|
| Global Rate Policies | UI Missing | Add client methods, build Page, register route, add sidebar item | `client.ts`, `GlobalRatePoliciesPage.tsx`, `App.tsx`, `Sidebar.tsx` |
| FAT/SNF Policies | UI Missing | Add client methods, build Page, register route, add sidebar item | `client.ts`, `GlobalFatSnfPoliciesPage.tsx`, `App.tsx`, `Sidebar.tsx` |
| Hardware Inventory | UI Missing | Build Page with modals, register route, add sidebar item | `HardwareInventoryPage.tsx`, `App.tsx`, `Sidebar.tsx` |
| AMC Management | UI Missing | Build Page with modals, register route, add sidebar item | `AmcManagementPage.tsx`, `App.tsx`, `Sidebar.tsx` |
| Monitoring & Alerts | Navigation Alignment | Align naming and route continuity | `Sidebar.tsx` |
| Support Access | Navigation Alignment | Align naming and route continuity | `Sidebar.tsx` |
| Operator Management | UI Mutation Missing | Add Create Operator Modal & tabs | `AdminListPage.tsx`, `CreateOperatorModal.tsx`, `client.ts` |
| Dairy Locations | Dedicated UI Missing | Create dedicated Locations & Discovery page | `DairyLocationsPage.tsx`, `App.tsx`, `Sidebar.tsx` |
| Dashboard Data | Incomplete Cards | Enhance backend metrics query & expand frontend KPI cards | `PostgresSuperAdminRepository.ts`, `DashboardPage.tsx` |
| Platform Settings | Missing Endpoint & UI | Add backend endpoint, client method, Page, route, and nav | `super-admin.routes.ts`, `PlatformSettingsPage.tsx`, `App.tsx`, `Sidebar.tsx` |
