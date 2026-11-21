# Cross-Application End-to-End Test Execution Results

**Document:** `09-cross-app-e2e-results.md`  
**Monorepo Track:** DFarm Multi-Tenant Enterprise Architecture  
**Execution Timestamp:** 2026-11-21T05:24:02Z  
**Test Suite:** `services/backend/tests/customer-data-lifecycle-e2e.test.js`

---

## 1. Test Suite Summary

- **Total Tests:** 9
- **Passed:** 9
- **Failed:** 0
- **Cancelled:** 0
- **Pass Rate:** **100%**
- **Test Runner:** Node.js native test runner (`node --test`)

---

## 2. Step-by-Step Execution Log

### Step 1: Customer registers at Dairy A; global identity and tenant record are mapped
- **Execution:** Created global identity for `+919876543210` in central DB, provisioned tenant customer in Dairy A DB (`dfarm_tenant_sahyadri_01_aaaaaaaaaaaa`), and saved membership in `customer_dairy_memberships`.
- **Assertions:**
  - `gIdentity.id` is valid UUID: **PASS**
  - `memberships.length === 1`: **PASS**
  - `memberships[0].customerName === 'Pankaj Patil'`: **PASS**
  - `memberships[0].dairyName === 'Sahyadri Cooperative Dairy'`: **PASS**
- **Duration:** 71 ms  
- **Result:** **PASS**

---

### Step 2: Customer App OTP verify returns REAL customer name (NOT dairy name)
- **Execution:** Invoked `POST /api/v1/auth/customer/verify-otp` with `{ mobileNumber: '+919876543210', otp: '123456' }`.
- **Assertions:**
  - `res.status === 200`: **PASS**
  - `body.isRegistered === true`: **PASS**
  - `body.customer.fullName === 'Pankaj Patil'`: **PASS** (Defect where Dairy Name was returned is eliminated)
  - `body.user.customerProfile.name === 'Pankaj Patil'`: **PASS**
  - `body.user.customerProfile.dairyName === 'Sahyadri Cooperative Dairy'`: **PASS**
- **Duration:** 122 ms  
- **Result:** **PASS**

---

### Step 3: GET /customers/me returns accurate dairy details and membershipStatus
- **Execution:** Invoked `GET /api/v1/customers/me` with `Authorization: Bearer <customerToken>` and `x-dairy-tenant-id: dairyAId`.
- **Assertions:**
  - `res.status === 200`: **PASS**
  - `body.data.fullName === 'Pankaj Patil'`: **PASS**
  - `body.data.dairyName === 'Sahyadri Cooperative Dairy'`: **PASS**
  - `body.data.membershipStatus === 'APPROVED'`: **PASS**
  - `body.data.farmerCode === 'F-101'`: **PASS**
- **Duration:** 48 ms  
- **Result:** **PASS**

---

### Step 4: Customer registers at Dairy B; shares global identity with zero operational leakage
- **Execution:** Customer registers at second dairy (Krishna Valley, `dairyBId`). Inserted tenant customer into Dairy B tenant DB (`dfarm_tenant_krishna_02_bbbbbbbbbbbb`) and saved second membership.
- **Assertions:**
  - `memberships.length === 2`: **PASS**
  - `memberships.map(m => m.organizationId)` contains both Dairy A and Dairy B: **PASS**
  - `memberships.every(m => m.globalCustomerId === globalId)`: **PASS**
  - Zero cross-contamination between tenant customer IDs: **PASS**
- **Duration:** 32 ms  
- **Result:** **PASS**

---

### Step 5: Switch dairy to Dairy B preserves customer real name
- **Execution:** Invoked `POST /api/v1/auth/customer/select-dairy` selecting Dairy B (`dairyBId`).
- **Assertions:**
  - `res.status === 200`: **PASS**
  - `body.selectedDairy.dairyId === dairyBId`: **PASS**
  - `body.selectedDairy.dairyName === 'Krishna Valley Milk Producers'`: **PASS**
  - `body.user.customerProfile.name === 'Pankaj Patil'`: **PASS**
- **Duration:** 28 ms  
- **Result:** **PASS**

---

