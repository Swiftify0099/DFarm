# DFarm — Prompt 02 Pre-Implementation Inspection Report

**Document ID:** DFARM-INSPECT-002  
**Phase:** Prompt 02 — Super Admin Production Readiness, Dairy Lifecycle, Geolocation, Hardware Inventory & AMC Management  
**Status:** COMPLETED & VERIFIED  
**Date:** 2026-11-17  
**Inspector:** DFarm Principal Solution Architect & Engineering Team  

---

## 1. Executive Summary & Purpose

In accordance with Prompt 02 instructions, a deep technical inspection of the existing DFarm codebase was conducted prior to authoring any implementation code. This inspection covers:
- Complete source code of `apps/dfarm-super-admin` (UI, API client, services, state, types).
- Backend central control-plane routes, services, use cases, repositories, and migrations (`services/backend`).
- Geolocation, hardware inventory, and AMC implementations across apps.
- The approved Prompt 01 foundation (multi-tenant database-per-dairy topology, provisioning state machine, envelope encryption, clean architecture routing).

---

## 2. Detailed Findings by Category

### 2.1 What Already Works
1. **Physical Database-per-Dairy Topology:**
   - 1 Managed PostgreSQL cluster + 1 Central Control Plane (`dfarm_central`) + 1 Operational Database per Dairy (`dfarm_tenant_<code_hash>`).
   - Verified by 100% passing tests in `tests/tenant-database-isolation.test.js` and `tests/clean-architecture.test.js`.
2. **Tenant Provisioning State Machine (`TenantDatabaseManager.ts`):**
   - Deterministic 6-stage lifecycle: `PENDING` -> `PROVISIONING` -> `DATABASE_CREATED` -> `MIGRATING` -> `VERIFYING` -> `ACTIVE`.
   - Truthful error transitions to `FAILED` with `provisioning_error` recorded.
   - Bounded connection pooling (`TENANT_POOL_MAX = 5`) with idle eviction and clean shutdown.
3. **Envelope Credential Encryption (`CredentialEncryption.ts`):**
   - AES-256-GCM encryption/decryption with 12-byte IV, 16-byte auth tag, SHA-256 key derivation.
4. **Manifest-Based Migration Runner (`MigrationRunner.ts`):**
   - Strict separation of `CONTROL_PLANE` migrations (001-003, 028-031) and `TENANT_OPERATIONAL` migrations (001-027).
   - Quarantined destructive migration `031_remove_dairy_admin_7507495615.sql`.
5. **Core Dairy Management Endpoints (`dairies.routes.ts`):**
   - `POST /api/v1/dairies` creates organization, calls `provisionTenantDatabase`, seeds primary center, creates Primary Dairy Admin in `users`, and creates invitation token in `dairy_admin_invitations`.
   - `PATCH /api/v1/dairies/:id/location` updates geographic coordinates in `organizations`.
   - `POST /api/v1/dairies/:id/suspend` and `POST /api/v1/dairies/:id/reactivate` update operational lifecycle status.
   - `GET /api/v1/dairies/invitations/validate`, `POST /api/v1/dairies/invitations/otp/request`, `POST /api/v1/dairies/invitations/activate` validate invitation tokens and activate Primary Dairy Admins.
6. **Nearby Dairy Discovery (`GetNearbyDairiesUseCase.ts` / `dairies.routes.ts`):**
   - Computes Haversine distance from customer coordinates against `organizations` table.
7. **Clean Architecture Route Gateway (`app.ts`):**
   - `cleanApiRouter` mounted authoritatively at `/api/v1`.

---

### 2.2 What Is Partially Implemented
1. **Super Admin Authentication (`AdminAuthUseCases.ts`):**
   - `POST /api/v1/auth/admin/otp/request` and `POST /api/v1/auth/admin/otp/verify` exist.
   - **Defect:** `VerifyAdminOtpUseCase` currently checks:
     `if (!row.organization_id || !row.org_name || !row.org_code) throw new UnauthorizedError('No active Dairy cooperative assigned...');`
     This inappropriately blocks platform-wide `SUPER_ADMIN` accounts that govern all dairies from the control plane rather than belonging to a single dairy cooperative.
