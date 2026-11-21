# DFarm — Priority 0: Network Root Cause Analysis

**Execution Reference:** DFARM-PRIORITY-00-BACKEND-NETWORK-RECOVERY  
**Document:** `01_NETWORK_ROOT_CAUSE_ANALYSIS.md`  
**Timestamp:** 2026-11-19T13:30:00+05:30  
**Root Cause Status:** CONFIRMED & RESOLVED  

---

## 1. Problem Classification

Following the Priority 0 decision tree:

- **Case A: Request Never Reaches Backend (Primary Failure)**
  - When browser-based applications (`dfarm-dairy-admin`, `dfarm-customer-app` Web, `dfarm-collection-app`) initiated HTTP requests containing mandatory headers (`X-Dairy-Id`, `X-Client-App`, `X-Client-Version`), the browser triggered an HTTP `OPTIONS` preflight.
  - The running backend instance rejected these header fields in the preflight response (`Access-Control-Allow-Headers`).
  - As per the W3C Cross-Origin Resource Sharing specification, the browser immediately aborted the request with a network error (`TypeError: Failed to fetch` or `AxiosError: Network Error`), without transmitting the actual `GET` or `POST` request to the backend.

- **Case A (Android Native Subnet Trap):**
  - In `apps/dfarm-customer-app/src/services/api-client.ts`, the environment variable fallback (`EXPO_PUBLIC_API_URL=http://10.114.224.223:4000/api/v1`) took precedence over emulator detection (`10.0.2.2:4000`), forcing Android emulators on virtual network `10.0.2.15` to connect via LAN Wi-Fi IP, causing connection timeouts when network isolation or firewall rules prevented inbound traffic.

---

## 2. In-Depth Root Cause Breakdown

### Root Cause 1: Running Process Memory Drift (Stale Server Process)
- **Mechanism:** The backend Node.js process (`PID 27884`, listening on port `4000`) had been launched at `11:11:38`. Although source code in `services/backend/src/config/cors.ts` was subsequently edited, the server was not restarted.
- **Evidence:** 
  - `(Get-Process -Id 27884).StartTime`: `19 November 2026 11:11:38`
  - `(Get-Item services/backend/dist/config/cors.js).LastWriteTime`: `19 November 2026 13:20:36`
  - Running server responded to preflight with:
    `Access-Control-Allow-Headers: Content-Type,Authorization,X-Request-Id,Accept,X-Dairy-Tenant-ID,x-dairy-tenant-id`
  - Required headers `X-Dairy-Id`, `X-Client-App`, `X-Client-Version` were absent in the active process memory.

### Root Cause 2: Proxy Header Filtering in Unified Hub (`scripts/dev-server.js`)
- **Mechanism:** In `scripts/dev-server.js`, preflight requests for any route were handled directly by the Node.js HTTP server on port `3000`:
  ```javascript
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
    });
    res.end();
    return;
  }
  ```
- **Evidence:** Applications routing through the port 3000 hub had their `X-Dairy-Id` and client headers rejected during preflight.

### Root Cause 3: Incomplete `CORS_ALLOWED_ORIGINS` in Environment Configuration
- **Mechanism:** `.env` and `services/backend/.env` configured `CORS_ALLOWED_ORIGINS` without port `8081` (Metro Web / Customer App) and without the active Wi-Fi LAN IP endpoints (`http://10.114.224.223:*`). In strict production evaluation, requests from port 8081 would fail origin validation.

---

## 3. Affirmation: What Was NOT The Root Cause

- **Database Corruption / Schema Failure:** The backend in-memory database test double (`pg-mem`) and schema initialization operate correctly. No migration was broken.
- **API Route Missing:** Endpoints (`/api/v1/auth/admin/otp/request`, `/api/v1/dashboard/summary`, `/api/v1/dairies/nearby`, `/api/v1/customers/memberships`) are fully registered in `cleanApiRouter`.
- **JWT / Auth Policy:** Token generation, signing, and verification were completely functional.
- **DNS / TLS:** In the local environment, all services run over HTTP with valid loopback/host resolution.

---

## 4. Remediation Plan

1. Update `services/backend/src/config/cors.ts` to explicitly allow all application headers:
   `X-Dairy-Id`, `x-dairy-id`, `X-Dairy-Tenant-ID`, `x-dairy-tenant-id`, `X-Client-App`, `x-client-app`, `X-Client-Version`, `x-client-version`, `X-Device-Id`, `x-device-id`, `X-Idempotency-Key`, `x-idempotency-key`, `X-Access-Token`, `x-access-token`.
2. Update `scripts/dev-server.js` OPTIONS handler to mirror the backend allowlist.
3. Update `CORS_ALLOWED_ORIGINS` in `.env` and `services/backend/.env` to include port 8081 and host LAN IPs.
4. Correct Android emulator host routing in `apps/dfarm-customer-app/src/services/api-client.ts`.
5. Compile backend (`npm run build:backend`).
6. Restart backend server and dev-server to load fresh compiled artifacts.
7. Execute end-to-end smoke verification across all 4 applications.
