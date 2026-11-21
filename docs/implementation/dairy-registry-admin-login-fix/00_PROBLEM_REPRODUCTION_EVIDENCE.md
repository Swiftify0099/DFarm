# 00 - Problem Reproduction & Live System Evidence

**Execution Reference:** `DFARM-DAIRY-REGISTRY-ADMIN-LOGIN-RECOVERY`  
**Timestamp:** `2026-11-19T09:16:13Z`  
**Target Environments:** `services/backend` (:4000), `apps/dfarm-super-admin` (:5173), `apps/dfarm-dairy-admin` (:5174)

---

## 1. Executive Summary of Reproduction

Both reported issues were systematically reproduced against the live running environment prior to landing permanent code fixes:
1. **Issue A (Directory Visibility & Duplicate Conflict):**
   - The central dairy entity for **"Warna Milk's"** was present in the platform's central database (`dfarm_central` / in-memory store) under ID `65190859-c8e2-4a06-b862-5ed7ad8628cb` and code `DF-SAN-6632`.
   - When Super Admin navigated to the **Dairy Tenant Directory**, the frontend list query bypassed backend filter synchronization, while the backend `GET /api/v1/dairies` lacked query parameter filtering (`search`, `status`, `state`).
   - In addition, an outdated database `JOIN` strictly matching `u.user_role = 'DAIRY_ADMIN'` failed to attach primary administrators whose role was set to `PRIMARY_DAIRY_ADMIN` or stored in `u.role`.
   - When attempting to create the dairy anew via `POST /api/v1/dairies`, the platform detected the name collision and emitted `409 Conflict: A dairy named "Warna Milk's" already exists on the platform.`, with no actionable metadata linking to the existing tenant.
2. **Issue B (Dairy Admin OTP Verification 400 Bad Request):**
   - `POST /api/v1/auth/admin/otp/verify` returned `400 Bad Request` upon re-submission or credential lookup failure.
   - The root cause was a challenge consumption cascade: the OTP verification succeeded, consuming the challenge (`isUsed = true`), but subsequent lookup in `users` failed to match the unactivated primary admin (`status = 'INACTIVE'`).
   - The subsequent retry attempt with the same OTP triggered `DomainValidationError('Invalid or expired Admin OTP.')`, which the HTTP exception handler mapped directly to `400 Bad Request`.

---

## 2. Issue A Reproduction Evidence

### 2.1 Dairy Directory Query (`GET /api/v1/dairies`)
- **Request URL:** `http://localhost:4000/api/v1/dairies`
- **Request Method:** `GET`
- **Query Parameters:** `?search=Warna&status=all&state=all`
- **Response Status Code:** `200 OK`
- **Authoritative Existing Record Captured in Central DB:**
```json
{
  "id": "65190859-c8e2-4a06-b862-5ed7ad8628cb",
  "code": "DF-SAN-6632",
  "name": "Warna Milk's",
  "status": "active",
  "primaryAdminId": "37b8de06-0023-4935-b1bb-3d7152065e6e",
  "primaryAdminName": "popat yewale",
  "primaryAdminMobile": "9834388787",
  "location": {
    "addressLine1": "Kavathe Piran",
    "villageLocality": "Kavathe Piran",
    "district": "sangli",
    "state": "Maharashtra",
    "pincode": "416417",
    "latitude": 16.8954772,
    "longitude": 74.4701475,
    "formattedAddress": "Kavathe Piran, Maharashtra, India",
    "placeId": "ChIJZ_aoXn8awTsRUZ98RCPf9qw"
  },
  "contact": {
    "businessPhone": "9834388787",
    "businessEmail": "pankajye5656@gmail.com"
  },
  "createdAt": "2026-11-19T08:14:44.025Z",
  "updatedAt": "2026-11-19T08:14:44.025Z"
}
```

### 2.2 Duplicate Creation Reproduction (`POST /api/v1/dairies`)
- **Request URL:** `http://localhost:4000/api/v1/dairies`
- **Request Method:** `POST`
- **Payload:**
```json
{
  "name": "Warna Milk's",
  "businessPhone": "9834388787",
  "businessEmail": "pankajye5656@gmail.com",
  "addressLine1": "Kavathe Piran",
  "district": "sangli",
  "state": "Maharashtra",
  "pincode": "416417",
  "primaryAdminName": "popat yewale",
  "primaryAdminMobile": "9834388787"
}
```
- **Observed HTTP Response:**
  - **Status Code:** `409 Conflict`
  - **Response Payload:**
```json
{
  "success": false,
  "error": "A dairy named \"Warna Milk's\" already exists on the platform."
}
```

---

## 3. Issue B Reproduction Evidence (Dairy Admin OTP Verification)

### 3.1 Step 1 — Dispatch OTP Request
- **Request URL:** `http://localhost:4000/api/v1/auth/admin/otp/request`
- **Request Method:** `POST`
- **Payload:**
```json
{
  "mobileNumber": "9834388787"
}
```
- **Response Status Code:** `200 OK`
- **Response Body:**
```json
{
  "success": true,
  "message": "Verification code sent successfully to ********8787",
  "cooldownSeconds": 60,
  "expiresAt": "2026-11-19T09:05:01.977Z",
  "previewOtp": "[REDACTED_OTP]"
}
```

### 3.2 Step 2 — Initial Verification Attempt & Unauthorized Mapping
- **Request URL:** `http://localhost:4000/api/v1/auth/admin/otp/verify`
- **Request Method:** `POST`
- **Payload:**
```json
{
  "mobileNumber": "9834388787",
  "otp": "[REDACTED_OTP]"
}
```
- **Initial Response Status Code:** `401 Unauthorized`
- **Initial Response Body:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "No authorized administrator account found for this mobile number."
  }
}
```

### 3.3 Step 3 — Subsequent Retry & 400 Bad Request Root Cause
- When the user or automated client resubmitted the form (or retried the verification call):
- **Request URL:** `http://localhost:4000/api/v1/auth/admin/otp/verify`
- **Observed Response Status Code:** `400 Bad Request`
- **Response Body:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid or expired Admin OTP."
  }
}
```
- **Underlying Exception:** `DomainValidationError: Invalid or expired Admin OTP.` thrown in `VerifyAdminOtpUseCase.ts` (line 59) because the OTP challenge was previously marked `isUsed = true`.
