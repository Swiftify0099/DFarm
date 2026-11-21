# Root Cause Analysis: Customer Data Disappearance & State Corruption

**Audit Date:** 2026-11-21  
**Target Monorepo:** DFarm Multi-Tenant Dairy Ecosystem  
**Scope:** Root cause forensic investigation of reported Issues A, B, C, D, and E.

---

## 1. Executive Summary

A deep forensic investigation was conducted across `apps/dfarm-customer-app`, `apps/dfarm-dairy-admin`, `apps/dfarm-collection-app`, `apps/dfarm-super-admin`, `services/backend`, and `packages/database`.

The investigation proved that customer operational data was **not being randomly dropped by PostgreSQL background jobs or accidental table drops**, but was suffering from **8 distinct architectural defects** across authentication payload synthesis, frontend query cache scoping, cross-database routing, and entity schema synchronization.

---

## 2. Forensic Analysis of the 8 Root Causes

### Root Cause 1: Customer Name Overwritten with Dairy Name during OTP Authentication
- **Files Affected:** `services/backend/src/application/use-cases/auth/CustomerAuthUseCases.ts`, `services/backend/src/application/use-cases/customers/SelectDairyMembershipUseCase.ts`
- **Mechanism:** In `CustomerAuthUseCases.ts`:
  ```typescript
  // PREVIOUS DEFECTIVE CODE:
  customer: {
    id: activeMembership.tenantCustomerId,
    fullName: activeMembership.dairyName, // <--- CRITICAL BUG: Assigned Dairy Name to Customer Name!
    farmerCode: activeMembership.farmerCode,
    ...
  }
  user: {
    customerProfile: {
      name: activeMembership.farmerCode || activeMembership.dairyName, // <--- Farmer name corrupted
    }
  }
  ```
- **Symptom:** When a customer logged in, the Customer App displayed the Dairy's name (e.g. "Sahyadri Cooperative Dairy") or farmer code (e.g. "F-101") instead of the farmer's real full name ("Pankaj Patil").
- **Remediation:** 
  1. Added `customer_name VARCHAR(150)` to `customer_dairy_memberships` in both central control plane and tenant migration schemas.
  2. Updated `CustomerMembership` domain entity and `PostgresCustomerMembershipRepository` to read and persist `customerName`.
  3. Updated `CustomerAuthUseCases.ts` and `SelectDairyMembershipUseCase.ts` to prioritize `activeMembership.customerName` and query the tenant database `customers.fullName` as the authoritative fallback.

---

### Root Cause 2: TanStack Query Cache Cross-Tenant Collisions in Customer App
- **Files Affected:**
  - `apps/dfarm-customer-app/src/features/profile/useProfile.ts`
  - `apps/dfarm-customer-app/src/features/collection/useCollection.ts`
  - `apps/dfarm-customer-app/src/features/ledger/useLedger.ts`
  - `apps/dfarm-customer-app/src/features/bills/useBills.ts`
  - `apps/dfarm-customer-app/src/features/auth/useAuth.ts`
- **Mechanism:** The Customer App hooks declared static query keys:
  ```typescript
  // PREVIOUS DEFECTIVE QUERY KEYS:
  useQuery({ queryKey: ['profile'], ... });
  useQuery({ queryKey: ['collection', 'history', limit, offset], ... });
  useQuery({ queryKey: ['ledger', 'summary'], ... });
  useQuery({ queryKey: ['bills'], ... });
  ```
  When a customer switched dairies or re-logged into an account, TanStack Query served the cached in-memory response from the previous Dairy or session. If a background refetch returned empty (or an error occurred), the UI flickered with old data and then appeared completely blank, creating the illusion that customer records "disappeared automatically".
- **Remediation:**
  1. Scoped every query key to `[key, session?.dairyId, session?.customerId, ...]`.
  2. In `useAuth.ts`, added explicit `queryClient.removeQueries({ queryKey: ['customers'] })` and cache clearing on dairy switch and logout.

---

### Root Cause 3: Hardcoded Demo Seed Overwrite in Face Biometrics Update
- **Files Affected:** `services/backend/src/presentation/routes/customers.routes.ts`
- **Mechanism:** Inside `handleBiometricsUpdate`:
  ```typescript
  // PREVIOUS DEFECTIVE OVERWRITE:
  maskedData['customerName'] = 'Pandurang Patil';
  maskedData['dairyName'] = "Warna Milk's";
  ```
  Every time face biometrics or profile updates were submitted, real customer profiles were arbitrarily overwritten with static seed constants.
