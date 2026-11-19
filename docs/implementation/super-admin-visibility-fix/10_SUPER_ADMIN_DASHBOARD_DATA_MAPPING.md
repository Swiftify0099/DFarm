# Module 8: Super Admin Dashboard Data Mapping & Analytics

**Document Reference:** `DFARM-SUPER-ADMIN-DOC-10`  
**Application Target:** `apps/dfarm-super-admin`  
**Backend Reference:** `services/backend`  
**Database Central:** `dfarm_central`  

---

## 1. Executive Summary & Purpose

The **Super Admin Dashboard** serves as the primary operational cockpit for monitoring platform vitality across all tenant cooperatives, federations, and private dairies. 

In previous iterations, the dashboard was limited to 4 basic dairy metrics, omitting vital platform capabilities such as hardware inventory allocation, statutory rate policy publication, AMC contract coverage, and support telemetry.

The enhanced dashboard integrates real control-plane data from `PostgresSuperAdminRepository.getDashboardMetrics()`, exposing an 8-card multi-dimensional KPI matrix with zero mock, guessed, or hardcoded values.

---

## 2. Metric Computation & Traceability Matrix

| KPI Card Title | Field in `DashboardMetrics` | SQL Source in `dfarm_central` | Formula / Logic |
|---|---|---|---|
| **Registered Dairies** | `totalDairies`, `activeDairies` | `SELECT count(*) FROM dairies` | Total tenant count and count of `status = 'active'` |
| **Pending Onboarding** | `pendingOnboardingDairies` | `SELECT count(*) FROM dairies WHERE status = 'draft_onboarding'` | Co-ops awaiting primary admin activation |
| **Hardware Fleet** | `totalRegisteredHardwareUnits`, `allocatedHardwareUnits`, `unallocatedHardwareUnits` | `SELECT count(*) FROM central_hardware_inventory` | Total edge units; `assigned_dairy_id IS NOT NULL` vs `IS NULL` |
| **Platform Sync Health**| `platformSyncHealthStatus`, `openAlertsCount`, `criticalAlertsCount` | `SELECT count(*) FROM platform_alerts WHERE status = 'open'` | Critical and total open alert counts across nodes |
| **AMC Care Contracts** | `activeAmcSubscriptions`, `expiringAmcSubscriptions`, `expiredAmcSubscriptions` | `SELECT count(*) FROM amc_subscriptions` | Counts by `status`: `ACTIVE`, `RENEWAL_DUE`, `EXPIRED` |
| **Global Price Policies**| `globalRatePoliciesCount`, `globalFatSnfPoliciesCount`, `publishedRateVersionsCount`, `publishedFatSnfVersionsCount` | `SELECT count(*) FROM global_rate_policies`, `global_rate_policy_versions` | Master policies count and count of published version snapshots |
| **Diagnostic Support** | `activeSupportSessionsCount` | `SELECT count(*) FROM support_diagnostic_sessions WHERE status = 'ACTIVE' AND expires_at > NOW()` | Currently authorized time-bounded diagnostic tokens |
| **Primary Dairy Admins** | `totalPrimaryAdmins`, `adminsAwaitingActivation` | `SELECT count(*) FROM dairy_admins` | Total registered tenant admins and unverified invitations |

---

## 3. Database Schema Queries & Clean Architecture

In `services/backend/src/infrastructure/repositories/PostgresSuperAdminRepository.ts`:

