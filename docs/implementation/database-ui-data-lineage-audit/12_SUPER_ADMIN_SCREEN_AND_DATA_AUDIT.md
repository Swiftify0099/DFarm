# DFARM — SUPER ADMIN SCREEN AND DATA AUDIT (`dfarm-super-admin`)
## 18 PLATFORM MODULES, ORCHESTRATION & CENTRAL LINEAGE

**Audit Reference:** `DFARM-AUDIT-APP-SUPER-ADMIN-001`  
**Target:** `apps/dfarm-super-admin` (React 18 / Vite SPA)  
**Date:** 2026-11-18  

---

### 1. Screen-by-Screen Data Traceability Matrix

| Feature Module | Component File | Backend API | Central Database Table | Defect Finding |
|---|---|---|---|---|
| **Central Dashboard** | `src/features/dashboard/DashboardPage.tsx` | `GET /api/v1/super-admin/dashboard/metrics` | `organizations`, `users` | Silent catch mock fallback (**DFARM-AUDIT-003**) |
| **Dairy Registry** | `src/features/dairies/DairyListPage.tsx` | `GET /api/v1/dairies` | `organizations` | Silent catch mock fallback (**DFARM-AUDIT-003**) |
| **Onboard New Dairy**| `src/features/dairies/CreateDairyModal.tsx`| `POST /api/v1/super-admin/dairies` | `organizations`, `dairy_database_mappings` | Clean (Triggers physical DB provisioning) |
| **Dairy Detail Page**| `src/features/dairies/DairyDetailPage.tsx` | `GET /api/v1/super-admin/dairies/:id` | `organizations`, `dairy_database_mappings` | Clean |
| **Platform Admins** | `src/features/admins/AdminListPage.tsx` | `GET /api/v1/super-admin/admins` | `users` | Silent catch mock fallback (**DFARM-AUDIT-003**) |
| **System Alerts** | `src/features/alerts/AlertsPage.tsx` | `GET /api/v1/super-admin/alerts` | `platform_alerts` | Clean |
| **Support Access** | `src/features/support/SupportAccessPage.tsx`| `GET /api/v1/super-admin/support-sessions` | `support_diagnostic_sessions` | Blocked if Migration 033 unapplied (**DFARM-AUDIT-001**) |
| **Platform Reports** | `src/features/reports/ReportsPage.tsx` | `GET /api/v1/super-admin/reports` | `platform_audit_logs` | Clean |
