# Root Cause Analysis — Systemic Network Errors

**Execution Reference:** DFARM-MASTER-BACKEND-API-RECOVERY  
**Report Type:** Deep Technical Root Cause & Multi-Layer Forensic Analysis

---

## 1. Summary of Identified Root Causes

The reported "Network Errors" and intermittent workflow failures were caused by **six distinct, compounding defects across the frontend, network, and database layers**, rather than a single isolated point of failure:

1. **CORS Preflight Blockade (`X-Dairy-Id` Header Rejection):**
   - *Layer:* Backend Express CORS configuration (`services/backend/src/config/cors.ts`).
   - *Mechanism:* Browsers making cross-origin requests with custom headers (`X-Dairy-Id`, `X-Client-App`) issue an `OPTIONS` preflight request. The backend returned `403 Forbidden` because these headers were not listed in `allowedHeaders`. The browser dropped the request and threw generic `Network Error` / `TypeError: Failed to fetch`.
   - *Fix:* Added `X-Dairy-Id`, `x-dairy-id`, `X-Client-App`, `x-client-app`, `X-Client-Version`, `x-client-version`, `X-Device-Id`, and `x-device-id` to `corsOptions.allowedHeaders`.

2. **Mobile LAN Subnet Desynchronization:**
   - *Layer:* Mobile Client Network Config (`apps/dfarm-customer-app/.env` & `api-client.ts`).
   - *Mechanism:* Hardcoded development IP was `10.114.224.223`. Host machine Wi-Fi interface had moved to `10.136.173.223`. Mobile requests timed out with `AxiosError: Network Error`.
   - *Fix:* Updated `.env` and refactored `api-client.ts` to prioritize dynamic Metro host resolution (`Constants.expoConfig?.hostUri`).

3. **Client-Side Premature Abort in Super Admin:**
   - *Layer:* Frontend Fetch Client (`apps/dfarm-super-admin/src/api/client.ts`).
   - *Mechanism:* `safeFetch` hardcoded an 800ms abort controller timeout. Any real API call requiring >800ms was aborted on the client before the server finished.
   - *Fix:* Configured environment-aware timeouts (400ms for test mocks, 8000ms for production).

4. **Migration Regression Overriding Supabase `auth.uid()`:**
   - *Layer:* Database Migration (`supabase/migrations/001_extensions_and_common.sql`).
   - *Mechanism:* A stub function `auth.uid()` returning `NULL` broke Supabase GoTrue authentication claim resolution, failing database static validation.
   - *Fix:* Removed the rogue stub; native GoTrue extractor preserved.

5. **Offline Sync Push Device Authentication Protocol Mismatch:**
   - *Layer:* Backend Sync Route & Middleware (`sync.routes.ts` & `authenticate.ts`).
   - *Mechanism:* Collection App passed string `KIOSK_MAIN` to `POST /sync/push`. Middleware queried `WHERE id = $1` on UUID column, crashing PostgreSQL with type error.
   - *Fix:* Enhanced middleware to query `device_identifier` for non-UUID strings and aliased `/sync/push` to `ProcessOfflineSyncBatchUseCase`.

6. **Missing Auth Logout Route:**
   - *Layer:* Backend Auth Router (`services/backend/src/presentation/routes/auth.routes.ts`).
   - *Mechanism:* Customer App called `POST /api/v1/auth/logout`, which was unmounted, returning 404.
   - *Fix:* Registered `router.post('/logout')`.