```typescript
async getDashboardMetrics(): Promise<DashboardMetrics> {
  // Executed against dfarm_central control-plane pool
  const [dairiesRes, hwRes, amcRes, polRateRes, polFsRes, suppRes, alertRes, admRes] = await Promise.all([
    this.pool.query(`SELECT count(*)::int as total, count(*) FILTER (WHERE status = 'active')::int as active, count(*) FILTER (WHERE status = 'draft_onboarding')::int as draft FROM dairies`),
    this.pool.query(`SELECT count(*)::int as total, count(*) FILTER (WHERE assigned_dairy_id IS NOT NULL)::int as allocated, count(*) FILTER (WHERE assigned_dairy_id IS NULL)::int as in_stock FROM central_hardware_inventory`),
    this.pool.query(`SELECT count(*) FILTER (WHERE status = 'ACTIVE')::int as active, count(*) FILTER (WHERE status = 'RENEWAL_DUE')::int as renewal_due, count(*) FILTER (WHERE status = 'EXPIRED')::int as expired FROM amc_subscriptions`),
    this.pool.query(`SELECT (SELECT count(*)::int FROM global_rate_policies) as pol_count, (SELECT count(*)::int FROM global_rate_policy_versions WHERE status = 'PUBLISHED') as ver_count`),
    this.pool.query(`SELECT (SELECT count(*)::int FROM global_fat_snf_adjustment_policies) as pol_count, (SELECT count(*)::int FROM global_fat_snf_adjustment_policy_versions WHERE status = 'PUBLISHED') as ver_count`),
    this.pool.query(`SELECT count(*)::int FROM support_diagnostic_sessions WHERE status = 'ACTIVE' AND expires_at > CURRENT_TIMESTAMP`),
    this.pool.query(`SELECT count(*)::int as total, count(*) FILTER (WHERE severity = 'critical')::int as critical FROM platform_alerts WHERE status = 'open'`),
    this.pool.query(`SELECT count(*)::int as total, count(*) FILTER (WHERE verification_status = 'unverified')::int as unverified FROM dairy_admins`)
  ]);

  return {
    totalDairies: dairiesRes.rows[0].total,
    activeDairies: dairiesRes.rows[0].active,
    pendingOnboardingDairies: dairiesRes.rows[0].draft,
    totalRegisteredHardwareUnits: hwRes.rows[0].total,
    allocatedHardwareUnits: hwRes.rows[0].allocated,
    unallocatedHardwareUnits: hwRes.rows[0].in_stock,
    activeAmcSubscriptions: amcRes.rows[0].active,
    expiringAmcSubscriptions: amcRes.rows[0].renewal_due,
    expiredAmcSubscriptions: amcRes.rows[0].expired,
    globalRatePoliciesCount: polRateRes.rows[0].pol_count,
    publishedRateVersionsCount: polRateRes.rows[0].ver_count,
    globalFatSnfPoliciesCount: polFsRes.rows[0].pol_count,
    publishedFatSnfVersionsCount: polFsRes.rows[0].ver_count,
    activeSupportSessionsCount: suppRes.rows[0].count,
    openAlertsCount: alertRes.rows[0].total,
    criticalAlertsCount: alertRes.rows[0].critical,
    totalPrimaryAdmins: admRes.rows[0].total,
    adminsAwaitingActivation: admRes.rows[0].unverified,
    platformSyncHealthStatus: alertRes.rows[0].critical > 0 ? 'degraded' : 'healthy'
  };
}
```

---

## 4. Frontend UI Implementation

- **Component Path:** `apps/dfarm-super-admin/src/features/dashboard/DashboardPage.tsx`
- **Route Path:** `/` (Dashboard root)
- **Navigation Position:** Sidebar item index 1 (`Dashboard`, icon `LayoutDashboard`)
- **Key UI Sections:**
  1. **Primary KPI Cards Grid:** 8 clay cards with category icons, live count display, and contextual badge breakdown.
  2. **Fast-Action Quicklinks:** Direct routing shortcuts to `/policies/rate`, `/policies/fat-snf`, `/hardware`, `/amc`, and `/locations`.
  3. **Platform Health & Sync Telemetry Bar:** Displays overall multi-tenant operational status with direct drill-down into open incidents.
  4. **Recent Activity Feed:** Real-time log of the latest 5 audit entries from `platform_audit_logs`.

---

## 5. Verification & Automated Test Coverage

- **Automated Test Suite:** `apps/dfarm-super-admin/src/test/reportsAndMonitoring.test.ts`
- **Backend Service Test:** `services/backend/tests/roadmap-phase-03-super-admin-core.test.js`
- **Verification Outcomes:**
  - 8 KPI cards verified with real backend data.
  - Zero hardcoded statistics.
  - Zero mock fallback in production environment.
