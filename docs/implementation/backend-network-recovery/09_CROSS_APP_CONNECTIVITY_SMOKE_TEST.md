# DFarm — Priority 0: Cross-App Connectivity Smoke Test

**Execution Reference:** DFARM-PRIORITY-00-BACKEND-NETWORK-RECOVERY  
**Document:** `09_CROSS_APP_CONNECTIVITY_SMOKE_TEST.md`  
**Timestamp:** 2026-11-19T13:34:30+05:30  
**Test Results:** 4 / 4 APPLICATIONS PASSED  

---

## 1. Test Execution Summary

Real authenticated end-to-end API flows were executed against the live backend service across all four DFarm platform applications:

```
┌──────────────────────────────┬────────────────────────────────────────────────────────┬────────┐
│ Application                  │ Verified Real Flow                                     │ Result │
├──────────────────────────────┼────────────────────────────────────────────────────────┼────────┤
│ apps/dfarm-dairy-admin       │ OTP Request ➔ Verify ➔ Admin Profile ➔ Dashboard      │ PASSED │
│ apps/dfarm-customer-app      │ Farmer OTP ➔ Verify ➔ Nearby Dairies ➔ Memberships    │ PASSED │
│ apps/dfarm-collection-app    │ Operator OTP ➔ Verify ➔ Active Session ➔ Farmers Lookup│ PASSED │
│ apps/dfarm-super-admin       │ Super Admin OTP ➔ Verify ➔ Tenant Dairies ➔ Metrics    │ PASSED │
└──────────────────────────────┴────────────────────────────────────────────────────────┴────────┘
```

---

## 2. Detailed Application Test Results

### 1. `apps/dfarm-dairy-admin`
- **Request 1:** `POST /api/v1/auth/admin/otp/request` (+917755995615) ➔ `HTTP 200` (`previewOtp: 389553`)
- **Request 2:** `POST /api/v1/auth/admin/otp/verify` (OTP: 389553) ➔ `HTTP 200` (`role: SUPER_ADMIN`, token returned)
- **Request 3:** `GET /api/v1/auth/admin/me` (with `X-Dairy-Id: 00000000-0000-0000-0000-000000000001`) ➔ `HTTP 200` (User: Pankaj Popat Yewale)
- **Request 4:** `GET /api/v1/dashboard/summary` ➔ `HTTP 200` (`dairyProfile`, `systemStatus: UP`)
- **Outcome:** **PASSED**

### 2. `apps/dfarm-customer-app`
- **Request 1:** `POST /api/v1/auth/request-otp` (+919822334455) ➔ `HTTP 200` (`previewOtp: 876549`)
- **Request 2:** `POST /api/v1/auth/verify-otp` (OTP: 876549) ➔ `HTTP 200` (`customerId: 1679c3c9-70d9-4d2f-a110-b7c5f1ba4c50`)
- **Request 3:** `GET /api/v1/dairies/nearby` (Headers: `X-Client-App: DFarm-Customer-Android`, `X-Client-Version: 1.0.0`) ➔ `HTTP 200` (Found 1 registered dairy federation)
- **Request 4:** `GET /api/v1/customers/memberships` ➔ `HTTP 200` (`memberships: []`)
- **Outcome:** **PASSED**

### 3. `apps/dfarm-collection-app`
- **Request 1:** `POST /api/v1/auth/operator/otp/request` (+919822114477) ➔ `HTTP 200` (`previewOtp: 521849`)
- **Request 2:** `POST /api/v1/auth/operator/otp/verify` (OTP: 521849) ➔ `HTTP 200` (`role: COLLECTION_OPERATOR`)
- **Request 3:** `GET /api/v1/collections/sessions/active` (Headers: `X-Dairy-Id`, `X-Request-Id`) ➔ `HTTP 200`
- **Request 4:** `GET /api/v1/customers` ➔ `HTTP 200`
- **Outcome:** **PASSED**

### 4. `apps/dfarm-super-admin`
- **Request 1:** `POST /api/v1/auth/admin/otp/request` (+917755995615) ➔ `HTTP 200` (`previewOtp: 712954`)
- **Request 2:** `POST /api/v1/auth/admin/otp/verify` (OTP: 712954) ➔ `HTTP 200` (`role: SUPER_ADMIN`)
- **Request 3:** `GET /api/v1/dairies` ➔ `HTTP 200` (1 platform dairy)
- **Request 4:** `GET /api/v1/super-admin/dashboard/metrics` ➔ `HTTP 200` (`metrics: { activeDairies: 1, ... }`)
- **Outcome:** **PASSED**
