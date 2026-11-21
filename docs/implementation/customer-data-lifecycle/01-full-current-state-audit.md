# DFarm Forensic Audit: Customer Data Lifecycle, Tenant Database Routing & Super Admin Deprovisioning

**Document ID:** `CDL-AUDIT-01`  
**Date:** 2026-11-21  
**Status:** FORENSIC AUDIT COMPLETE  
**Scope:** `apps/dfarm-customer-app`, `apps/dfarm-dairy-admin`, `apps/dfarm-collection-app`, `apps/dfarm-super-admin`, `services/backend`, `packages/database`

---

## 1. Executive Summary & Architecture Overview

DFarm utilizes a hybrid architecture:
1. **Central Control-Plane Database (`dfarm_central`):**
   - Stores global customer identities (`global_customer_identities`), dairy organizations registry (`organizations`), user accounts / credentials (`users`), and central cross-tenant memberships (`customer_dairy_memberships`).
   - Maintains authoritative routing mappings (`dairy_database_mappings`) linking each dairy organization UUID to its physical database name (`dfarm_tenant_<code_hash>`) and connection URI.
2. **Physical Database-Per-Dairy Tenants (`dfarm_tenant_<code_hash>`):**
   - Each Dairy possesses an independent physical PostgreSQL database instance created during dairy onboarding via `TenantDatabaseManager.provisionTenantDatabase()`.
   - Stores all dairy-scoped operational entities: `customers`, `dairy_centers`, `face_enrollments`, `milk_collections`, `shift_sessions`, `rate_charts`, `ledger_accounts`, `ledger_entries`, `monthly_bills`, `dairy_payouts`, `cattle_feed_sales`, and audit logs.
   - Enforces physical tenant isolation: zero shared tables, zero cross-tenant querying of operational transactions.
3. **Gateway Dev Server Hub (`scripts/dev-server.js` on port 3000):**
   - Reverse proxies frontend applications and backend REST APIs under unified origins:
     - `/api` & `/health` -> `http://127.0.0.1:4000` (Backend API)
     - `/dairy-admin` -> `http://127.0.0.1:5174` (Dairy Admin Vite)
     - `/super-admin` -> `http://127.0.0.1:5173` (Super Admin Vite)
     - `/collection` -> `http://127.0.0.1:5175` (Collection Web Vite)
     - `/customer` -> `http://127.0.0.1:8081` (Customer App Expo Web)

---

## 2. Actual Central & Tenant Database Schemas

