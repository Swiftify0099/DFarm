# DFarm — Priority 0: Backend Network Error Reproduction & Evidence

**Execution Reference:** DFARM-PRIORITY-00-BACKEND-NETWORK-RECOVERY  
**Report Generated:** 2026-11-19T13:25:00+05:30  
**Status:** ROOT CAUSE CONFIRMED & SYSTEMATICALLY REPRODUCED  

---

## 1. Executive Summary of Reproduction

A thorough investigation of the running environment across all four applications and the Node.js backend revealed **three interrelated root causes** that triggered browser and native `Network Error` failures:

1. **Running Process Code Drift (Stale Backend Process):**
   - The backend server process (`PID 27884`, listening on port `4000`) was started at `11:11:38`.
   - The compiled `dist/config/cors.js` had been updated at `13:20:36` to include newer headers, but the running Node.js process was running the original in-memory module which restricted `Access-Control-Allow-Headers` to:
     `Content-Type, Authorization, X-Request-Id, Accept, X-Dairy-Tenant-ID, x-dairy-tenant-id`
   - When any browser app sent custom headers (`X-Dairy-Id`, `X-Client-App`, `X-Client-Version`), the browser preflight OPTIONS request was rejected by the browser's CORS engine, aborting the HTTP request before it could be sent to the backend.

2. **CORS Preflight Header Rejection in Platform Hub Proxy (`scripts/dev-server.js`):**
   - The unified dev proxy (`dev-server.js`, `PID 20180` on port `3000`) hardcoded OPTIONS preflight allowed headers as:
     `'Content-Type, Authorization, X-Request-Id'`
   - When requests passed through the hub port `3000`, the browser preflight was stripped of `X-Dairy-Id`, `X-Client-App`, and `X-Client-Version`, resulting in `Network Error`.

3. **Android Emulator Subnet Routing Trap in `apps/dfarm-customer-app`:**
   - In `apps/dfarm-customer-app/src/services/api-client.ts`, non-localhost environment IPs (`http://10.114.224.223:4000/api/v1`) took precedence over Android Studio emulator detection (`10.0.2.2:4000`), causing Android emulators to attempt WAN Wi-Fi connection, failing with socket timeout / network error when interface bridging was absent.

---

## 2. Reproduction Case 1: Dairy Admin Dashboard / API Requests

- **Application:** `apps/dfarm-dairy-admin`
- **Screen:** Dairy Dashboard (`/`), Farmer Directory (`/customers`), Rates (`/rates`)
- **User Action:** Log in as Dairy Admin (+917755995615) and navigate to Dairy Dashboard.
- **API URL:** `http://localhost:4000/api/v1/dashboard/summary`
- **HTTP Method:** `GET`
- **Request Headers:**
  ```http
  Accept: application/json
  Authorization: Bearer <JWT_REDACTED>
  Content-Type: application/json
  X-Dairy-Id: 00000000-0000-0000-0000-000000000001
  ```
- **Browser Preflight Sent:**
  ```http
  OPTIONS /api/v1/dashboard/summary HTTP/1.1
  Host: localhost:4000
  Origin: http://localhost:5174
  Access-Control-Request-Method: GET
  Access-Control-Request-Headers: accept, authorization, content-type, x-dairy-id
  ```
- **Backend Response Received:**
  ```http
  HTTP/1.1 204 No Content
  Access-Control-Allow-Origin: http://localhost:5174
  Access-Control-Allow-Credentials: true
  Access-Control-Allow-Headers: Content-Type,Authorization,X-Request-Id,Accept,X-Dairy-Tenant-ID,x-dairy-tenant-id
  ```
- **Resulting Network Failure:**
  - Browser Error: `Access to fetch at 'http://localhost:4000/api/v1/dashboard/summary' from origin 'http://localhost:5174' has been blocked by CORS policy: Request header field x-dairy-id is not allowed by Access-Control-Allow-Headers in preflight response.`
  - Application UI: Generic `Network Error` banner / `Failed to fetch`.