### Step 6: Milk collection and ledger in Dairy A are isolated from Dairy B
- **Execution:** Operator records 20.5L milk intake (FAT 4.5%, SNF 8.8%, ₹42/L = ₹861.00) in Dairy A. Transaction saved via `transactionRepo.save(txn)` to tenant DB `milk_collections` and `customer_ledger_entries`.
- **Assertions:**
  - Dairy A `GET /api/v1/collection/history` returns 1 collection of 20.5 Liters: **PASS**
  - Dairy B `GET /api/v1/collection/history` returns 0 collections (zero leakage): **PASS**
- **Duration:** 36 ms  
- **Result:** **PASS**

---

### Step 7: Bill generation in Dairy A writes to tenant DB and is visible in bills API
- **Execution:** Invoked `POST /api/v1/bills/generate` for customer in Dairy A. Ensured `billing_periods` and inserted into tenant `monthly_bills`. Queried `GET /api/v1/bills`.
- **Assertions:**
  - `genRes.status === 201`: **PASS**
  - `genBody.data.totalMilkWeight === 20.5`: **PASS**
  - `genBody.data.netPayableAmount === 861.00`: **PASS**
  - `billsRes.status === 200`: **PASS**
  - `billsBody.data.length >= 1`: **PASS**
  - `billsBody.data[0].totalLiters === 20.5`: **PASS**
- **Duration:** 35 ms  
- **Result:** **PASS**

---

### Step 8: Super Admin permanently deprovisions Dairy A
- **Execution:** Super Admin invoked `DELETE /api/v1/dairies/${dairyAId}/deprovision` with `{ confirmDairyCode: 'SAHYADRI_01' }`.
- **Assertions:**
  - `delRes.status === 200`: **PASS**
  - `delBody.success === true`: **PASS**
  - Dairy A central membership removed; Dairy B membership remains: **PASS**
  - Global customer identity preserved (`findGlobalIdentityByPhone`): **PASS**
  - Dairy B operations unaffected (`GET /api/v1/customers/me` returns `Krishna Valley` profile): **PASS**
- **Duration:** 80 ms  
- **Result:** **PASS**

---

### Step 9: Clean recreation of Dairy with fresh empty tenant DB
- **Execution:** Super Admin re-registers Dairy with recycled code `SAHYADRI_01`. `tenantDbManager.provisionTenantDatabase` creates a new physical database.
- **Assertions:**
  - Organization created without unique constraint collision: **PASS**
  - New tenant database has 0 customers: **PASS**
  - New tenant database has 0 milk collections: **PASS**
  - Zero ghost records: **PASS**
- **Duration:** 22,997 ms (includes database creation and migration track execution)  
- **Result:** **PASS**

---

## 3. Supplementary Test Suites

| Test Suite | File | Tests | Pass | Fail | Status |
|---|---|---|---|---|---|
| Tenant Database Control | `super-admin-tenant-database-control.test.js` | 8 | 8 | 0 | **PASS** |
| Customer Data Lifecycle E2E | `customer-data-lifecycle-e2e.test.js` | 9 | 9 | 0 | **PASS** |

## 4. Workspace Build Verifications

| Workspace | Command | Output | Status |
|---|---|---|---|
| Shared Types | `npm run build --workspace=packages/shared-types` | `tsc` (0 errors) | **PASS** |
| Shared Validation | `npm run build --workspace=packages/shared-validation` | `tsc` (0 errors) | **PASS** |
| Database Package | `npm run build --workspace=packages/database` | `tsc` (0 errors) | **PASS** |
| Backend Service | `npm run build:backend` | `tsc` (0 errors) | **PASS** |
| Super Admin Web | `npm run build --workspace=apps/dfarm-super-admin` | `vite build` (0 errors) | **PASS** |
| Dairy Admin Web | `npm run build --workspace=apps/dfarm-dairy-admin` | `vite build` (0 errors) | **PASS** |
| Collection App Web | `npm run build --workspace=apps/dfarm-collection-app` | `vite build` (0 errors) | **PASS** |
| Customer Mobile App | `npm run typecheck --workspace=apps/dfarm-customer-app` | `tsc --noEmit` (0 errors) | **PASS** |
