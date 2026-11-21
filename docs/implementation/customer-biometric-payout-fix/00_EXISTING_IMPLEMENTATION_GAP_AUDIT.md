# DFarm Customer Registration, Face Biometrics & Dairy Admin Payout: Existing Implementation Gap Audit

**Execution Reference:** `DFARM-CUSTOMER-REGISTRATION-BIOMETRIC-PAYOUT-FIX`  
**Document Number:** `00_EXISTING_IMPLEMENTATION_GAP_AUDIT.md`  
**Date:** November 2026  
**Status:** COMPLETE AUDIT / PRE-REMEDIATION BASELINE  
**Repository Branch/Worktree:** `dfarm_customer_app_init`  

---

## 1. Executive Summary

This pre-remediation audit inspects the current implementation across all four primary DFarm applications (`apps/dfarm-customer-app`, `apps/dfarm-collection-app`, `apps/dfarm-dairy-admin`, `apps/dfarm-super-admin`), the core backend (`services/backend`), and multi-tenant database infrastructure (`packages/database`, `supabase/migrations`, and physical PostgreSQL cluster at `127.0.0.1:54322`).

The audit verifies the three critical failure areas reported by users:
1. **Issue A:** Customer Bank Beneficiary details are absent during Customer App registration and therefore unavailable for Dairy Admin billing and payout batch creation.
2. **Issue B:** Face Biometric Enrollment in the Customer App displays `"Registration Error: An unexpected Server error occurred, please contact system support"`.
3. **Issue C:** Dairy Admin financial settlement and payout batch approval decouples from the physical tenant databases, preventing double-entry ledger balance debiting.

Rather than assuming superficial causes or executing broad rewrites, every layer of the architecture—from frontend forms and camera pipelines to ONNX models, clean architecture use cases, tenant routing, PostgreSQL extended query protocol constraints, and multi-tenant ledger schemas—was inspected and verified with live test executions.

---

## 2. Audit of Prior Roadmap Phases (Phase 05 through Phase 10)

| Phase | Prior Claimed Status | Actual Implementation Reality | Identified Gap / Defect |
|---|---|---|---|
| **Phase 05 (Collection App Biometrics & Shift Management)** | "Complete" | YuNet and SFace ONNX models correctly placed in `apps/dfarm-collection-app/public/models/`. Cosine matcher correctly configured with threshold `0.363`. | Matches probes against enrolled templates, but fallback for un-enrolled farmers lacks clear administrative notification. |
| **Phase 06 (Customer Privacy & Data Minimization)** | "Complete" | Customer App stripped of extraneous fields. | **Data Minimization Over-pruning:** In removing overly complex KYC documents, the core Bank Beneficiary fields (account number, IFSC, bank name, holder name) were completely removed from the registration flow (`register.tsx`). Farmers are created with `NULL` bank details. |
| **Phase 07 (Multi-Tenant Physical Database Provisioning)** | "Complete" | Super Admin provisions physical PostgreSQL databases (`dfarm_tenant_<code_hash>`) with separate connection pools managed by `TenantDatabaseManager`. | Central database (`postgres` / `dfarm_central`) and physical tenant databases diverge when business logic uses generic `query` from `src/config/db.js` instead of `tenantDbManager.getTenantDb(orgId)`. |
| **Phase 08 (Biometric Vector Encryption & Key Management)** | "Complete" | `Aes256GcmBiometricEncryptor` correctly implemented with AES-256-GCM, salt, IV, and auth tag. | Biometrics use case `UpdateCustomerBiometricsUseCase` calls `customerRepo.findById(customerId)` without tenant context (`organizationId`), triggering fatal cross-dairy prohibition. |
| **Phase 09 (Financial Billing & Settlement Engine)** | "Complete (34/38 tests passing)" | 10-day billing cycle aggregation, deduction rules, and bill finalization work correctly. | **Payout Ledger Disconnect:** `PayoutService` and `BatchService` execute `settle_customer_payout` on central `db` instead of the physical tenant DB. The physical tenant ledger account remains un-debited (`2500 !== 0.00`). |
| **Phase 10 (Cross-App Integration & Workflows)** | "Complete (25/51 tests passing)" | Core routes, auth tokens, and dairy discovery are functional. | **Test Suite Seed Collisions & Missing Tenant Routing:** `seedDbs` in integration test violates `users_username_key` on repeat execution (`operator_vikas` collision), and cross-tenant batch lookup routed to `getPayoutById("batches")` causing 500 instead of 403. |

---

## 3. Issue A: Customer Bank Beneficiary Gap Analysis

