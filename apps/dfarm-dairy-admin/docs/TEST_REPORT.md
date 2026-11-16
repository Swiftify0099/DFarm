# DFarm Dairy Admin Web — Automated Quality Assurance & Test Report

**Execution Environment:** Node.js v22.20.0, Vitest v5.1.0, JSDOM v29.1.1  
**Execution Timestamp:** 2026-11-15 15:21:59 IST  
**Overall Result:** ✅ 100% Passed (5 Test Suites, 14 Test Cases)

---

## 1. Test Suite Summary

| Test Suite File | Domain Scope | Tests Executed | Passed | Failed | Duration |
|---|---|:---:|:---:|:---:|:---:|
| `src/test/auth.test.ts` | Mobile OTP Authentication & Tenant Scoping | 4 | 4 | 0 | 20ms |
| `src/test/customer-approvals.test.ts` | Onboarding Approvals & YuNet Biometrics | 4 | 4 | 0 | 20ms |
| `src/test/ledger-billing.test.ts` | Server-Authoritative Ledger & Billing Settlements | 2 | 2 | 0 | 18ms |
| `src/test/feed-inventory.test.ts` | Inventory Tracking & Customer Ledger Debit Sync | 2 | 2 | 0 | 17ms |
| `src/test/rate-chart.test.ts` | Milk Rate Chart Versioning & Historical Preservation | 2 | 2 | 0 | 14ms |
| **Total** | | **14** | **14** | **0** | **6.33s** |

---

## 2. Granular Test Verification Log

### Suite A: `src/test/auth.test.ts`
- ✅ **Test 1: Rejects unregistered mobile number**  
  *Assertion:* `MockDairyBackend.sendLoginOtp('9999999999')` throws `Error("...is not registered as an authorized operator...")`.
- ✅ **Test 2: Dispatches genuine 6-digit OTP for authorized Dairy Admin**  
  *Assertion:* Generates a random 6-digit integer string, creates an active OTP session with 300s TTL.
- ✅ **Test 3: Rejects invalid OTP entry and decrements attempt counter**  
  *Assertion:* Incorrect OTP throws `Error("Invalid OTP code entered. 2 attempts remaining.")`.
- ✅ **Test 4: Authenticates valid OTP and resolves dairy tenant isolation**  
  *Assertion:* Valid OTP returns authorized `DairyAdminUser` matching tenant ID `dairy-ten-9801`, primary admin flag `true`, and generates signed session token.

### Suite B: `src/test/customer-approvals.test.ts`
- ✅ **Test 1: Retrieves pending registration requests with YuNet/SFace metadata**  
  *Assertion:* Validates pipeline string `"YuNet-v1.0 + SFace-INT8-v1.0"`, consent flag `true`, quality score > 80%.
- ✅ **Test 2: Rejects approval without proper request ID**  
  *Assertion:* Non-existent ID throws `Error("Registration request not found")`.
- ✅ **Test 3: Approves a pending customer and registers active customer profile and face enrollment**  
  *Assertion:* Issues sequential code `C-XXX`, sets status to `ACTIVE`, creates `FaceEnrollmentRecord` in state `APPROVED`.
- ✅ **Test 4: Requires a mandatory detailed reason (min 5 chars) to reject registration**  
  *Assertion:* Rejection with < 5 chars throws error; valid reason updates status to `REJECTED` and logs audit entry.

### Suite C: `src/test/ledger-billing.test.ts`
- ✅ **Test 1: Posts non-destructive adjustments to collection records and logs ledger entry**  
  *Assertion:* Modifies transaction weight, records `originalWeight` inside adjustment object, and appends `AUTHORIZED_ADJUSTMENT` row in ledger.
- ✅ **Test 2: Prevents duplicate bill generation for the same customer and period**  
  *Assertion:* Re-generating bill for `(cust-102, 2026-11-01, 2026-11-15)` throws duplicate billing error.

### Suite D: `src/test/feed-inventory.test.ts`
- ✅ **Test 1: Deducts physical inventory and creates server-authoritative ledger debit on customer sale**  
  *Assertion:* Stock decreases by 3 units, customer ledger receives `FEED_DEBIT` equal to unit price × 3.
- ✅ **Test 2: Rejects feed sale when requested quantity exceeds available stock**  
  *Assertion:* Requesting stock + 500 throws `Error("Insufficient stock...")`.

### Suite E: `src/test/rate-chart.test.ts`
- ✅ **Test 1: Creates a new draft version incrementing version number**  
  *Assertion:* New chart version is `v3` in `DRAFT` status.
- ✅ **Test 2: Archives previously active version upon activating new version**  
  *Assertion:* Activating draft switches status to `ACTIVE` and transitions previously active version to `ARCHIVED`.
