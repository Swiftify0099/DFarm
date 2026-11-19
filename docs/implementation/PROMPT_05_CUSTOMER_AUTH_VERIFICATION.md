# PROMPT 05: CUSTOMER AUTHENTICATION VERIFICATION REPORT

**Document ID:** `DFARM-VERIF-05-AUTH-001`  
**Execution Phase:** Prompt 05  
**Target:** `apps/dfarm-customer-app` & `services/backend` Auth Infrastructure  
**Verification Date:** November 17, 2026  
**Status:** FULLY VERIFIED — ZERO MOCK SECURITY  

---

## 1. Executive Summary

In Prompt 05, the customer authentication flow for the DFarm Customer Mobile App was audited, secured, and migrated from legacy client-side simulated OTPs to an enterprise-grade backend OTP authentication lifecycle. Direct client SMS dispatch (`DirectDoveSmsService`) and hardcoded/static client OTP verification were completely eliminated. Authentication now adheres to multi-tenant Clean Architecture principles with rigorous cryptographic verification, E.164 phone normalization, anti-spam rate limiting, and role-segregated JWT issuance.

---

## 2. Phone Number Normalization & E.164 Standards

### 2.1 Specification
All incoming mobile numbers must conform to the international E.164 standard:
- Default region: India (`+91`).
- Input format: 10-digit local number (e.g., `9876543210`) or with leading zero (`09876543210`) or with country code (`+919876543210`).
- Normalized output: `+919876543210`.
- Validation: Exactly 10 digits following the `+91` country code, starting with digits 6, 7, 8, or 9. Invalid characters, invalid length, or invalid country codes are rejected immediately with `400 Bad Request`.

### 2.2 Backend Verification
Implemented in `services/backend/src/domain/entities/Customer.ts` and `services/backend/src/presentation/routes/customers.routes.ts`:
- Input `9876543210` -> Normalized to `+919876543210`.
- Input `+91 98765-43210` -> Stripped of whitespace and punctuation -> `+919876543210`.
- Invalid inputs (e.g. `12345`, `abcdefghij`, `0000000000`) fail Zod/Domain validation with `VALIDATION_ERROR`.

---

## 3. Cryptographic OTP Lifecycle & SMS Gateway

### 3.1 Secure Generation
- **Algorithm:** Node.js `crypto.randomInt(100000, 1000000)` produces a cryptographically secure 6-digit integer string.
- **Expiry:** Strict 300 seconds (5 minutes) from issuance. Stored in Redis / In-Memory cache keyed by `otp:<normalized_phone>`.
- **Max Verification Attempts:** Capped at 5 invalid attempts. Exceeding 5 attempts invalidates the OTP and enforces cooldown.

### 3.2 SMS Dispatch Engine (`DoveOtpService`)
- Implemented in `services/backend/src/infrastructure/otp/DoveOtpService.ts` implementing `IOtpService`.
- Production Mode: Transmits SMS payload via Dove Soft SMS Gateway using official DLT-approved transactional templates.
- Development/Test Mode: Emits debug log and returns preview code in non-production environments for automated testing without burning SMS credits.

### 3.3 Rate Limiting & Cooldown
- **Cooldown:** 60-second cooldown per phone number.
- Attempting to request another OTP within 60 seconds returns `429 Too Many Requests` with `{ error: "OTP_COOLDOWN_ACTIVE", cooldownSeconds: N }`.
- Backend response returns `{ success: true, cooldownSeconds: 60, expiresAt: "<ISO_TIMESTAMP>" }` enabling precise countdown timers in `apps/dfarm-customer-app/src/app/(auth)/login.tsx`.

---

## 4. Multi-Tenant JWT Issuance & Role Segregation

### 4.1 Unregistered Farmers (Onboarding / Guest Session)
When an unknown mobile number verifies an OTP:
- `PostgresCustomerRepository.findByPhone` searches the central `customer_tenant_lookup` table and queries active tenant databases.
- If no active customer record is found, the system issues a short-lived **Onboarding Token**:
  - `role`: `'GUEST_FARMER'`
  - `userId`: `'unregistered:+919876543210'`
  - `phone`: `'+919876543210'`
- **Scope Restriction:** The GUEST_FARMER token is strictly restricted to:
  1. `GET /api/v1/dairies/nearby` (GPS dairy discovery).
  2. `POST /api/v1/customers/register` (Registration submission).
  Attempting to access milk intake, passbook, bills, cattle feed, or bank details with a GUEST_FARMER token results in an immediate `403 Forbidden`.

### 4.2 Registered & Approved Farmers
When an enrolled farmer logs in:
- Tenant lookup identifies the specific Dairy organization (`organizationId`, `tenantDbName`).
- Customer entity is retrieved and validated.
- Issues a full **Farmer Customer Token**:
  - `role`: `'FARMER_CUSTOMER'`
  - `userId`: `<customerId>`
  - `organizationId`: `<orgId>`
  - `tenantDbName`: `<dfarm_tenant_...>`
  - `farmerCode`: `<FARMER_CODE>`
  - `status`: `'ACTIVE'`

---

## 5. Security & Attack Surface Audit

| Vector | Defense Mechanism | Verified Status |
| :--- | :--- | :--- |
| **Client OTP Spoofing** | Direct client verification eradicated. OTP state resides solely in backend Redis/memory. | PASS |
| **SMS Brute Force** | Max 5 failed attempts per OTP cycle; 60s cooldown; strict 5-minute expiry. | PASS |
| **Tenant Injection** | Farmer tokens are hard-bound to their specific `organizationId`. Cross-tenant headers ignored. | PASS |
| **Unauthorized Data Query** | Farmer requests are hard-scoped to `req.user.userId`. Passing another customer's ID returns `403`. | PASS |
| **Suspended Access** | Customers with `status !== 'ACTIVE'` or `registrationStatus !== 'APPROVED'` rejected at intake and auth. | PASS |

---

## 6. Automated Test Suite Coverage

Verified via `node --test services/backend/tests/customer-app-production.test.js`:
- `GROUP A: Customer Authentication & Secure OTP Verification (Subtests 1-4)`: 100% PASSING.
- Zero mock bypasses in production routes.
