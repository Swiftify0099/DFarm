# DFARM — CUSTOMER FACE BIOMETRIC UPDATE 404 & TEST FACE NETWORK ERROR
## 00. ERROR REPRODUCTION REPORT

**Execution Reference:** `DFARM-CUSTOMER-FACE-API-404-NETWORK-FIX`  
**Execution Timestamp:** 2026-11-20  
**Target Applications:**
- `apps/dfarm-customer-app` (Expo 58 / React Native Web & Mobile)
- `services/backend` (Express.js Clean Architecture)
- `apps/dfarm-collection-app` (Regression Verification)

---

### 1. Issue Summary & Executive Overview

Prior to this fix, farmers utilizing the **Customer App** experienced two major failures in the Biometrics Management and Diagnostics interface:

1. **Issue A — Update Face Biometric 404 Failure:**  
   Clicking "Update Face Biometric" after capturing face samples displayed:
   ```
   Request failed with status code 404
   ```
2. **Issue B — Test Face Network Error:**  
   Clicking "Test Face" in the diagnostic camera preview displayed:
   ```
   Network Error
   ```

Both issues completely blocked farmers from validating their facial identity templates, enrolling updated biometric vectors, and running diagnostics to verify their recognition eligibility for milk collection counters.

---

### 2. Reproduction of Issue A: Update Face Biometric 404

#### 2.1 Workflow Steps
1. Authenticated as an approved customer in `apps/dfarm-customer-app`.
2. Navigated to `/profile/biometrics` (Face Biometric Enrollment screen).
3. The app initiated the camera capture sequence, collecting 5 high-quality face samples and generating a 128-dimensional SFace INT8 embedding.
4. On clicking **Submit Biometrics** or **Update Face Biometric**, the frontend dispatched an HTTP POST request.
5. Frontend received an HTTP 404 Not Found error:
   ```json
   {
     "message": "Request failed with status code 404"
   }
   ```

#### 2.2 Network Capture Evidence
- **Frontend Caller:** `apps/dfarm-customer-app/src/features/profile/useProfile.ts`
- **Request URL Dispatched:** `POST /api/v1/customers/biometrics/update` (missing `:id` route parameter segment when invoked without explicit customer ID, or invoked with alias routes).
- **Backend Registered Route:** Backend Express router in `customers.routes.ts` had ONLY registered:
  ```typescript
  router.post('/:id/biometrics/update', ...)
  ```
- **Express Route Mismatch:**
  Because the frontend sent `POST /api/v1/customers/biometrics/update`, Express attempted to match `:id = "biometrics"` and sub-route `update`. The route pattern matched, but within the controller, `customerId` was resolved to `"biometrics"`. The query `customerRepo.findById('biometrics', orgId)` failed to find any customer with UUID `"biometrics"`, resulting in a `CustomerNotFoundError` which mapped directly to an HTTP 404 response.

---

### 3. Reproduction of Issue B: Test Face Network Error

#### 3.1 Workflow Steps
1. In `apps/dfarm-customer-app`, navigated to `/profile/diagnostics` (Face AI Diagnostics).
2. Clicked **Test Face Recognition**.
3. Camera captured the live face, generated a normalized 128-dimensional embedding.
4. The frontend dispatched a 1:1 match request to the backend:
   ```http
   POST /api/v1/identity/face/match
   Headers:
     Authorization: Bearer <customer_jwt>
     X-Organization-Id: <dairy_tenant_uuid>
     Content-Type: application/json
   Body:
     {
       "embedding": [0.082, -0.014, ...],
       "customerId": "<customer_uuid>"
     }
   ```
5. In web browsers (React Native Web / Vite / Expo Web), Axios immediately threw:
   ```
   AxiosError: Network Error
   ```

#### 3.2 Network & CORS Capture Evidence
- **Preflight Inspection:**  
  When Axios in a browser dispatched the cross-origin preflight request `OPTIONS /api/v1/identity/face/match`, the browser checked `Access-Control-Allow-Headers`.
- **CORS Configuration in `services/backend/src/config/cors.ts`:**
  ```typescript
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Dairy-Tenant-Id',
    'X-Requested-With',
    'Accept',
    'Origin',
  ]
  ```
- **The Violation:**  
  The frontend API client (`apps/dfarm-customer-app/src/services/api-client.ts`) injected:
  ```typescript
  config.headers['X-Organization-Id'] = dairyId;
  ```
  Because `X-Organization-Id` was **omitted** from `allowedHeaders` in `cors.ts`, the browser security model blocked the actual POST request and threw a CORS Preflight Failure. In Axios, browser CORS rejections are surfaced generically as `Network Error`.

---

### 4. Reproduction Verification Matrix

| Test Case | Trigger Method | Expected Before Fix | Actual Observed | Root Cause |
|---|---|---|---|---|
| **Update Face** | `POST /api/v1/customers/biometrics/update` | `200 OK` | `404 Not Found` | Route parameter `:id` missing / matched literal `"biometrics"` |
| **Update Face (me)** | `POST /api/v1/customers/me/biometrics/update` | `200 OK` | `404 Not Found` | No route handler for `/me/biometrics/update` |
| **Test Face (CORS)** | `OPTIONS /api/v1/identity/face/match` | `204 with X-Organization-Id` | `204 without header` | `cors.ts` missing header whitelist |
| **Test Face (Call)** | `POST /api/v1/identity/face/match` | `200 Match Result` | `Network Error` | Browser blocked by CORS preflight omission |

---

### 5. Conclusion
Both issues were successfully reproduced and isolated down to route registry structure, customer resolution logic, and CORS preflight header validation.