### 2.1 Central Control-Plane Tables (`dfarm_central`)
- `organizations`: Primary registry of dairy societies (`id`, `code`, `name`, `status`, `address_line1`, `state`, etc.).
- `global_customer_identities`: Single identity per mobile phone (`id`, `normalized_mobile_number`, `phone_verified_at`, `created_at`, `updated_at`).
- `customer_dairy_memberships`: Central cross-tenant routing table linking:
  - `id`: UUID primary key.
  - `global_customer_id`: References `global_customer_identities(id)`.
  - `organization_id`: References `organizations(id)`.
  - `tenant_customer_id`: UUID of customer row in the Dairy's physical tenant database.
  - `farmer_code`: Dairy-specific farmer code (e.g. `F-102`).
  - `membership_status`: `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `SUSPENDED`.
  - `dairy_name`, `dairy_code`, `dairy_address`, `center_id`, `center_name`.
  - `created_at`, `updated_at`, `last_synchronized_at`.
- `dairy_database_mappings`: Tenant database catalog (`dairy_id`, `dairy_code`, `database_name`, `resource_type`, `connection_uri_encrypted`, `schema_version`, `provisioning_status`).
- `users`: Central administrative credentials (Super Admin, Dairy Admin, Center Operator).

### 2.2 Physical Dairy Tenant Tables (`dfarm_tenant_<code_hash>`)
- `tenant_metadata`: Verifies tenant database identity (`organization_id`, `dairy_code`, `schema_version`).
- `customers`: Authoritative local customer record (`id`, `organization_id`, `primary_center_id`, `farmer_code`, `full_name`, `normalized_mobile_number`, `status`, `registration_status`, `global_customer_id`, `bank_details_encrypted`, `is_deleted`).
- `face_enrollments`: Biometric embeddings (YuNet bounding box + SFace 128-dim encrypted embeddings, `customer_id`, `model_version`, `embedding_encrypted`, `status`).
- `milk_collections`: Authoritative milk intake transactions (`id`, `collection_id`, `customer_id`, `center_id`, `shift_id`, `milk_category`, `net_weight`, `fat_percentage`, `snf_percentage`, `rate_per_liter`, `total_amount`, `operator_id`, `status`).
- `ledger_accounts` & `ledger_entries`: Double-entry accounting system (`account_id`, `customer_id`, `entry_type`, `debit_amount`, `credit_amount`, `balance_after`, `reference_type`, `reference_id`).
- `monthly_bills`: Billing periods, gross milk values, feed deductions, net payable sums (`id`, `bill_number`, `customer_id`, `center_id`, `billing_period_id`, `total_milk_weight`, `gross_milk_amount`, `total_debits`, `net_payable_amount`, `bill_status`).

---

## 3. End-to-End Customer Lifecycle & Mapping

```
[Customer Mobile App]
       │
       ▼ (1) POST /api/v1/auth/customer/register
   [Central DB] ──────────────────────────► creates global_customer_identity
       │                                  ► creates customer_dairy_membership (PENDING_APPROVAL)
       ▼
   [Tenant DB] ──────────────────────────► creates customers record (status: PENDING_APPROVAL)
                                          ► stores personal & banking details
       │
       ▼ (2) Dairy Admin Review & Approval
[Dairy Admin Web]
       │
       ▼ PUT /api/v1/customers/:id/approval
   [Tenant DB] ──────────────────────────► updates customers.registration_status = 'APPROVED'
       │                                  ► generates farmer_code (e.g. F-102)
       ▼
   [Central DB] ─────────────────────────► updates customer_dairy_memberships.membership_status = 'APPROVED'
                                          ► syncs farmer_code
       │
       ▼ (3) Biometric Enrollment (YuNet + SFace)
[Customer / Dairy / Collection App]
       │
       ▼ POST /api/v1/customers/:id/biometrics/update
   [Tenant DB] ──────────────────────────► stores 128-dim encrypted embedding in face_enrollments
                                          ► flags customers.face_template_enrolled = TRUE
       │
       ▼ (4) Milk Intake & Collection
[Collection App]
       │
       ▼ POST /api/v1/collection/weigh
   [Tenant DB] ──────────────────────────► inserts milk_collections record
                                          ► posts dual ledger entry: CREDIT milk earnings
                                          ► updates customer ledger balance
       │
       ▼ (5) Billing & Passbook
[Dairy Admin / Customer App]
       │
       ▼ POST /api/v1/bills/generate & GET /api/v1/bills
   [Tenant DB] ──────────────────────────► aggregates milk_collections in billing period
                                          ► generates monthly_bill and deducts feed dues
                                          ► customer views ledger history & bill statements