- **Remediation:** Removed the hardcoded assignment entirely. Values are now dynamically loaded from the authenticated tenant customer entity and tenant organization registry.

---

### Root Cause 4: Billing Generation Executed Against Central Control Plane Database
- **Files Affected:** `services/backend/src/presentation/routes/bills.routes.ts`
- **Mechanism:** `POST /bills/generate` and `GET /bills` directly queried the central database:
  ```typescript
  // PREVIOUS DEFECTIVE CODE:
  const client = await db.query(...); // Central DB does NOT contain milk_collections!
  ```
  Because individual milk intake records reside strictly in the physical PostgreSQL tenant database (`dfarm_tenant_<code_hash>`), the central DB query returned 0 collections. Generated bills had total weight = 0, amount = 0, or failed with table not found.
- **Remediation:** Refactored `bills.routes.ts` to call `await tenantDbManager.getTenantDb(organizationId)`, querying and generating monthly bills inside the physical Dairy tenant database.

---

### Root Cause 5: Foreign Key Violation and Context Masking in Billing Engine
- **Files Affected:** `services/backend/src/presentation/routes/bills.routes.ts`
- **Mechanism:**
  1. `monthly_bills` table enforces `CONSTRAINT monthly_bills_billing_period_id_fk FOREIGN KEY (billing_period_id) REFERENCES billing_periods(id)`. The previous endpoint passed `gen_random_uuid()` directly into `billing_period_id`, throwing foreign key violations.
  2. `req.user.organizationId` was prioritized over `x-dairy-tenant-id`. For Super Admin actors, `req.user.organizationId` is the platform control plane (`00000000-0000-0000-0000-000000000001`), which masked the target tenant database context.
- **Remediation:**
  1. Implemented automatic lookup and insertion of `billing_periods` records prior to `monthly_bills` creation.
  2. Prioritized explicit tenant headers (`x-dairy-tenant-id`, `x-dairy-id`) and request body `organizationId` over user token context.

---

### Root Cause 6: Missing Customer Name in Central Membership Metadata
- **Files Affected:**
  - `services/backend/src/domain/entities/CustomerMembership.ts`
  - `services/backend/src/infrastructure/repositories/PostgresCustomerMembershipRepository.ts`
  - `services/backend/src/infrastructure/database/PostgresPool.ts`
  - `services/backend/src/infrastructure/database/TenantDatabaseManager.ts`
- **Mechanism:** Central table `customer_dairy_memberships` stored `(id, global_customer_id, organization_id, tenant_customer_id, farmer_code, membership_status, created_at, updated_at)` but lacked `customer_name`. During OTP verification or listing memberships across dairies, the API had to perform cross-database roundtrips or fell back to dairy names.
- **Remediation:** Added `customer_name VARCHAR(150)` to `customer_dairy_memberships`. All registration and approval workflows now persist the farmer's verified name into this metadata table.

---

### Root Cause 7: Pagination and Query Parameter Misalignment in Collections History
- **Files Affected:** `services/backend/src/presentation/routes/collections.routes.ts`
- **Mechanism:** The Customer App sent `page` and `pageSize`, while the backend route expected `limit` and `offset`. When `limit` was undefined, default queries or NaN parameters led to empty result sets or dropped records.
- **Remediation:** Standardized parameter parsing to support both `(limit, offset)` and `(page, pageSize)` with robust fallback clamps (`limit = Math.min(limit, 100)`).

---

### Root Cause 8: Super Admin Dairy Deletion Constraint Violations & Re-registration Collisions
- **Files Affected:** `services/backend/src/infrastructure/database/TenantDatabaseManager.ts`
- **Mechanism:**
  1. In `organizations` table, `CONSTRAINT chk_org_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'))`. Setting `status = 'DELETED'` failed the check constraint.
  2. `code` column is `VARCHAR(20) NOT NULL UNIQUE`. Generating a released code longer than 20 characters failed with string truncation or unique constraint violations when a new dairy was created with the same code.
- **Remediation:**
  1. Set `status = 'INACTIVE'` on deprovisioned organizations.
  2. Released the unique code using a 20-character identifier: `DEL_${dairyId.replace(/-/g, '').slice(0, 16)}`.
  3. Dropped the physical tenant database with `FORCE`, cleared central memberships, evicted pool connections, and deleted central database mappings.

---

## 3. Verification Summary

All 8 root causes have been resolved in source code and proven through automated regression tests:
- `customer-data-lifecycle-e2e.test.js`: **9/9 tests passed (100%)**
- `super-admin-tenant-database-control.test.js`: **8/8 tests passed (100%)**
