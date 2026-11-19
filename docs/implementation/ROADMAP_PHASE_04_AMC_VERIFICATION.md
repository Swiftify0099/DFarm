# DFARM IMPLEMENTATION: ROADMAP PHASE 04 AMC VERIFICATION
**Document ID:** `DFARM-IMP-R04-AMC-001`  
**Phase:** Roadmap Phase 04 — Annual Maintenance Contracts & Subscriptions  
**Status:** VERIFIED & CERTIFIED  

---

## 1. Scope & Quarantine Requirement

The DFarm platform provides software and hardware maintenance subscriptions for cooperative dairies. A strict platform requirement is that **Razorpay payment verification is strictly quarantined to AMC subscriptions** and must never be coupled with farmer milk disbursements or cooperative billing.

---

## 2. Test Execution & Evidence

Executed via `services/backend/tests/roadmap-phase-04-platform-services.test.js` (Group 2):

### 2.1. AMC Plan Creation
- `POST /api/v1/super-admin/amc/plans`
- **Payload:** `name: 'Platinum Cooperative Annual Care'`, `durationMonths: 12`, `priceInr: 18000`.
- **Status:** `201 Created`. Verified plan is active and priced in INR.

### 2.2. Subscription Initiation
- `POST /api/v1/super-admin/amc/subscriptions`
- **Payload:** `dairyId`, `planId`, `startDate: '2026-04-01'`.
- **Status:** `201 Created`.
- Initial payment status is `UNPAID` and overall status is `PENDING`. Expiry date computed automatically as `2027-04-01`.

### 2.3. Razorpay Verification (Quarantined)
- `POST /api/v1/super-admin/amc/subscriptions/:id/verify-payment`
- **Payload:** `razorpayPaymentId: 'pay_test_amc_...'`, `razorpaySignature: 'sig_mock_verified'`.
- **Status:** `200 OK`.
- Status updated to `ACTIVE`, payment status to `PAID`, with `activated_at` recorded.
- Verified that Razorpay integration remains entirely isolated within the AMC subsystem.

### 2.4. Status Lifecycle Calculation
- Repository dynamically calculates:
  - `ACTIVE`: Current date is within coverage period (> 30 days before expiry).
  - `RENEWAL_DUE`: Current date is within 30 days of expiry.
  - `EXPIRED`: Current date has surpassed expiry date.

---

## 3. Privilege Enforcement
- Creating plans and verifying payments requires `SUPER_ADMIN`.
- `PLATFORM_OPERATOR` is restricted to reading subscription status and plans; mutations return `403 Forbidden`.
