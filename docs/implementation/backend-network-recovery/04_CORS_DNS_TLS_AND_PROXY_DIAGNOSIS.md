# DFarm — Priority 0: CORS, DNS, TLS, and Proxy Diagnosis

**Execution Reference:** DFARM-PRIORITY-00-BACKEND-NETWORK-RECOVERY  
**Document:** `04_CORS_DNS_TLS_AND_PROXY_DIAGNOSIS.md`  
**Timestamp:** 2026-11-19T13:32:00+05:30  
**Diagnosis Status:** RESOLVED & VERIFIED  

---

## 1. CORS Preflight & Allowed Headers Deep Dive

### Problem Statement
Modern browsers mandate an `OPTIONS` preflight for any HTTP request containing custom headers or non-simple content types (`application/json` with custom headers). If the preflight response does not explicitly include every header listed in `Access-Control-Request-Headers`, the browser refuses to issue the actual request and surfaces a generic `Network Error`.

### The Defect
The backend originally declared:
```typescript
allowedHeaders: [
  'Content-Type',
  'Authorization',
  'X-Request-Id',
  'Accept',
  'X-Dairy-Tenant-ID',
  'x-dairy-tenant-id'
]
```
However, the frontends sent:
- `X-Dairy-Id` (Dairy Admin, Collection Terminal, Customer App)
- `X-Client-App` (Customer App)
- `X-Client-Version` (Customer App)
- `X-Device-Id` (Collection Terminal)
- `X-Idempotency-Key` (Sync Engine)
- `X-Access-Token` (Auth Alternative)

### Resolution
`services/backend/src/config/cors.ts` was updated with the complete canonical and lowercase allowed headers:
```typescript
allowedHeaders: [
  'Content-Type',
  'Authorization',
  'X-Request-Id',
  'Accept',
  'X-Dairy-Tenant-ID',
  'x-dairy-tenant-id',
  'X-Dairy-Id',
  'x-dairy-id',
  'X-Client-App',
  'x-client-app',
  'X-Client-Version',
  'x-client-version',
  'X-Device-Id',
  'x-device-id',
  'X-Idempotency-Key',
  'x-idempotency-key',
  'X-Access-Token',
  'x-access-token'
]
```
The exact matching headers were also mirrored into `scripts/dev-server.js` for port 3000 proxying.

---

## 2. DNS & TLS Verification

- **DNS:** All local endpoints use IP loopback (`127.0.0.1`, `::1`), `localhost`, or the active LAN Wi-Fi adapter IP (`10.114.224.223`). No DNS resolution latency or NXDOMAIN errors were encountered.
- **TLS/HTTPS:** Local development services run in clear HTTP mode (`http://`). Android manifest `usesCleartextTraffic="true"` is preserved in `apps/dfarm-customer-app/app.json`.

---

## 3. Proxy Verification

- **Hub Dev Proxy (`scripts/dev-server.js`):**
  - Proxies `/api/` and `/health` to backend port `4000`.
  - Added full CORS headers to handle OPTIONS preflight at the proxy layer.
  - Passes incoming request headers through without modification.
- **Vite Proxy (`apps/dfarm-collection-app`):**
  - Proxies `/api` on port `5175` to `http://localhost:4000` with `changeOrigin: true`. Tested and operating as expected.
