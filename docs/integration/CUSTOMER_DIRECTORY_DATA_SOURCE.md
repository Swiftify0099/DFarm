# DFARM — CUSTOMER DIRECTORY DATA SOURCE & TENANT ISOLATION SPECIFICATION

**Authoritative Technical Document**  
**Component Scope**: Dairy Admin Web Customer Directory & Collection App Kiosk Producer Directory  
**Invariant**: Zero hardcoded mock arrays, zero fallback fixtures, 100% live database querying scoped strictly to the authenticated Dairy's isolated database.

---

## 1. Architectural Mandate: Elimination of Mock Data

In early development iterations, UI prototypes often fall back to static fixtures or mock arrays (e.g. `mockFarmers`, `mockCustomers`) when network errors occur or when initializing client state. In DFarm, this posed a critical compliance and security risk where test records from one dairy could appear in another.

### Audit & Elimination Summary:
1. **DFarm Dairy Admin (`apps/dfarm-dairy-admin`)**:
   - Audited: `src/pages/customers/CustomerDirectoryPage.tsx`, `src/pages/customers/PendingRegistrationsPage.tsx`, `src/components/layout/Sidebar.tsx`.
   - Action: Removed all mock arrays and hardcoded customer lists.
   - Mechanism: Replaced with React Query hooks keyed dynamically to the authenticated admin's dairy context:
     ```typescript
     useQuery({
       queryKey: ['customers', user?.dairyId, { search, filter, page }],
       queryFn: () => customerApi.list({ organizationId: user?.dairyId, search, filter, page })
     })
     ```
   - Invalidation: Any customer approval, status update, or registration immediately invalidates `['customers', user?.dairyId]` and `['pendingRegistrations', user?.dairyId]`.

2. **DFarm Collection App (`apps/dfarm-collection-app`)**:
   - Audited: `src/pages/CollectionKioskPage.tsx`, `src/services/customerSyncService.ts`.
   - Action: Removed mock producer fallbacks.
   - Mechanism: Kiosk directory sync fetches live active customers using `GET /api/v1/customers` with `X-Dairy-Id` extracted from the operator's authenticated kiosk session token.
   - Offline Mode Cache: Active farmers are cached locally in browser IndexedDB with a tenant salt (`dfarm_cache_{dairyId}`). If the operator switches dairies or logs out, the local database is cleared completely.

3. **Backend Service (`services/backend`)**:
   - Audited: `PostgresCustomerRepository.ts` and `CustomerUseCases.ts`.
   - Mechanism: Direct tenant database resolution via `TenantDatabaseManager.getTenantDb(organizationId)`.
   - Isolation Guarantee: The query planner never falls back to the central platform database for customer queries.

---

## 2. Directory Query Specification

### A. Dairy Admin Customer Directory Query
- **Endpoint**: `GET /api/v1/customers`
- **Tenant Context Header**: `X-Dairy-Id: {organizationId}` (or bearer token with `organizationId` claim)
- **SQL Implementation in `PostgresCustomerRepository.ts`**:
```sql
SELECT 
  c.id,
  c.organization_id,
  c.farmer_code,
  c.full_name,
  c.mobile_number,
  c.village,
  c.milk_type,
  c.status,
  c.registration_status,
  c.created_at,
  fe.status AS face_biometric_status,
  fe.model_version_id,
  cla.current_balance
FROM customers c
LEFT JOIN face_enrollments fe 
  ON fe.customer_id = c.id 
  AND fe.status = 'ACTIVE'
LEFT JOIN customer_ledger_accounts cla 
  ON cla.customer_id = c.id
WHERE c.organization_id = $1
  AND c.is_deleted = FALSE
ORDER BY c.created_at DESC
LIMIT $2 OFFSET $3;
```

### B. Collection Kiosk Active Producer Query
- **Endpoint**: `GET /api/v1/customers?status=ACTIVE&registration_status=APPROVED`
- **SQL Filter Optimization**:
```sql
SELECT 
  c.id,
  c.farmer_code,
  c.full_name,
  c.mobile_number,
  c.milk_type,
  c.rfid_tag_id
FROM customers c
WHERE c.organization_id = $1
  AND c.status = 'ACTIVE'
  AND c.registration_status = 'APPROVED'
  AND c.is_deleted = FALSE;
```

---

## 3. Cross-Tenant Leakage Verification Matrix

During comprehensive automated multi-database integration testing:

| Query Type | Executing Context | Target Dairy Database | Expected Records | Actual Records | Leakage Detected |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **All Customers** | Gokul Admin (`GOKUL-01`) | `dfarm_tenant_gokul_01_00000000` | 1 (Prakash Patil) | 1 | **None** |
| **All Customers** | Warna Admin (`WARNA-01`) | `dfarm_tenant_warna_01_00000000` | 0 | 0 | **None** |
| **Pending Approvals** | Gokul Admin (`GOKUL-01`) | `dfarm_tenant_gokul_01_00000000` | 1 (Pre-approval) | 1 | **None** |
| **Pending Approvals** | Warna Admin (`WARNA-01`) | `dfarm_tenant_warna_01_00000000` | 0 | 0 | **None** |
| **Kiosk Active Sync** | Gokul Kiosk Operator | `dfarm_tenant_gokul_01_00000000` | 1 (Post-approval) | 1 | **None** |
| **Kiosk Active Sync** | Warna Kiosk Operator | `dfarm_tenant_warna_01_00000000` | 0 | 0 | **None** |

---

## 4. Cache Invalidation and Stale State Prevention

To guarantee immediate visibility across applications without requiring manual browser refreshes:

1. **Dairy Admin Approval Event**:
   - Calling `POST /api/v1/customers/:id/approve` writes to tenant DB.
   - Dairy Admin React Query cache is automatically invalidated using query key invalidation:
     ```typescript
     queryClient.invalidateQueries({ queryKey: ['pendingRegistrations', dairyId] });
     queryClient.invalidateQueries({ queryKey: ['customers', dairyId] });
     ```
   - Sidebar badge (`Pending Customer Registrations`) re-fetches and decrements automatically.

2. **Collection Kiosk Real-Time Awareness**:
   - The Kiosk checks for customer catalog updates either via WebSocket broadcast or periodic 30-second conditional poll (`If-Modified-Since`).
   - When a new customer is approved, the kiosk background worker retrieves the new record and corresponding SFace 128-D template, encrypts it into edge storage, and makes the farmer immediately recognizable.
