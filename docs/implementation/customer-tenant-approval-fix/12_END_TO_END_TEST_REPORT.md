# 12 — End-to-End Test Execution Report

**Reference:** `DFARM-CUSTOMER-TENANT-REGISTRATION-APPROVAL-FIX`  
**Artifact ID:** `12_END_TO_END_TEST_REPORT`  
**Test Suite:** `services/backend/tests/customer-tenant-approval-e2e.test.js`  
**Execution Environment:** Node.js v20.x, Windows 11  
**Status:** ALL 11 TESTS PASSED (100% PASS RATE)  

---

## 1. Test Suite Summary

The end-to-end test suite validates the entire business flow across all system boundaries: Customer App discovery, registration submission, tenant routing, duplicate prevention, Dairy Admin authentication, pending queue fetching, cross-tenant isolation, approval processing, central directory synchronization, and customer status polling.

---

## 2. Test Execution Output

```
▶ Customer Tenant Registration & Approval End-to-End Suite
  ✔ Stage 1: Customer discovers nearby dairies (finds Warna Milk's DF-SAN-2395) (24.12ms)
  ✔ Stage 2: Selected dairy tenant database availability and status check (11.05ms)
  ✔ Stage 3: Customer registers under Warna Milk's (writes to tenant DB with PENDING_APPROVAL) (28.43ms)
  ✔ Stage 4: Duplicate registration for same dairy and mobile is rejected (409 Conflict) (14.21ms)
  ✔ Stage 5: Dairy Admin Popat Yewale (9834388787) authenticates and binds to Warna Milk's (18.67ms)
  ✔ Stage 6: Dairy Admin fetches pending registrations (finds applicant with normalized fields) (15.82ms)
  ✔ Stage 7: Cross-tenant isolation prevents other dairies from seeing the applicant (12.34ms)
  ✔ Stage 8: Dairy Admin approves registration (assigns farmer code F-SAN-001, status ACTIVE) (22.56ms)
  ✔ Stage 9: Central membership directory is synchronized to APPROVED with farmer code (16.45ms)
  ✔ Stage 10: Customer polls status API and receives APPROVED with dairy name and farmer code (13.78ms)
  ✔ Stage 11: Duplicate approval call is idempotent and preserves farmer code (11.89ms)
✔ Customer Tenant Registration & Approval End-to-End Suite (202.48ms)

ℹ tests 11
ℹ suites 1
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 214.39
```

---

## 3. Stage-by-Stage Verification Breakdown

### Stage 1: Dairy Discovery
- **Action**: `GET /dairies/nearby?latitude=16.8524&longitude=74.5815`
- **Result**: Successfully returns Warna Milk's with `id: "38918630-4fee-4cec-96ea-a3a899aae7bc"`, `code: "DF-SAN-2395"`.

### Stage 2: Tenant Database Availability Check
- **Action**: Check tenant mapping status for `38918630-4fee-4cec-96ea-a3a899aae7bc`.
- **Result**: Routing resolver confirms tenant database mapping is active and healthy; rejects `FAILED` state if disconnected.

### Stage 3: Customer Registration Submission
- **Payload**:
  - Name: `"Shubhangi popat Yewale"`
  - Mobile: `"+917755995615"`
  - Dairy ID: `"38918630-4fee-4cec-96ea-a3a899aae7bc"`
  - Village: `"Kavlapur"`, Taluka: `"Miraj"`, District: `"Sangli"`
  - Biometrics: Face vector payload enrolled
- **Result**: HTTP 201 Created. Tenant DB contains customer with `status: "PENDING_APPROVAL"`. Central membership created with `membership_status: "PENDING"`.

### Stage 4: Duplicate Registration Prevention
- **Action**: Repeat identical registration for `+917755995615` under Dairy `38918630-4fee-4cec-96ea-a3a899aae7bc`.
- **Result**: HTTP 409 Conflict with message `"Customer already registered or pending approval for this dairy"`.

### Stage 5: Dairy Admin Authentication
- **Action**: `POST /auth/login` with `mobile: "9834388787"`.
- **Result**: HTTP 200 OK. Token issued with claims `role: "DAIRY_ADMIN"`, `organizationId: "38918630-4fee-4cec-96ea-a3a899aae7bc"`.

### Stage 6: Pending Queue Resolution
- **Action**: `GET /customers/pending` using Dairy Admin token.
- **Result**: HTTP 200 OK. Exactly 1 applicant returned:
  - `candidateName`: `"Shubhangi popat Yewale"`
  - `status`: `"PENDING"`
  - `submittedAt`: Valid ISO timestamp
  - `dairyId`: `"38918630-4fee-4cec-96ea-a3a899aae7bc"`

### Stage 7: Cross-Tenant Isolation
- **Action**: `GET /customers/pending` using Dairy Admin token for a different organization (`"other-dairy-id"`).
- **Result**: HTTP 200 OK with `[]` (0 records), proving strict isolation.

### Stage 8: Dairy Admin Approval
- **Action**: `POST /customers/:id/approve`.
- **Result**: HTTP 200 OK.
  - `farmerCode`: `"F-SAN-001"`
  - `status`: `"ACTIVE"`
  - `approvedAt`: ISO timestamp

### Stage 9: Central Directory Synchronization
- **Action**: Query `customer_dairy_memberships` in central DB.
- **Result**:
  - `membership_status`: `"APPROVED"`
  - `farmer_code`: `"F-SAN-001"`

### Stage 10: Customer Polling API
- **Action**: `GET /customers/:id/status` using Customer token.
- **Result**: HTTP 200 OK.
  - `status`: `"APPROVED"`
  - `dairyName`: `"Warna Milk's"`
  - `farmerCode`: `"F-SAN-001"`

### Stage 11: Idempotency
- **Action**: Re-invoking `POST /customers/:id/approve` on already approved customer.
- **Result**: Returns HTTP 200 with existing farmer code without creating duplicates or modifying history.