### 3.1 Trace of Customer App Onboarding & Registration
1. **OTP Verification:** `apps/dfarm-customer-app/src/app/(auth)/verify-otp.tsx` validates OTP and stores tokens in `secureStorage`.
2. **Dairy Discovery:** `select-dairy.tsx` queries `GET /api/v1/dairies/nearby`, receives active cooperative societies, and allows the farmer to choose a target dairy.
3. **Registration Form:** `apps/dfarm-customer-app/src/app/(onboarding)/register.tsx`:
   - Contains: `fullName`, `village`, `milkType` (COW/BUFFALO/BOTH), and `biometricConsent` checkbox.
   - **Critical Gap:** Zero fields exist for Bank Name, Bank Account Number, Confirm Account Number, IFSC Code, or Account Holder Name.
   - Navigation: Calls `router.push('/(onboarding)/face-enroll', { dairyId, dairyName, fullName, village, milkSupplyType, mobileNumber })`. No bank data is captured or forwarded.
4. **Biometric Face Capture:** `face-enroll.tsx` captures camera frames, detects face landmarks with YuNet, generates 128-D SFace embedding, and submits to `useRegistration().register`. Bank details are omitted from the payload.
5. **Backend Ingestion:** `POST /api/v1/customers/register` in `customers.routes.ts`:
   - Accepts `body.bankDetails`. If `body.bankDetails` is `undefined`, it passes `undefined` to `registerCustomerUseCase.execute`.
   - `PostgresCustomerRepository.save` inserts `NULL` into `bank_name`, `bank_account_number`, `bank_ifsc_code`, `bank_account_holder_name`.
6. **Dairy Admin Payout & Billing Screen:**
   - In `apps/dfarm-dairy-admin/src/pages/customers/CustomerDetail.tsx` and `PendingApprovals.tsx`, the admin observes blank or placeholder bank fields.
   - When creating a payout batch for approved bills in `apps/dfarm-dairy-admin/src/pages/payments/PaymentsDashboard.tsx`, the payout preparation pipeline skips or rejects the farmer due to missing settlement credentials.

### 3.2 Data Lineage & Schema Verification
- **Tenant Database Table:** `customers` in `dfarm_tenant_<code_hash>` has columns:
  - `bank_name VARCHAR(100)`
  - `bank_account_number VARCHAR(50)`
  - `bank_ifsc_code VARCHAR(20)`
  - `bank_account_holder_name VARCHAR(100)`
- The database schema is fully equipped to store bank details; the defect is strictly an omission in the frontend registration form and request schema payload.

---

## 4. Issue B: Face Biometric Enrollment Error Gap Analysis

### 4.1 Observed Runtime Symptom
During live customer registration in `apps/dfarm-customer-app`, after the camera captures the face and extracts features, an alert displays:
> **Registration Error**  
> `An unexpected Server error occurred, please contact system support`

### 4.2 Exact Technical Root Cause & Replication
Live test scripts (`scripts/test_biometric_err.mjs` and `scripts/test_register.cjs`) isolated the exact breakdown:

1. **Missing Tenant Context in Biometrics Use Case:**
   - In `services/backend/src/application/use-cases/customers/BiometricUseCases.ts` (lines 69-77):
     ```typescript
     export class UpdateCustomerBiometricsUseCase {
       public async execute(params: { customerId: string; embedding: number[]; modelVersion?: string; }) {
         const customer = await this.customerRepo.findById(params.customerId);
     ```
   - Notice that `organizationId` is not accepted or passed into `this.customerRepo.findById(params.customerId)`.

2. **The PostgreSQL Extended Query Protocol Multi-Statement Bug:**
   - When `PostgresCustomerRepository.save(customer)` inserts a new customer into the physical tenant DB, lines 426–443 attempted to update the central lookup index:
     ```typescript
     const controlDb = tenantDbManager.getControlPlaneDb();
     await controlDb.query(`
       CREATE TABLE IF NOT EXISTS customer_tenant_lookup (...);
       INSERT INTO customer_tenant_lookup (customer_id, organization_id, normalized_mobile_number)
       VALUES ($1, $2, $3)
       ON CONFLICT (customer_id) DO UPDATE SET ...;
     `, [customer.id, customer.organizationId, customer.mobileNumber]);
     ```
   - In PostgreSQL extended query protocol (used by `pg` when parameter arrays `[$1, $2, $3]` are supplied), multiple SQL commands in a single string are prohibited and return `ERROR: syntax error at or near ")"` or `cannot insert multiple commands into a prepared statement`.
   - Because lines 441–443 wrapped this in `catch { // Best-effort index in control plane }`, the error was silently swallowed on every single customer registration.
   - Consequently, **`customer_tenant_lookup` was never created in the central database**, and no lookup records were ever written!