```

---

## 4. Discovered Root Causes & Failure Points

### Root Cause 1: Auth Session Overwrites Customer Name with Dairy Name
- **File:** `services/backend/src/application/use-cases/auth/CustomerAuthUseCases.ts` (lines 204–219)
- **File:** `services/backend/src/application/use-cases/customers/SelectDairyMembershipUseCase.ts` (lines 118–121)
- **Defect:** `CustomerMembership` entity and `customer_dairy_memberships` table lacked a dedicated `customer_name` / `full_name` column. The auth use case populated `user.customerProfile.name` with `activeMembership.farmerCode || activeMembership.dairyName` and `customer.fullName` with `activeMembership.dairyName`.
- **Symptom:** On login or dairy switch, the customer's name in the Customer App was replaced by the Dairy's name (e.g. "DFarm Cooperative" or "Warna Milk's"), leading users to believe the customer record was corrupted or swapped.

### Root Cause 2: Destructive Test-Seed Overwrite in Biometrics Update
- **File:** `services/backend/src/presentation/routes/customers.routes.ts` (lines 741–756)
- **Defect:** A development self-healing block executed:
  ```sql
  INSERT INTO customers (...) VALUES ($1, $2, $3, $4, 'Pandurang Patil', $5, 'ACTIVE', 'APPROVED', ...)
  ON CONFLICT (id) DO UPDATE SET is_deleted = FALSE, status = 'ACTIVE', registration_status = 'APPROVED'...
  ```
  Whenever a customer whose ID was not immediately resolved in the current context updated their biometrics, their profile in PostgreSQL was overwritten with `'Pandurang Patil'` and hardcoded mock data!
- **Symptom:** Disappearance of real customer identity upon photo/face submission.

### Root Cause 3: Incomplete Profile Field Mapping in API Response
- **File:** `services/backend/src/presentation/routes/customers.routes.ts` (lines 984–996)
- **Defect:** `GET /customers/:id` mapped `maskedData.dairyId = maskedData.organizationId`, but NEVER resolved or returned `dairyName`, `dairyCode`, or `membershipStatus`.
- **Symptom:** Customer App fell back to `'DFarm Cooperative Society'` or left the dairy card blank.

### Root Cause 4: Static TanStack Query Keys & Incomplete Cache Invalidation
- **Files:**
  - `apps/dfarm-customer-app/src/features/profile/useProfile.ts` (`queryKey: ['customers', 'profile']`)
  - `apps/dfarm-customer-app/src/features/collection/useCollection.ts` (`queryKey: ['collection', 'list']`)
  - `apps/dfarm-customer-app/src/features/ledger/useLedger.ts` (`queryKey: ['ledger', 'entries']`)
  - `apps/dfarm-customer-app/src/features/bills/useBills.ts` (`queryKey: ['bills', 'list']`)
  - `apps/dfarm-customer-app/src/features/auth/useAuth.ts` (line 128: `queryClient.removeQueries({ queryKey: ['profile'] })`)
- **Defect:** Query keys were static and did not include `dairyId` or `customerId`. Furthermore, upon dairy switching, `useAuth` attempted to remove `['profile']`, which failed to match `['customers', 'profile']`.
- **Symptom:** Cached data from a previous session or other dairy remained visible in the UI, then suddenly vanished or changed on hard refresh.

### Root Cause 5: Central DB vs Tenant DB Routing Mismatch in Billing
- **File:** `services/backend/src/presentation/routes/bills.routes.ts` (lines 105, 114, 125)
- **Defect:** `POST /bills/generate` queried `db.query(...)` (central control-plane DB) instead of `const tenantDb = await getTenantDb(organizationId)`.
- **Symptom:** Collections in tenant DB were invisible to the billing engine; generated bills had 0 total weight/amount or failed with `Customer not found` (404).

### Root Cause 6: Customer ID Resolution in Ledger & Bills
- **File:** `services/backend/src/application/use-cases/ledger/CustomerLedgerUseCases.ts` (line 43)
- **Defect:** `WHERE mb.customer_id = $1` matched only exact UUID. If a client queried with `globalCustomerId`, bills were not returned.
- **Symptom:** Bills were empty when queried via global identity.

### Root Cause 7: Pagination Query Parameter Mismatch in Collection History
- **File:** `apps/dfarm-customer-app/src/features/collection/useCollection.ts` sends `{ page: 1, pageSize: 30 }`.
- **File:** `services/backend/src/presentation/routes/collections.routes.ts` only read `limit` and `offset`.
- **Symptom:** Collection pagination parameters were ignored.

### Root Cause 8: Missing Permanent Dairy Deprovisioning in Super Admin
- **File:** `services/backend/src/infrastructure/database/TenantDatabaseManager.ts`
- **File:** `apps/dfarm-super-admin/src/features/dairies/`
- **Defect:** No deprovisioning API or UI modal existed to drop physical tenant databases, purge dairy-scoped memberships, or delete `dairy_database_mappings`.
- **Symptom:** Super Admin could only suspend dairies; recreation with the same code collided or retained orphaned databases.
