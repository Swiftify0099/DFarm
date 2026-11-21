# 08 - Dairy Admin Login End-to-End Verification

**Execution Reference:** `DFARM-DAIRY-REGISTRY-ADMIN-LOGIN-RECOVERY`  
**Application Target:** `apps/dfarm-dairy-admin` (:5174) & `services/backend` (:4000)

---

## 1. End-to-End Verification Summary

Comprehensive automated tests were executed against the running backend server to verify the complete OTP authentication lifecycle for both primary and operational dairy administrators.

| Target Admin | Mobile Number | OTP Request Status | OTP Verify Status | Assigned Dairy | Token Generated |
|---|---|---|---|---|---|
| **Popat Yewale** | `+919834388787` | `200 OK` | `200 OK` | Warna Milk's (`DF-SAN-6632`) | `Yes (Valid JWT)` |
| **Warna Dairy Admin** | `+917507495615` | `200 OK` | `200 OK` | Warna Milk's (`DF-SAN-6632`) | `Yes (Valid JWT)` |
| **Invalid OTP Attempt** | `+919834388787` | `200 OK` | `400 Bad Request` | N/A | `No (Correctly Rejected)` |

---

## 2. Test Execution Traces

### 2.1 Primary Admin: Popat Yewale (`9834388787`)
1. **Dispatch OTP Request:**
   ```bash
   POST /api/v1/auth/admin/otp/request
   {"mobileNumber":"9834388787"}
   ```
   **Response (200 OK):**
   ```json
   {
     "success": true,
     "message": "Verification code sent successfully to ********8787",
     "cooldownSeconds": 60,
     "expiresAt": "2026-11-19T09:21:29.015Z",
     "previewOtp": "717224"
   }
   ```
2. **Verify OTP Code:**
   ```bash
   POST /api/v1/auth/admin/otp/verify
   {"mobileNumber":"9834388787","otp":"717224"}
   ```
   **Response (200 OK):**
   ```json
   {
     "success": true,
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "expiresIn": 86400,
     "user": {
       "id": "37b8de06-0023-4935-b1bb-3d7152065e6e",
       "phone": "+919834388787",
       "role": "DAIRY_ADMIN",
       "actorType": "STAFF",
       "name": "popat yewale",
       "fullName": "popat yewale",
       "dairyId": "65190859-c8e2-4a06-b862-5ed7ad8628cb",
       "dairyName": "Warna Milk's",
       "dairyCode": "DF-SAN-6632"
     }
   }
   ```

### 2.2 Operational Admin: Warna Dairy Admin (`7507495615`)
1. **Dispatch OTP Request:**
   ```bash
   POST /api/v1/auth/admin/otp/request
   {"mobileNumber":"7507495615"}
   ```
   **Response (200 OK):** `previewOtp: "352407"`
2. **Verify OTP Code:**
   ```bash
   POST /api/v1/auth/admin/otp/verify
   {"mobileNumber":"7507495615","otp":"352407"}
   ```
   **Response (200 OK):**
   ```json
   {
     "success": true,
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
     "user": {
       "id": "272d8a02-b1c8-4a70-b23a-da5565ea77b3",
       "phone": "+917507495615",
       "role": "DAIRY_ADMIN",
       "name": "Warna Dairy Admin",
       "dairyId": "65190859-c8e2-4a06-b862-5ed7ad8628cb",
       "dairyName": "Warna Milk's",
       "dairyCode": "DF-SAN-6632"
     }
   }
   ```

### 2.3 Invalid OTP Handling
```bash
POST /api/v1/auth/admin/otp/verify
{"mobileNumber":"9834388787","otp":"000000"}
```
**Response (400 Bad Request):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid or expired Admin OTP."
  }
}
```
Client UI receives a clear, actionable validation message instead of an unhandled crash or undefined failure.