3. **Fatal Execution Path in `findById`:**
   - In `PostgresCustomerRepository.findById(id, organizationId)` (lines 125–162):
     ```typescript
     if (!resolvedOrgId) {
       const controlDb = tenantDbManager.getControlPlaneDb();
       try {
         const lookupRes = await controlDb.query(
           'SELECT organization_id FROM customer_tenant_lookup WHERE customer_id = $1 LIMIT 1;',
           [id]
         );
         if (lookupRes.rows.length > 0) resolvedOrgId = lookupRes.rows[0].organization_id;
       } catch {}
     }
     if (!resolvedOrgId) {
       throw new Error('Tenant context (organizationId) is required for customer lookup. Cross-dairy search is prohibited.');
     }
     ```
   - Because `customer_tenant_lookup` did not exist, the query threw `relation "customer_tenant_lookup" does not exist`, caught and silenced.
   - `resolvedOrgId` remained `undefined`.
   - The repository threw: `Error: Tenant context (organizationId) is required for customer lookup. Cross-dairy search is prohibited.`

4. **HTTP 500 Bubbling:**
   - In `customers.routes.ts` (lines 576–612, `handleBiometricsUpdate`), this unhandled error hit `cleanErrorHandler` / `errorHandler` line 109:
     ```typescript
     logger.error({ reqId: req.id, url: req.originalUrl, err }, 'Unhandled server exception');
     return ApiResponse.error(res, 'INTERNAL_SERVER_ERROR', 'An unexpected server error occurred. Please contact system support.', 500);
     ```
   - In `POST /register`, line 261 caught the error and logged `Biometric enrollment error in /register:`, swallowing the error but leaving the farmer in `faceEnrollmentStatus = 'NOT_ENROLLED'`.
   - When `apps/dfarm-customer-app` or kiosk calls the biometrics update endpoint directly, it receives HTTP 500 and renders the user-facing alert: `"Registration Error: An unexpected Server error occurred, please contact system support"`.

### 4.3 Biometric Model & Algorithm Verification
- **Face Detection:** YuNet (`face_detection_yunet_2023mar.onnx`, 232,589 bytes, SHA-256: `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4`).
- **Feature Extraction:** OpenCV SFace INT8 (`face_recognition_sface_2021dec_int8.onnx`, 9,896,933 bytes, SHA-256: `2b0e941e6f16cc048c20aee0c8e31f569118f65d702914540f7bfdc14048d78a`).
- **Feature Vector:** 128-dimensional floating point array, L2 normalized.
- **Similarity Metric:** Cosine similarity with canonical threshold `0.363` (matching OpenCV SFace reference benchmark).
- **Integrity Status:** Model files and ONNX runtime bindings in both `apps/dfarm-customer-app` and `apps/dfarm-collection-app` are binary identical and verified. The failure is strictly backend tenant resolution.

---

## 5. Issue C: Multi-Tenant Ledger & Financial Settlement Gap Analysis

### 5.1 Central vs. Tenant Database Divergence
DFarm enforces a physical multi-tenant architecture where each cooperative society operates on its own PostgreSQL database:
- Central control plane: `dfarm_central` (port 54322, db `postgres`).
- Tenant databases: `dfarm_tenant_<code_hash>`.

The audit revealed a severe architectural divergence in `services/backend/src/modules/payments/`:
- `BatchService` (`batch.service.ts`) and `PayoutService` (`payout.service.ts`) import `query` and `pool` from `../../config/db.js` (the central control plane database).
- They create payment batches, customer payouts, and payment batch items in the central database.
- In `payout.service.ts`, `settle_customer_payout` runs against central `db`, debiting `customer_ledger_accounts` in `postgres`.
- However, `PostgresLedgerRepository.ts` reads and writes ledger transactions against `tenantDbManager.getTenantDb(organizationId)`.
- When Phase 09 integration tests verified the farmer's balance post-settlement:
  `AssertionError: Customer 1 balance should be debited: 2500 !== 0`.
  The physical tenant ledger was untouched because the settlement logic operated on central `db`!

### 5.2 Cross-Tenant Isolation & Test Fixture Seed Collisions
In Phase 10 integration suite (`roadmap-phase-10-cross-app-integration.test.js`):
1. **Seed Collision:** `seedDbs` executed `INSERT INTO users ... ON CONFLICT (id) DO NOTHING`. Repeated test runs collided on the `users_username_key` unique constraint (`operator_vikas` with ID `...003` already existed while test attempted to insert `...107`), aborting the seed.
2. **Missing Batch Route Match:** When batch creation failed due to seed abort, `payoutBatchId` was empty string `""`. Test subtest 43 called `/api/v1/payments/batches/` which Express matched against `/api/v1/payments/:id` with `:id = "batches"`, causing PostgreSQL to fail with `invalid input syntax for type uuid: "batches"` (HTTP 500) instead of testing cross-tenant isolation (HTTP 403).