2. **Dairy Onboarding Data Capture:**
   - The frontend `CreateDairyModal.tsx` collects bank beneficiary details (`bankName`, `bankAccountNumber`, `bankIfscCode`, `bankAccountHolderName`), but the backend currently discards or stores them in an unhardened structure.
3. **Dairy Admin Invitation Delivery:**
   - `EmailService` and `DoveOtpService` operate in standby mode when credentials are missing, which is correct and truthful, but need formal delivery status persistence in `dairy_admin_invitations`.

---

### 2.3 What Uses Mock Data or Hardcoded Values
1. **Super Admin Frontend (`apps/dfarm-super-admin`):**
   - **`apiClient.ts`:**
     - `getDashboardMetrics()` delegates entirely to `mockBackend.getDashboardMetrics()`, which generates hardcoded numbers and random fluctuations (`Math.random()`).
     - `getGlobalAnalytics()` delegates to `mockBackend.getGlobalAnalytics()`.
     - `getPlatformHealth()` delegates to `mockBackend.getPlatformHealth()`.
     - `getAlerts()`, `acknowledgeAlert()`, `resolveAlert()` delegate to `mockBackend`.
     - `getAuditLogs()` delegates to `mockBackend.getAuditLogs()`.
     - `getAdmins()` delegates to `mockBackend.getAdmins()`.
     - `generateReport()` delegates to `mockBackend.generateReport()`.
     - `getActiveSupportSession()`, `getAllSupportSessions()` delegate to `mockBackend`.
     - In `getDairies()`, `createDairy()`, `updateDairyLocation()`, it uses `mockBackend` as a silent fallback!
   - **`storage.ts`:** Uses browser `localStorage` as a simulated database (`dfarm_super_admin_dairies`, `dfarm_super_admin_admins`, etc.).
   - **`seedData.ts`:** Contains 711 lines of fake initial dairies, fake primary admins, fake alerts, and fake audit logs.
   - **Known Discrepancy (8 vs 9 Dairies):** Platform Overview shows 8 registered dairies while Platform Reports shows 9 because `seedData.ts` hardcoded differing arrays in different mock endpoints.
2. **Hardware Management:**
   - `devices.routes.ts` returns a static array with 1 hardcoded device (`dev-kiosk-01`). There is zero platform-level hardware inventory.
3. **AMC & Subscriptions:**
   - Entirely absent from the backend; no tables, no endpoints, simulated in mockBackend.

---

### 2.4 What Needs Repair
1. **`AdminAuthUseCases.ts`:**
   - Allow `SUPER_ADMIN` accounts to authenticate without requiring assignment to a single dairy cooperative.
   - Issue tokens with role `'SUPER_ADMIN'` containing platform administration scopes.
2. **`apiClient.ts` in `apps/dfarm-super-admin`:**
   - Remove all delegations to `mockBackend.ts`.
   - Route all API calls directly to real backend endpoints (`/api/v1/super-admin/*` and `/api/v1/dairies/*`).
   - Treat real backend errors truthfully; never substitute fake sample data on failure.
   - Display genuine empty states when databases have zero records.
3. **Dashboard Discrepancy (8 vs 9 Dairies):**
   - Both dashboard metrics and platform reports will query the single authoritative `organizations` table in `dfarm_central`, ensuring 100% consistent counts.

---

