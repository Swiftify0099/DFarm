# DFarm — Priority 0: Confirmed Network Fix Report

**Execution Reference:** DFARM-PRIORITY-00-BACKEND-NETWORK-RECOVERY  
**Document:** `08_CONFIRMED_NETWORK_FIX_REPORT.md`  
**Timestamp:** 2026-11-19T13:34:00+05:30  
**Resolution Status:** FIXED AND REPRODUCED SUCCESSFULLY  

---

## 1. Targeted Code & Configuration Corrections

The smallest safe, targeted corrections were applied without altering business logic or database migrations:

### Fix 1: Update Allowed Headers in Backend CORS (`services/backend/src/config/cors.ts`)
- Added missing canonical and lowercase headers:
  `X-Dairy-Id`, `x-dairy-id`, `X-Client-App`, `x-client-app`, `X-Client-Version`, `x-client-version`, `X-Device-Id`, `x-device-id`, `X-Idempotency-Key`, `x-idempotency-key`, `X-Access-Token`, `x-access-token`.

### Fix 2: Mirror Preflight Allowed Headers in Hub Dev Proxy (`scripts/dev-server.js`)
- Replaced the restricted `'Content-Type, Authorization, X-Request-Id'` OPTIONS header string with the complete frontend headers suite:
  ```javascript
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Request-Id, Accept, X-Dairy-Id, X-Dairy-Tenant-ID, x-dairy-id, x-dairy-tenant-id, X-Client-App, x-client-app, X-Client-Version, x-client-version, X-Device-Id, x-device-id, X-Idempotency-Key, x-idempotency-key, X-Access-Token, x-access-token',
  });
  ```

### Fix 3: Extend `CORS_ALLOWED_ORIGINS` in `.env` and `services/backend/.env`
- Added port 8081 (`http://localhost:8081`, `http://127.0.0.1:8081`) and LAN Wi-Fi host IP origins (`http://10.114.224.223:8081`, `http://10.114.224.223:5174`, etc.).

### Fix 4: Android Emulator Host Resolution Precedence (`apps/dfarm-customer-app/src/services/api-client.ts`)
- Evaluated Android Studio Emulator (`10.0.2.2:4000`) before external Wi-Fi IP fallback to guarantee emulator reachability.

### Fix 5: Compile & Process Recycling
- Ran `npm run build:backend` to generate clean `dist/` artifacts.
- Terminated stale process `PID 27884` (11:11:38 start time) and proxy `PID 20180`.
- Started fresh backend and proxy instances.

---

## 2. Before vs. After Validation Evidence

### Case 1: Dairy Admin Dashboard Preflight
- **Before Fix:**
  - Status: 204 No Content
  - `Access-Control-Allow-Headers: Content-Type,Authorization,X-Request-Id,Accept,X-Dairy-Tenant-ID,x-dairy-tenant-id`
  - Browser: Blocked with CORS Network Error (missing `X-Dairy-Id`).
- **After Fix:**
  - Status: 204 No Content
  - `Access-Control-Allow-Headers: Content-Type,Authorization,X-Request-Id,Accept,X-Dairy-Tenant-ID,x-dairy-tenant-id,X-Dairy-Id,x-dairy-id,X-Client-App,x-client-app,X-Client-Version,x-client-version,X-Device-Id,x-device-id,X-Idempotency-Key,x-idempotency-key,X-Access-Token,x-access-token`
  - Browser: Preflight passes; subsequent `GET /api/v1/dashboard/summary` returns `200 OK`.

### Case 2: Customer App Web Login Preflight
- **Before Fix:**
  - Status: 204 No Content
  - Browser: Blocked with CORS Network Error (missing `X-Client-App`, `X-Client-Version`).
- **After Fix:**
  - Status: 204 No Content
  - Browser: Preflight passes; subsequent `POST /api/v1/auth/request-otp` returns `200 OK` with dispatched OTP.