---

## 6. Detailed Component Classification Matrix

| Component | Working As Designed | Partially Working | Broken / Failing at Runtime | Never Implemented |
|---|---|---|---|---|
| **Customer App Registration UI** (`register.tsx`) | Captures name, village, animal type, biometric consent | Mobile number passed from OTP | Omits bank details form completely | Bank account validation & confirm account matching |
| **Customer App Face AI** (`face-enroll.tsx`, `useFaceDetection.ts`, `useFaceEmbedding.ts`) | YuNet face landmark detection; SFace INT8 128-D embedding extraction | Progress UI indicators | Fails on API submit due to backend 500 | Retry error recovery dialog with diagnostic hints |
| **Customer App Profile** (`profile/index.tsx`) | Displays farmer code, dairy name, status | Responsive Clay layout | Hardcoded mock bank strings (`XXXX-XXXX-4589`) | Inline bank beneficiary update modal |
| **Customer Registration API** (`POST /register`) | Creates customer row in physical tenant DB | Registers milk categories & ledger account | Silently catches and drops biometric template | Bank account format verification status mapping |
| **Biometrics Update API** (`POST/PUT /:id/biometrics`) | Encryption with AES-256-GCM | Model version registration | Throws HTTP 500 due to unpassed `organizationId` | Biometric audit log trail per tenant |
| **Dairy Admin Approvals** (`PendingApprovals.tsx`) | Lists pending registrations | Approve/Reject action triggers | Does not display bank settlement credentials | Maker-checker approval note for bank details |
| **Dairy Admin Customer Profile** (`CustomerDetail.tsx`) | General profile tabs | Milk supply category view | Bank tab does not show live tenant data | Bank verification status badge |
| **Batch Service** (`batch.service.ts`) | Batch creation, maker-checker authorization, NEFT export | Bank file serialization | Writes to central DB instead of tenant DB | Multi-tenant dynamic database routing |
| **Payout Service** (`payout.service.ts`) | Payout record lifecycle, voucher calculation | Fallback settlement logic | Debits central DB ledger instead of tenant DB | Physical tenant ledger debit reconciliation |
| **Collection App Kiosk** (`apps/dfarm-collection-app`) | YuNet + SFace inference in browser; Cosine threshold 0.363 | Hardware scale/analyzer serial bridge | N/A | Local offline probe template cache |

---

## 7. Remediation Strategy & Invariants

To eliminate these defects without introducing breaking changes or architectural divergence, the remediation must adhere strictly to these principles:

1. **Zero Secondary Systems:** Do not create a second customer registration flow, a second biometric engine, a second farmer identity system, a second bank beneficiary table, a second billing engine, or a second payout ledger.
2. **Reuse Existing Models & Schemas:**
   - Use the existing `bank_name`, `bank_account_number`, `bank_ifsc_code`, and `bank_account_holder_name` columns on `customers`.
   - Use the existing 128-D OpenCV SFace INT8 embedding with cosine similarity threshold `0.363`.
   - Use existing `PostgresCustomerRepository`, `Aes256GcmBiometricEncryptor`, `BatchService`, and `PayoutService`.
3. **Fix Multi-Tenant Routing:**
   - Fix `customer_tenant_lookup` table creation and single-statement parameterized upsert in central DB.
   - Fallback to `customer_dairy_memberships` in central DB to resolve `organizationId` by `customer_id`.
   - Update `UpdateCustomerBiometricsUseCase` to accept `organizationId?: string` and pass it to `findById`.
   - Ensure `BatchService` and `PayoutService` execute database operations against `tenantDbManager.getTenantDb(organizationId)`.
4. **Implement Bank Beneficiary in Customer App:**
   - Add clean Clay design system inputs in `register.tsx` for Account Holder Name, Bank Account Number, Confirm Account Number, IFSC Code, and Bank Name.
   - Enforce client-side format validation (IFSC regex: `^[A-Z]{4}0[A-Z0-9]{6}$`, account matching).
   - Forward `bankDetails` in query parameters to `face-enroll.tsx`, and include in `useRegistration` payload.
   - Wire up dynamic bank details in Customer App `profile/index.tsx`.
5. **Display Masked Bank Information in Dairy Admin:**
   - Display masked account number (`XXXX-XXXX-1234`), IFSC, and honest verification status (`DETAILS_SUBMITTED` / `FORMAT_VALID`) in `PendingApprovals.tsx` and `CustomerDetail.tsx`.
6. **Pass Test Suites with Zero Regressions:**
   - Fix seed username conflict in `roadmap-phase-10-cross-app-integration.test.js`.
   - Ensure 38/38 tests pass in Phase 09 and 51/51 tests pass in Phase 10.
