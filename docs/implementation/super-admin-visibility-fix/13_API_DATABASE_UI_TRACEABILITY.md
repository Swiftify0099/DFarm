# Module 11: End-to-End API, Database, and UI Traceability

**Document Reference:** `DFARM-SUPER-ADMIN-DOC-13`  
**Application Target:** `apps/dfarm-super-admin`  
**Backend Reference:** `services/backend`  
**Database Central:** `dfarm_central`  

---

## 1. Executive Summary & Purpose

This document provides complete, line-by-line traceability connecting the Super Admin React UI components to backend Express API controllers, domain repositories, and physical PostgreSQL tables within `dfarm_central`.

---

## 2. Comprehensive Traceability Matrix

| Nav # | Feature Module | Frontend UI Component | API Route / Endpoint | Backend Controller & Repository | Database Central Table |
|---|---|---|---|---|---|
| 1 | **Dashboard** | `DashboardPage.tsx` | `GET /super-admin/dashboard/metrics`<br>`GET /super-admin/dashboard/analytics` | `superAdminRepo.getDashboardMetrics()`<br>`PostgresSuperAdminRepository.ts` | `dairies`, `central_hardware_inventory`, `amc_subscriptions`, `global_rate_policies`, `platform_alerts` |
| 2 | **Dairy Management** | `DairyListPage.tsx`<br>`DairyDetailPage.tsx` | `GET /dairies`<br>`POST /dairies`<br>`PATCH /dairies/:id/suspend`<br>`PATCH /dairies/:id/reactivate` | `DairyTenantController.ts`<br>`PostgresDairyRepository.ts` | `dfarm_central.dairies`<br>`dairy_admins` |
| 3 | **Admin & Operators** | `AdminListPage.tsx`<br>`CreateOperatorModal.tsx` | `GET /super-admin/users`<br>`POST /super-admin/users`<br>`POST /dairies/:id/admins/transfer` | `superAdminRepo.createPlatformUser()`<br>`DairyTenantController.transferAdmin()` | `super_admins`<br>`dairy_admins`<br>`platform_audit_logs` |
| 4 | **Dairy Locations** | `DairyLocationsPage.tsx`<br>`DairyLocationPicker.tsx` | `GET /dairies`<br>`PATCH /dairies/:id/location`<br>`GET /dairies/nearby` | `DairyTenantController.updateLocation()`<br>`PostgresDairyRepository.ts` | `dfarm_central.dairies` (`latitude`, `longitude`, `formatted_address`) |
| 5 | **Global Rate Policies**| `GlobalRatePoliciesPage.tsx` | `GET /super-admin/policies/rate`<br>`POST /super-admin/policies/rate`<br>`POST /super-admin/policies/rate/:id/versions`<br>`POST .../publish` | `superAdminRepo.createGlobalRatePolicy()`<br>`superAdminRepo.publishRateVersion()` | `global_rate_policies`<br>`global_rate_policy_versions`<br>`platform_audit_logs` |
| 6 | **FAT/SNF Policies** | `GlobalFatSnfPoliciesPage.tsx`| `GET /super-admin/policies/fat-snf`<br>`POST /super-admin/policies/fat-snf`<br>`POST .../versions`<br>`POST .../publish` | `superAdminRepo.createGlobalFatSnfPolicy()`<br>`superAdminRepo.publishFatSnfVersion()` | `global_fat_snf_adjustment_policies`<br>`global_fat_snf_adjustment_policy_versions` |
| 7 | **Hardware Fleet** | `HardwareInventoryPage.tsx` | `GET /super-admin/hardware`<br>`POST /super-admin/hardware`<br>`POST .../:id/assign`<br>`POST .../:id/unassign`<br>`PATCH .../:id/status` | `superAdminRepo.registerHardwareUnit()`<br>`superAdminRepo.assignHardwareToDairy()`<br>`superAdminRepo.unassignHardware()` | `central_hardware_inventory`<br>`hardware_assignment_history`<br>`platform_audit_logs` |
| 8 | **AMC Contracts** | `AmcManagementPage.tsx` | `GET /super-admin/amc/plans`<br>`POST /super-admin/amc/plans`<br>`GET /super-admin/amc/subscriptions`<br>`POST .../verify-payment` | `superAdminRepo.createAmcPlan()`<br>`superAdminRepo.createAmcSubscription()`<br>`superAdminRepo.verifyAmcPayment()` | `amc_plans`<br>`amc_subscriptions`<br>`platform_audit_logs` |
| 9 | **Monitoring & Alerts** | `MonitoringAlertsPage.tsx` | `GET /super-admin/health`<br>`GET /super-admin/alerts`<br>`POST .../:id/acknowledge`<br>`POST .../:id/resolve` | `superAdminRepo.getPlatformHealth()`<br>`superAdminRepo.resolvePlatformAlert()` | `platform_alerts`<br>`platform_audit_logs` |
| 10 | **Support Diagnostics**| `SupportManagementPage.tsx` | `GET /super-admin/support/active`<br>`POST /super-admin/support/sessions`<br>`POST .../:id/revoke` | `superAdminRepo.createSupportSession()`<br>`superAdminRepo.revokeSupportSession()` | `support_diagnostic_sessions`<br>`platform_audit_logs` |
| 11 | **Platform Reports** | `ReportsPage.tsx` | `GET /super-admin/reports` | `superAdminRepo.generatePlatformReport()` | Multi-table aggregation (`dairies`, `dairy_admins`, `central_hardware_inventory`) |
| 12 | **Audit Logs** | `AuditLogsPage.tsx` | `GET /super-admin/audit` | `superAdminRepo.getPlatformAuditLogs()` | `platform_audit_logs` |
| 13 | **Platform Settings** | `PlatformSettingsPage.tsx` | `GET /super-admin/settings` | `superAdminRepo.getPlatformSettings()` | Runtime environment, database connection pool, Dove SMS, SMTP, Razorpay config |

---

## 3. Production Verification Assurance

- Every endpoint strictly queries and mutates the physical database `dfarm_central`.
- Production builds (`npm run build`) in both backend and frontend compile with zero errors.
- Automated tests across frontend and backend verify every route and UI interaction.
