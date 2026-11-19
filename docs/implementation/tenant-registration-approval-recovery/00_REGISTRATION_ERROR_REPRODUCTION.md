# 00 — Registration Error Reproduction & Triage

**Execution Reference:** DFARM-TENANT-PROVISIONING-REGISTRATION-APPROVAL-RECOVERY  
**Target:** Customer Registration Flow (`apps/dfarm-customer-app` → `services/backend`)  
**Status:** REPRODUCED & ISOLATED  
**Date:** 2026-11-19  

---

## 1. Summary of Reported Failure

When a customer completes mobile OTP verification, discovers nearby dairies, selects a dairy (e.g., tenant code `DF-SAN-4859`), fills the registration form, and submits the registration, the Customer App displays the following critical error:

```
Registration Error
Selected dairy tenant database (DF-SAN-4859) is unavailable (provisioning status: FAILED).
Customer registration cannot proceed until database provisioning is resolved.
```

---

## 2. Reproduction Steps

1. **Step 1: Mobile OTP Verification**
   - User inputs mobile number: `+91 7755995615`.
   - OTP `123456` verified successfully via `POST /api/v1/auth/verify-otp`.
   - Central customer identity resolved with global profile token.

2. **Step 2: Nearby Dairy Discovery**
   - Customer App queries `GET /api/v1/dairies/nearby?lat=16.8524&lng=74.5815&radiusKm=25`.
   - Backend returns list of dairies, including `DF-SAN-4859` (`Shivshakti Milk's`).
   - Prior to our fix, the API returned `status: "ACTIVE"`, concealing that the underlying database provisioning had failed.

3. **Step 3: Dairy Selection**
   - User selects `DF-SAN-4859` (ID: `d9e4629c-b086-4c99-a0ec-4057ac6092ab`).
   - App stores selected dairy context in local state and navigates to customer registration form.

4. **Step 4: Form Completion & Submission**
   - User enters:
     - Full Name: `Shubhangi Popat Yewale`
     - Phone: `+917755995615`
     - Milk Type: `COW`
     - Address: `At Post Sangli, Miraj Road`
     - Bank Details: [REDACTED]
   - User taps **Submit Registration**.

5. **Step 5: API Execution & Failure**
   - Customer App issues `POST /api/v1/customers/register`.
   - Backend evaluates selected dairy's tenant database mapping.
   - Database manager detects `provisioningStatus === 'FAILED'`.
   - Backend halts processing and returns HTTP 503.

---

## 3. Captured Request & Response

### Request
```http
POST /api/v1/customers/register HTTP/1.1
Host: localhost:4000
Content-Type: application/json
Authorization: Bearer <AUTH_TOKEN_REDACTED>
x-correlation-id: req-corr-rep-001

{
  "dairyId": "d9e4629c-b086-4c99-a0ec-4057ac6092ab",
  "fullName": "Shubhangi Popat Yewale",
  "phone": "+917755995615",
  "preferredMilkType": "COW",
  "address": "At Post Sangli, Miraj Road",
  "bankAccount": {
    "accountNumber": "XXXXXXXX9876",
    "ifscCode": "SBIN0001234",
    "bankName": "State Bank of India"
  }
}
```

### Response
```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/json
Date: Thu, 19 Nov 2026 11:20:15 GMT
x-correlation-id: req-corr-rep-001

{
  "success": false,
  "error": {
    "code": "TENANT_DATABASE_UNAVAILABLE",
    "message": "Selected dairy tenant database (DF-SAN-4859) is unavailable (provisioning status: FAILED). Customer registration cannot proceed until database provisioning is resolved.",
    "dairyId": "d9e4629c-b086-4c99-a0ec-4057ac6092ab",
    "tenantCode": "DF-SAN-4859",
    "provisioningStatus": "FAILED"
  }
}
```

---

## 4. First Failing Layer Identification

The call flow traces through:
1. `Registration Route Handler` (`POST /api/v1/customers/register`) ✅ Reached
2. `Customer Authentication Middleware` ✅ Passed
3. `Central Dairy Registry Lookup` (`d9e4629c-b086-4c99-a0ec-4057ac6092ab`) ✅ Found
4. `Tenant Database Availability & Health Verification` ❌ **FAILED HERE**
5. `Tenant Database Connection & Persistence` ⏸️ Never reached
6. `Dairy Admin Pending Queue` ⏸️ Never populated

**Conclusion:** The customer registration request was deliberately and correctly rejected before writing partial data because the tenant database was marked as `FAILED`. The failure was NOT due to validation, authentication, or routing logic; it was due to an unprovisioned physical database on the dairy registry record.
