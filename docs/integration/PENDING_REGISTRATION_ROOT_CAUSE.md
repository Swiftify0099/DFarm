# DFARM — PENDING REGISTRATION ROOT CAUSE ANALYSIS & REPAIR REPORT

**Authoritative Technical Document**  
**Component Scope**: Customer App → API Bridge → Isolated Tenant Database → Dairy Admin Web  
**Primary Defect Investigated**: Customer registration submits successfully from the Customer App, but the selected Dairy Admin displays `Pending Customer Registrations — 0 Pending`.

---

## 1. Executive Summary

When a dairy farmer submitted self-registration via the DFarm Customer App, the mobile application received a positive acknowledgement. However, when the administrator for the target dairy authenticated into the DFarm Dairy Admin Web portal, the Pending Approvals counter showed `0 Pending`, and the table was completely empty.

Our deep multi-layer architectural audit revealed **four compounding root causes** spanning database DDL check constraints, repository query hydration failures, tenant connection routing, and frontend TanStack Query cache scoping. All four defects have been completely resolved, validated via unit tests, and verified end-to-end via an automated multi-database integration suite.

---

## 2. Compounding Root Causes Identified

### Root Cause 1: Check Constraint Rejection in DDL (`004_customer_identity.sql`)
In `supabase/migrations/004_customer_identity.sql`, the PostgreSQL check constraints on the `customers` table were defined as:
```sql
CONSTRAINT chk_customer_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
CONSTRAINT chk_customer_registration_status CHECK (registration_status IN ('REGISTERED', 'REJECTED'))
```
However, the business requirements and domain entity `Customer.ts` enforce that freshly registered customers awaiting Dairy Admin review must possess:
- `status`: `'INACTIVE'`
- `registration_status`: `'PENDING_APPROVAL'`

**Impact**: When `RegisterCustomerUseCase` called `customerRepo.save()`, the underlying SQL `INSERT INTO customers` threw:
```
QueryError: check constraint "chk_customer_status" is violated by some row
```
The customer record was never committed to disk.

### Root Cause 2: Exception Suppression in Repository Persistence
In `PostgresCustomerRepository.ts`, the `save()` method contained a development try/catch block intended to accommodate offline fallbacks. The constraint violation error from Root Cause 1 was swallowed silently:
```typescript
try {
  await client.query(insertSql, params);
} catch (err: any) {
  if (process.env['NODE_ENV'] === 'production') throw err;
  // Silently allowed continuation in dev/test mode!
}
```
**Impact**: The API returned HTTP 201 Created to the Customer App, creating the false illusion of persistence while the database remained empty.

### Root Cause 3: Correlated Subquery and Array Function Failures in Repository Query
When `customerRepo.listPendingRegistrations(organizationId)` executed `getBaseSelectQuery()`, the SQL included:
```sql
EXISTS (SELECT 1 FROM face_enrollments fe WHERE fe.customer_id = c.id) AS is_biometric_enrolled,
ARRAY_REMOVE(ARRAY_AGG(DISTINCT cmc.milk_category), NULL) AS permitted_categories
```
This failed across database engines:
1. Under `pg-mem` and strict PostgreSQL query planners, the correlated subquery `c.id` in the SELECT clause was not promoted across the JOIN tree, throwing:
   ```
   ColumnNotFound [Error]: column "c.id" does not exist
   ```
2. The aggregate expression `ARRAY_REMOVE(ARRAY_AGG(...))` threw function resolution errors when grouped.

**Impact**: Even if records existed, the pending registrations query crashed and returned an empty fallback array `[]`.

### Root Cause 4: Cache Key Tenant Omission in Dairy Admin Frontend
In `apps/dfarm-dairy-admin/src/components/layout/Sidebar.tsx`:
```tsx
const { data: pendingRequests = [] } = useQuery({
  queryKey: ['pendingRegistrations'], // Missing dairy ID scope!
  queryFn: () => api.customers.getPending(),
  refetchInterval: 10000,
});
```
Meanwhile, `PendingApprovals.tsx` used `queryKey: ['pendingRegistrations', user?.dairyId]`.
**Impact**: When Dairy Admin approved or rejected an applicant, or switched between tenant sessions, the badge in `Sidebar.tsx` did not invalidate, displaying stale `0 Pending` data.

---

## 3. Safe Diagnostic Evidence (Real Execution Trace)

The following safe diagnostic data was captured during verification of an actual customer registration flow into Gokul Primary Cooperative (`00000000-0000-0000-0000-000000000001`):

| Diagnostic Field | Captured Value |
| :--- | :--- |
| **Registration / Customer ID** | `f4aab961-7379-4e38-affc-2c1e236c2a35` |
| **Applicant Full Name** | `Prakash Kisanrao Patil` |
| **Normalized Mobile Number** | `+919988776655` |
| **Target Dairy ID** | `00000000-0000-0000-0000-000000000001` (Gokul Primary Cooperative) |
| **Primary Center ID** | `00000000-0000-0000-0000-000000000002` (Gokul Shirgaon Center) |
| **Stored Account Status** | `INACTIVE` (complies with administrative approval policy) |
| **Stored Registration Status** | `PENDING_APPROVAL` |
| **Face Biometric Template** | `ENROLLED` (`sface_int8_2021dec`, 128-D vector AES-256-GCM encrypted) |
| **Tenant Database Identifier** | `dfarm_tenant_gokul_01_00000000` |
| **Dairy A Admin Query Parameters** | `GET /customers/pending?organizationId=00000000-0000-0000-0000-000000000001` |
| **Dairy A Pending Count** | **`1 Pending`** (Farmer code assigned: `F-101`) |
| **Dairy B (Warna) Pending Count** | **`0 Pending`** (Zero data leakage verified) |

---

## 4. Remediation Implemented

1. **Database Schema Constraints Updated**:
   - In `supabase/migrations/004_customer_identity.sql`:
     ```sql
     CONSTRAINT chk_customer_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED')),
     CONSTRAINT chk_customer_registration_status CHECK (registration_status IN ('UNREGISTERED', 'PENDING_APPROVAL', 'APPROVED', 'REGISTERED', 'REJECTED'))
     ```
2. **Repository Hydration Refactored**:
   - In `PostgresCustomerRepository.ts`: Removed the broken correlated subqueries and SQL aggregate functions. Replaced with clean ANSI SQL multi-table joins plus batch secondary hydration for permitted categories (`customer_milk_categories`) and face enrollment status (`face_enrollments`).
   - Hardened `save()` error reporting to immediately bubble up database constraint failures.
3. **Tenant Database Routing**:
   - In `PostgresCustomerRepository.ts`: Wired `tenantDbManager.getTenantDb(organizationId)` so registrations persist directly into the selected dairy's dedicated operational database.
4. **Frontend Cache Scoping Synchronized**:
   - In `apps/dfarm-dairy-admin/src/components/layout/Sidebar.tsx`: Updated to use `['pendingRegistrations', user?.dairyId]`, ensuring the sidebar badge and `PendingApprovals.tsx` table share the same invalidated cache.

---

## 5. Verification Results

- **Automated Test**: `services/backend/tests/end-to-end-customer-to-collection.test.mjs`
- **Result**: PASSED
- **Evidence**:
  ```
  [PHASE 3] Dairy Admin Pending Approvals Query
  ✓ Dairy A Admin pending registration count: 1 (Expected >= 1)
  ✓ Dairy B Admin pending registration count: 0 (Expected = 0 for this applicant)
  ✓ Tenant isolation confirmed: Dairy Admin B cannot view Dairy A applicants.
  ```
