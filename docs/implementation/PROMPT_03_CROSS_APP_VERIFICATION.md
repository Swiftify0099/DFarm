# DFARM — PROMPT 03 CROSS-APP VERIFICATION
## CROSS-APPLICATION INTEGRATION & API CONTRACT ALIGNMENT

**Document Reference:** `DFARM-CROSSAPP-PROMPT-03`  
**Execution Phase:** Prompt 03  
**Status:** FULLY COMPATIBLE & VERIFIED  
**Surfaces Verified:**
1. `apps/dfarm-dairy-admin` (Dairy Operational Management)
2. `apps/dfarm-customer-app` (Farmer Mobile App)
3. `apps/dfarm-collection-app` (Milk Collection Kiosk Counter)
4. `apps/dfarm-super-admin` (Central Platform Administration)
5. `services/backend` (Shared Core Services)

---

## 1. INTEGRATION WITH CUSTOMER APP (`apps/dfarm-customer-app`)

The farmer mobile app relies on Dairy Admin workflows for identity approval, passbook synchronization, and monthly billing statements.

### 1.1 Farmer Registration & Approval Flow
- **Initiation**: Customer submits registration via `POST /api/v1/customers/register`. Status is set to `PENDING_APPROVAL`.
- **Review**: Dairy Admin views candidate in pending queue via `GET /api/v1/customers/pending`.
- **Approval**: Dairy Admin approves applicant via `PATCH /api/v1/customers/:id/approve` or `POST /api/v1/customers/:id/approve`.
- **Farmer App Polling**: Farmer app polls `GET /api/v1/customers/:id/status`. As soon as admin approves, the endpoint returns `status: 'APPROVED'` along with the assigned permanent `customerCode`.

### 1.2 Subledger Passbook Synchronization
- Customer App queries `GET /api/v1/ledger/entries?customerId=:id` and `GET /api/v1/ledger/balance?customerId=:id`.
- The Dairy Admin backend serves these from the tenant's isolated `customer_ledger_entries` table.
- Every weighment processed in the dairy immediately generates a `MILK_CREDIT` entry visible on the farmer's passbook screen.
- Every payment disbursed by the Dairy Admin immediately generates a `PAYMENT` debit entry.

### 1.3 Monthly Billing & Settlements
- Dairy Admin generates billing cycles via `POST /api/v1/bills/generate`.
- Customer App fetches finalized bills via `GET /api/v1/bills?customerId=:id`. The schema and calculation match the Milk Collection Transaction aggregate values to two decimal places.

---

## 2. INTEGRATION WITH COLLECTION APP (`apps/dfarm-collection-app`)

The collection kiosk counter operates at the milk collection center and interacts constantly with the Dairy Admin operational data plane.

### 2.1 Shift Session Coordination
- **Opening**: Counter operator or Dairy Admin opens a shift via `POST /api/v1/collections/sessions` or `POST /api/v1/collections/sessions/open`.
- **Active Session Query**: Collection App queries `GET /api/v1/collections/sessions/active?centerId=:centerId`. Returns the current active session code.
- **Closing**: Shift is closed via `POST /api/v1/collections/sessions/:sessionId/close`, recording total liters, average FAT/SNF, and total payout obligation.

### 2.2 Milk Intake Weighment Workflow
- Collection App posts intake via `POST /api/v1/collections/intake` or `POST /api/v1/collections/transactions`.
- Supports offline queue sync via idempotency keys (`idempotencyKey`).
- Validates that customer status is `ACTIVE` (rejects unapproved farmers).
- Verifies milk category matches farmer's authorized category (`COW`, `BUFFALO`, `BOTH`).
- Returns real-time receipt number, applied rate per liter, total amount, and new ledger balance.

### 2.3 Dynamic Rate Chart Distribution
- Collection App fetches the effective rate chart via `GET /api/v1/rate-charts?centerId=:centerId`.
- Both apps use identical calculation math: base rate per FAT/SNF unit, grid lookup, and volume pricing.

---

## 3. INTEGRATION WITH SUPER ADMIN (`apps/dfarm-super-admin`)

Central platform administration provisions and monitors the dairy tenant, supplying hardware and enforcing platform policies.

### 3.1 Hardware Inventory Assignment & Visibility
- Super Admin assigns hardware terminals and analyzers to a Dairy via `POST /api/v1/super-admin/hardware/assignments`.
- Dairy Admin queries its allocated hardware via `GET /api/v1/devices`, which merges `dfarm_central.central_hardware_inventory` with tenant-registered kiosk terminals.

### 3.2 Tenant Lifecycle & Operational Readiness
- Super Admin controls tenant status (`ACTIVE`, `SUSPENDED`).
- If Super Admin suspends a dairy (e.g. for expired AMC), the backend blocks Dairy Admin access at the authentication gate (`Administrator account is suspended or inactive`).
- Upon reactivation by Super Admin, Dairy Admin operational capability is immediately restored without data loss.

---

## 4. CROSS-APPLICATION VERIFICATION MATRIX

| Integration Point | Source App | Target App / API | Status | Verified By |
|---|---|---|---|---|
| Farmer Registration | Customer App | Backend (`/customers/register`) | VERIFIED | `clean-architecture.test.js`, `dairy-admin-production.test.js` |
| Farmer Approval | Dairy Admin | Backend (`/customers/:id/approve`) | VERIFIED | `dairy-admin-production.test.js` (Subtest 8) |
| Polling Status | Customer App | Backend (`/customers/:id/status`) | VERIFIED | `dairy-admin-production.test.js` (Subtests 6, 9) |
| Shift Session Open | Collection App | Backend (`/collections/sessions/open`) | VERIFIED | `dairy-admin-production.test.js` (Subtest 13) |
| Active Shift Query | Collection App | Backend (`/collections/sessions/active`) | VERIFIED | `dairy-admin-production.test.js` (Subtest 14) |
| Intake Weighment | Collection App | Backend (`/collections/intake`) | VERIFIED | `dairy-admin-production.test.js` (Subtests 16, 17) |
| Rate Chart Calculation | Dairy Admin & Kiosk | Backend (`/rate-charts/calculate`) | VERIFIED | `dairy-admin-production.test.js` (Subtest 22) |
| Hardware Allocation | Super Admin | Dairy Admin (`/devices`) | VERIFIED | `dairy-admin-production.test.js` (Subtest 24) |
| Double-Entry Passbook | Customer App | Dairy Admin (`/ledger/entries`) | VERIFIED | `dairy-admin-production.test.js` (Subtest 27) |
| Zero Razorpay Farmer Payout | Dairy Admin | Backend (`/payments`) | VERIFIED | `dairy-admin-production.test.js` (Subtest 26) |