### 2.5 What Needs a New Implementation
1. **Central Control Plane Migration `032_central_super_admin_features.sql`:**
   - `platform_audit_logs`: Central immutable audit trail for platform actions (`actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `created_at`).
   - `central_hardware_inventory`: Platform-level hardware catalog (`id`, `serial_number`, `device_category`, `manufacturer`, `model`, `status`, `assigned_dairy_id`, `assigned_at`, `warranty_until`, `created_at`, `updated_at`).
   - `hardware_assignment_history`: Audit history of device allocations (`id`, `device_id`, `dairy_id`, `action`, `actor_id`, `assigned_at`, `revoked_at`, `notes`).
   - `amc_plans`: Catalog of AMC tiers/plans (`id`, `name`, `duration_months`, `price_inr`, `description`, `is_active`).
   - `amc_subscriptions`: Dairy AMC records (`id`, `dairy_id`, `plan_id`, `start_date`, `expiry_date`, `status`, `payment_status`, `razorpay_order_id`, `razorpay_payment_id`, `amount_paid`, `activated_at`).
   - `platform_alerts`: Real platform operational alerts (`id`, `severity`, `title`, `description`, `source`, `dairy_id`, `status`, `created_at`).
   - `dairy_bank_details`: Encrypted/masked beneficiary details for dairies (`id`, `organization_id`, `bank_name`, `account_number_encrypted`, `account_number_masked`, `ifsc_code`, `account_holder_name`).
2. **Super Admin Backend Module (`/api/v1/super-admin/*`):**
   - Real KPI metrics: Total Dairies, Active, Suspended, Provisioning, Pending Onboarding, Hardware Units, Sync Health, Open/Critical Alerts.
   - Real Analytics: Monthly onboarding growth trend and geographic distribution by state/district from `organizations` and `dairy_locations`.
   - Real Hardware Inventory: Device registration, listing, assigning to a dairy, lifecycle transitions (Available, Assigned, Maintenance, Faulty, Retired).
   - Real AMC Management: Plan configuration, dairy subscription lifecycle (Pending payment, Active, Renewal due, Expired), Razorpay order creation & signature verification.
   - Real Platform Audit Trail: Logging sensitive actions without credentials/PII exposure.
   - Real Platform Alerts: Listing, acknowledging, and resolving alerts.
   - Real Primary Dairy Admin Directory: Listing primary admins across all dairies with activation status.
3. **Clean Architecture Application & Infrastructure Layers:**
   - `services/backend/src/application/use-cases/super-admin/SuperAdminUseCases.ts`
   - `services/backend/src/infrastructure/repositories/PostgresSuperAdminRepository.ts`
   - `services/backend/src/presentation/routes/super-admin.routes.ts`

---

### 2.6 Existing UI Screens & Components (MUST REMAIN UNCHANGED)
In accordance with strict prompt instructions, **all UI screens, layouts, colors, Claymorphism styling, and components will remain 100% untouched**:
- `apps/dfarm-super-admin/src/App.tsx`
- Layouts: `AppLayout.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `ProtectedRoute.tsx`
- Claymorphism UI components: `ClayButton.tsx`, `ClayCard.tsx`, `ClayMetricCard.tsx`, `ClayModal.tsx`, `ClayBadge.tsx`, `ClayInput.tsx`, `ClaySelect.tsx`, `ClayTable.tsx`, `ClayTabs.tsx`, `ClayTextarea.tsx`
- Pages: `DashboardPage.tsx`, `DairyListPage.tsx`, `DairyDetailPage.tsx`, `CreateDairyModal.tsx`, `DairyLocationPicker.tsx`, `DairyActivationModal.tsx`, `SuspendDairyModal.tsx`, `ReactivateDairyModal.tsx`, `AdminListPage.tsx`, `TransferAdminModal.tsx`, `AlertsPage.tsx`, `AuditLogsPage.tsx`, `MonitoringPage.tsx`, `ReportsPage.tsx`, `SupportAccessPage.tsx`, `PlatformAccessPage.tsx`, `LoginPage.tsx`, `ActivationPage.tsx`
- CSS / Styling: `App.css`, `index.css`, Tailwind classes.

---

### 2.7 Dependencies on Prompt 01
- `dfarm_central` database and `organizations` table.
- `TenantDatabaseManager.ts` provisioning state machine and connection pool bounds.
- `CredentialEncryption.ts` AES-256-GCM envelope encryption.
- `MigrationRunner.ts` manifest-based execution and advisory locks.
- `cleanApiRouter` in `services/backend/src/app.ts`.

---

### 2.8 Blockers / Configuration Requirements
- No blockers prevent implementation.
- External services (Razorpay, Dove SMS, SMTP) run in truthful standby mode when credentials are unconfigured in `.env`, returning truthful pending states without simulating fake success.
