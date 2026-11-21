# PROMPT 05: CUSTOMER REGISTRATION & APPROVAL VERIFICATION REPORT

**Document ID:** `DFARM-VERIF-05-REG-001`  
**Execution Phase:** Prompt 05  
**Target:** Customer Self-Registration & Dairy Admin Approval Lifecycle  
**Verification Date:** November 17, 2026  
**Status:** FULLY VERIFIED — ZERO MOCK STATE  

---

## 1. Executive Summary

Farmers self-register through the DFarm Customer Mobile App by providing basic demographic, cattle holding, and bank payout information. To safeguard Dairy operational integrity and prevent unverified milk deliveries, new registrations enter an initial `PENDING` approval state with `status = 'INACTIVE'`. Unapproved farmers cannot deliver milk at kiosks or access financial ledger endpoints. Full access is granted only after explicit review and approval by an authorized Dairy Admin.

---

## 2. Self-Registration Workflow

### 2.1 Mobile Registration Flow
Implemented in `apps/dfarm-customer-app/src/app/(auth)/register.tsx`:
1. Farmer verifies mobile number via OTP and receives a `GUEST_FARMER` token.
2. Farmer selects Dairy via GPS discovery or manual search (`organizationId`).
3. Farmer completes the registration form:
   - **Personal Info:** Full Name, Father/Spouse Name, Village/Address, Pincode.
   - **Cattle Inventory:** Number of Cows, Number of Buffaloes, Estimated Daily Yield (liters).
   - **Bank Beneficiary Details:** Account Holder Name, Bank Name, Account Number, IFSC Code.
4. Mobile app dispatches `POST /api/v1/customers/register`.

### 2.2 Backend Ingestion & Storage
Handled by `services/backend/src/presentation/routes/customers.routes.ts`:
- Normalizes phone number to E.164 (`+919876543210`).
- Validates IFSC pattern (`^[A-Z]{4}0[A-Z0-9]{6}$`).
- Routes transaction to target Dairy's dedicated PostgreSQL tenant database.
- Inserts record into `customers` table with:
  - `registration_status = 'PENDING'`
  - `status = 'INACTIVE'`
  - `created_at = NOW()`
- Automatically indexes phone number in central `customer_tenant_lookup` for subsequent multi-tenant routing.

---

## 3. Dairy Admin Review & Approval Engine

### 3.1 Approval API
Exposed via `PATCH /api/v1/customers/:id/approve` in `services/backend/src/presentation/routes/customers.routes.ts`:
- **Authorization:** Requires role `DAIRY_ADMIN` or `DAIRY_OPERATOR` with active tenant context.
- **Atomic Operations:**
  1. Generates sequential `farmer_code` / `customer_code` (e.g. `CUST-0001`, `FARMER-0042`) unique within the tenant database.
  2. Updates `registration_status = 'APPROVED'`.
  3. Updates `status = 'ACTIVE'`.
  4. Records `approved_at = NOW()` and `approved_by = req.user.userId`.
  5. Dispatches notification event to `customer_notifications` alerting the farmer of approval.

### 3.2 Rejection API
Exposed via `PATCH /api/v1/customers/:id/reject`:
- Requires mandatory `rejectionReason` string in request body.
- Updates `registration_status = 'REJECTED'`.
- Customer status remains `INACTIVE`.
- Dispatches rejection notification with reason to farmer.

---

## 4. Operational Gatekeeping & Enforcement

| Enforcement Point | Unapproved / Pending / Rejected Farmer | Approved & Active Farmer |
| :--- | :--- | :--- |
| **Mobile App Login** | Displays "Approval Pending" status banner; ledger/passbook restricted. | Full access to Daily Passbook, Rate Charts, Bills, Cattle Feed. |
| **Kiosk Face Identification** | Kiosk alerts: *"Customer approval pending. Cannot accept milk."* | Face matched; session opened; intake enabled. |
| **Kiosk RFID Tap** | Blocked with error: `CUSTOMER_NOT_APPROVED`. | Card identified; session opened; intake enabled. |
| **Milk Intake Processing** | Domain entity `Customer.validateCanDeliver()` throws `CustomerSuspendedError` (`403 Forbidden`). | Intake validated; quality tested; transaction posted to ledger. |

---

## 5. Verification Test Evidence

Automated regression suite in `services/backend/tests/customer-app-production.test.js`:
- `Subtest 8`: Self-registers customer in PENDING state (`registrationStatus: 'PENDING'`, `status: 'INACTIVE'`).
- `Subtest 9`: Prevents milk intake for PENDING customer (`Customer.validateCanDeliver()` throws error, HTTP 403).
- `Subtest 10`: Dairy Admin approves customer (`registrationStatus: 'APPROVED'`, `status: 'ACTIVE'`, assigns `customerCode`).
- `Subtest 11`: Permits milk intake once approved and active (HTTP 201 Created).
