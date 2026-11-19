# DFARM — SUPER ADMIN NAVIGATION AND ROUTE MAP

**Execution Reference:** DFARM-SUPER-ADMIN-FUNCTIONALITY-VISIBILITY  
**Target Application:** `apps/dfarm-super-admin`  
**Date:** 2026-11-18  

---

## 1. Approved Super Admin Navigation Structure

The Super Admin navigation reflects the exact approved 13-item platform administration hierarchy:

```
DFarm Super Admin
├── 1. Dashboard                     ( / )
├── 2. Dairy Management              ( /dairies )
├── 3. Admin & Operator Management   ( /admins )
├── 4. Dairy Locations & Discovery   ( /locations )
├── 5. Global Rate Policies          ( /policies/rate )
├── 6. Global FAT/SNF Policies       ( /policies/fat-snf )
├── 7. Hardware Inventory & Alloc.   ( /hardware )
├── 8. AMC & Service Management      ( /amc )
├── 9. Platform Monitoring & Alerts  ( /monitoring )
├── 10. Support Management           ( /support-access )
├── 11. Platform Reports             ( /reports )
├── 12. Audit Logs                   ( /audit )
└── 13. Platform Settings            ( /settings )
```

---

## 2. Complete Navigation to Architecture Traceability Map

| # | Navigation Item | Route Path | React Page Component | API Endpoint(s) | Primary Central DB Table | Authorization Guard |
|---|---|---|---|---|---|---|
| 1 | Dashboard | `/` | `DashboardPage` | `GET /super-admin/dashboard/metrics`<br>`GET /super-admin/dashboard/analytics` | `organizations`, `central_hardware_inventory`, `amc_subscriptions`, `platform_alerts` | `requirePlatformStaffRole` |
| 2 | Dairy Management | `/dairies` | `DairyListPage`<br>`DairyDetailPage` | `GET /dairies`<br>`POST /dairies`<br>`POST /dairies/:id/suspend`<br>`POST /dairies/:id/reactivate` | `organizations`, `dairy_admin_invitations` | `dairies:read`, `dairies:create`, `dairies:manage` |
| 3 | Admin & Operator Management | `/admins` | `AdminListPage`<br>`PlatformAccessPage` | `GET /super-admin/admins`<br>`GET /super-admin/users`<br>`POST /super-admin/users` | `users`, `dairy_admin_invitations` | `admins:read`, `admins:manage`, `requireSuperAdminRole` |
| 4 | Dairy Locations & Discovery | `/locations` | `DairyLocationsPage` | `GET /dairies`<br>`PATCH /dairies/:id/location`<br>`GET /dairies/nearby` | `organizations` (geospatial columns) | `dairies:read`, `dairies:manage` |
| 5 | Global Rate Policies | `/policies/rate` | `GlobalRatePoliciesPage` | `GET /super-admin/policies/rate`<br>`POST /super-admin/policies/rate`<br>`POST /super-admin/policies/rate/:id/versions`<br>`POST /.../publish` | `global_rate_policies`<br>`global_rate_policy_versions` | `requirePlatformStaffRole` (read)<br>`requireSuperAdminRole` (mutate) |
| 6 | Global FAT/SNF Policies | `/policies/fat-snf` | `GlobalFatSnfPoliciesPage` | `GET /super-admin/policies/fat-snf`<br>`POST /super-admin/policies/fat-snf`<br>`POST /.../versions`<br>`POST /.../publish` | `global_fat_snf_adjustment_policies`<br>`global_fat_snf_adjustment_policy_versions` | `requirePlatformStaffRole` (read)<br>`requireSuperAdminRole` (mutate) |
| 7 | Hardware Inventory & Allocation | `/hardware` | `HardwareInventoryPage` | `GET /super-admin/hardware`<br>`POST /super-admin/hardware`<br>`POST /.../assign`<br>`POST /.../unassign`<br>`PATCH /.../status` | `central_hardware_inventory`<br>`hardware_assignment_history` | `requirePlatformStaffRole` (read)<br>`requireSuperAdminRole` (mutate) |
| 8 | AMC & Service Management | `/amc` | `AmcManagementPage` | `GET /super-admin/amc/plans`<br>`POST /super-admin/amc/plans`<br>`GET /super-admin/amc/subscriptions`<br>`POST /super-admin/amc/subscriptions`<br>`POST /.../verify-payment` | `amc_plans`<br>`amc_subscriptions` | `requirePlatformStaffRole` (read)<br>`requireSuperAdminRole` (mutate) |
| 9 | Platform Monitoring & Alerts | `/monitoring`<br>`/alerts` | `MonitoringPage`<br>`AlertsPage` | `GET /super-admin/health`<br>`GET /super-admin/alerts`<br>`POST /alerts/:id/acknowledge`<br>`POST /alerts/:id/resolve` | `platform_alerts`, PostgreSQL cluster connectivity | `system:monitor`<br>`alerts:manage` |
| 10 | Support Management | `/support-access` | `SupportAccessPage` | `GET /super-admin/support/sessions`<br>`POST /super-admin/support/sessions`<br>`POST /.../revoke` | `support_diagnostic_sessions` | `support:access`<br>`requireSuperAdminRole` |
| 11 | Platform Reports | `/reports` | `ReportsPage` | `POST /super-admin/reports/generate` | All central tables via aggregate query generator | `reports:read` |
| 12 | Audit Logs | `/audit` | `AuditLogsPage` | `GET /super-admin/audit` | `platform_audit_logs` | `audit:read` |
| 13 | Platform Settings | `/settings` | `PlatformSettingsPage` | `GET /super-admin/settings` | Environment and provider configs in `services/backend` | `platform:admin`<br>`requireSuperAdminRole` |

---

## 3. Router Configuration Plan (`App.tsx`)

```tsx
<Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
  <Route index element={<DashboardPage />} />
  <Route path="dairies" element={<DairyListPage />} />
  <Route path="dairies/:dairyId" element={<DairyDetailPage />} />
  <Route path="admins" element={<AdminListPage />} />
  <Route path="locations" element={<DairyLocationsPage />} />
  <Route path="policies/rate" element={<GlobalRatePoliciesPage />} />
  <Route path="policies/fat-snf" element={<GlobalFatSnfPoliciesPage />} />
  <Route path="hardware" element={<HardwareInventoryPage />} />
  <Route path="amc" element={<AmcManagementPage />} />
  <Route path="monitoring" element={<MonitoringPage />} />
  <Route path="alerts" element={<AlertsPage />} />
  <Route path="support-access" element={<SupportAccessPage />} />
  <Route path="reports" element={<ReportsPage />} />
  <Route path="audit" element={<AuditLogsPage />} />
  <Route path="platform-access" element={<PlatformAccessPage />} />
  <Route path="settings" element={<PlatformSettingsPage />} />
</Route>
```
