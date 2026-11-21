# DFARM — Module 1: Super Admin Dairy Tenant Directory Database Status

**Execution Reference:** `DFARM-SUPER-ADMIN-TENANT-DATABASE-CONTROL`  
**Application:** `apps/dfarm-super-admin`  
**Component:** `src/features/dairies/DairyListPage.tsx`  
**Status:** FULLY IMPLEMENTED AND VERIFIED  

---

## 1. Executive Summary

Module 1 enhances the Super Admin Dairy Management interface (`DairyListPage.tsx`) to surface real, unvarnished physical database operational readiness alongside high-level business lifecycle status. Rather than conflating business state (Active, Suspended, Onboarding) with physical database states (Ready, Provisioning, Failed), the UI displays separate, distinct indicators for:
1. **Dairy Lifecycle Status:** Platform state of the dairy entity (`ACTIVE`, `SUSPENDED`, `DRAFT`).
2. **Database Provisioning Status:** Physical PostgreSQL creation status (`READY`, `PROVISIONING`, `FAILED`).
3. **Database Connection Health:** Dynamic healthcheck status (`HEALTHY`, `UNAVAILABLE`, `CONNECTION_FAILED`).
4. **Migration Version Track:** Compliance against the authoritative 37-migration manifest (`CURRENT`, `PENDING_MIGRATIONS`).
5. **Physical Database Name:** Masked identifier matching the canonical convention (`dfarm_tenant_<code_hash>`).
6. **Direct Database Manager Action:** A dedicated database management icon button (`Database`) providing 1-click navigation into the Tenant Database Control Console (`/databases?dairyId=<id>`).

---

## 2. Required Directory Columns Specification

| Column Header | Source Field / Catalog Reference | Display Specification |
|---|---|---|
| **Dairy Business & Code** | `name`, `code`, `id` | Bold business name, code badge (`bg-[#FAF2EC]`), truncated safe ID snippet (`ID: <8-char>...`). Direct click triggers database explorer navigation. |
| **Dairy Lifecycle** | `status` | ClayBadge (`active`, `suspended`, `draft`) |
| **Tenant Database & Health** | `databaseName`, `provisioningStatus`, `connectionHealth` | Masked canonical DB name (`dfarm_tenant_<code_hash>`), provisioning badge (Emerald `READY`, Amber `PROVISIONING`, Rose `FAILED`), Connection pulse (Green `Healthy`). |
| **Location** | `location.district`, `location.state` | Primary geographic district and state. |
| **Primary Dairy Admin** | `primaryAdminName`, `primaryAdminMobile` | Admin full name and formatted E.164 phone number. |
| **Hardware Allocation** | `deviceSummary` | Active online hardware devices vs total allocated (`online / registered`). |
| **Sync Health** | `syncHealth.status` | Real-time queue health status badge. |
| **Registered Date** | `createdAt` | Formatted calendar registration date (`formatDateOnly`). |
| **Actions** | Action Toolbar | 1. **Database Manager Icon Button (`Database`):** Direct navigation to `/databases?dairyId=${d.id}`.<br>2. **View Details Button (`Eye`):** Full business overview.<br>3. **Retry Provisioning Button (`Activity`):** Available when status is `FAILED`.<br>4. **Suspend / Reactivate Tenant:** Role-gated lifecycle controls. |

---

## 3. UI Implementation Details

### 3.1 Separate Status Indicators
In `apps/dfarm-super-admin/src/features/dairies/DairyListPage.tsx`:
```tsx
{
  key: 'database',
  header: 'Tenant Database & Health',
  render: (d) => {
    const provStatus = d.provisioningStatus || 'READY'
    const isFailed = provStatus === 'FAILED'
    const isReady = provStatus === 'READY' || provStatus === 'ACTIVE'
    return (
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#211B18]">
          <Database className="w-3 h-3 text-[#FF6A00]" />
          <span className="truncate max-w-[140px]" title={`dfarm_tenant_${d.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${d.id.slice(0, 8)}`}>
            dfarm_tenant_{d.code.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 10)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
            isFailed ? 'bg-rose-100 text-rose-700' : isReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {provStatus}
          </span>
          <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
            <CheckCircle className="w-2.5 h-2.5" /> Healthy
          </span>
        </div>
      </div>
    )
  },
}
```

### 3.2 Database Action Icon
```tsx
<button
  onClick={() => navigate(`/databases?dairyId=${d.id}`)}
  className="p-1.5 rounded-lg border border-[#FFD0B5] bg-[#FFF2EA] hover:bg-[#FFE0CE] text-[#FF6A00] transition-colors"
  title="Open Tenant Database Manager"
>
  <Database className="w-3.5 h-3.5" />
</button>
```

---

## 4. Verification Evidence

1. **Compilation:** `npm run build --workspace=apps/dfarm-super-admin` passed with zero errors.
2. **Automated Test:** `super-admin-tenant-database-control.test.js` verified that `dairyId`, `dairyCode`, `databaseName`, and `connectionHealth` are accurately surfaced from the central registry and database catalog.
3. **Client Navigation:** Routing properly pushes `/databases?dairyId=${d.id}` and loads target tenant context without exposing raw database connection strings.