- **Did backend receive the GET request:** **NO.** (Preflight failure prevented GET from dispatching).
- **First Confirmed Failing Layer:** Browser CORS Preflight Engine (Missing `X-Dairy-Id` in `Access-Control-Allow-Headers`).

---

## 3. Reproduction Case 2: Customer App Web OTP / Discovery

- **Application:** `apps/dfarm-customer-app` (Web runtime on `:8081` or `:3000/customer`)
- **Screen:** Login Screen (`/login`), Dairy Discovery (`/dairy-discovery`)
- **User Action:** Enter mobile number and click "Send OTP" or load nearby dairies.
- **API URL:** `http://localhost:4000/api/v1/auth/request-otp` and `http://localhost:4000/api/v1/dairies/nearby`
- **HTTP Method:** `POST` / `GET`
- **Request Headers:**
  ```http
  Accept: application/json
  Content-Type: application/json
  X-Client-App: DFarm-Customer-Android
  X-Client-Version: 1.0.0
  ```
- **Browser Preflight Sent:**
  ```http
  OPTIONS /api/v1/auth/request-otp HTTP/1.1
  Host: localhost:4000
  Origin: http://localhost:8081
  Access-Control-Request-Method: POST
  Access-Control-Request-Headers: accept, content-type, x-client-app, x-client-version
  ```
- **Backend Response Received:**
  ```http
  HTTP/1.1 204 No Content
  Access-Control-Allow-Origin: http://localhost:8081
  Access-Control-Allow-Credentials: true
  Access-Control-Allow-Headers: Content-Type,Authorization,X-Request-Id,Accept,X-Dairy-Tenant-ID,x-dairy-tenant-id
  ```
- **Resulting Network Failure:**
  - Browser Error: `Access to XMLHttpRequest at 'http://localhost:4000/api/v1/auth/request-otp' from origin 'http://localhost:8081' has been blocked by CORS policy: Request header field x-client-app is not allowed by Access-Control-Allow-Headers in preflight response.`
  - Axios Error: `AxiosError: Network Error`
- **Did backend receive the POST request:** **NO.**
- **First Confirmed Failing Layer:** Browser CORS Preflight Engine (Missing `X-Client-App`, `X-Client-Version` in `Access-Control-Allow-Headers`).

---

## 4. Reproduction Case 3: Milk Collection Terminal Push Sync

- **Application:** `apps/dfarm-collection-app` (`:5175` or `:3000/collection`)
- **Screen:** Offline Queue / Sync View (`/sync`)
- **User Action:** Batch push offline intake records to backend.
- **API URL:** `http://localhost:4000/api/v1/sync/push`
- **HTTP Method:** `POST`
- **Request Headers:**
  ```http
  Accept: application/json
  Authorization: Bearer <JWT_REDACTED>
  Content-Type: application/json
  X-Dairy-Id: 00000000-0000-0000-0000-000000000001
  X-Request-Id: <UUID>
  ```
- **Resulting Network Failure:**
  - Browser preflight checks for `X-Dairy-Id`. Missing from allowlist triggers preflight failure.
- **First Confirmed Failing Layer:** Browser CORS Preflight Engine.

---

## 5. Summary Table of Failing Layers

| Application | Primary Failing Action | Failing Layer | Root Cause |
| :--- | :--- | :--- | :--- |
| **dfarm-dairy-admin** | `GET /dashboard/summary` | Browser Preflight (Case A) | Preflight rejects `x-dairy-id` |
| **dfarm-customer-app** | `POST /auth/request-otp` | Browser Preflight (Case A) | Preflight rejects `x-client-app`, `x-client-version` |
| **dfarm-customer-app (Android)** | App Startup API Calls | Networking (Case A) | Emulator bypassed `10.0.2.2` fallback due to precedence order |
| **dfarm-collection-app** | `GET /customers`, `POST /sync/push` | Browser Preflight (Case A) | Preflight rejects `x-dairy-id` |
| **dfarm-super-admin** | `GET /dairies` | Client Timeout (Case D) | Aggressive 800ms abort threshold in `safeFetch` |
