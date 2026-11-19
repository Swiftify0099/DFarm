# DFarm — Priority 0: API Base URL and Environment Audit

**Execution Reference:** DFARM-PRIORITY-00-BACKEND-NETWORK-RECOVERY  
**Document:** `03_API_BASE_URL_AND_ENVIRONMENT_AUDIT.md`  
**Timestamp:** 2026-11-19T13:31:30+05:30  
**Audit Status:** VERIFIED & ALIGNED ACROSS ALL FOUR APPLICATIONS  

---

## 1. Application-by-Application Audit

### 1. `apps/dfarm-customer-app`
- **Location:** `src/services/api-client.ts`
- **Resolution Logic:** `resolveDefaultBaseUrl()`
  - **Web Runtime (`Platform.OS === 'web'`):**
    - Checks `process.env.EXPO_PUBLIC_WEB_API_URL`
    - Checks `process.env.VITE_API_BASE_URL`
    - Defaults to `http://localhost:4000/api/v1`
  - **Expo Metro Wi-Fi Host IP (`metroHost`):**
    - Derives `Constants.expoConfig?.hostUri` / `debuggerHost`
    - Returns `http://${metroHost}:4000/api/v1`
  - **Android Studio Emulator:**
    - Detects `Platform.OS === 'android'` and `(Constants as any).isDevice === false`
    - Returns `http://10.0.2.2:4000/api/v1` (fixed precedence bug)
  - **Physical Android Phone on LAN Wi-Fi:**
    - Checks `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_API_BASE_URL`
    - Defaults to `http://10.114.224.223:4000/api/v1`
- **Trailing Slash:** Correctly omitted (`/api/v1`).
- **Endpoint Prefix:** Routes specify relative paths (`/auth/request-otp`), preventing `/api/v1/api/v1` duplication.

### 2. `apps/dfarm-dairy-admin`
- **Location:** `src/api/client.ts`
- **Resolution Logic:** `apiRequest()`
  - Reads `(import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'`
  - Normalizes endpoints with leading slash guard.
- **Port Assignment:** Vite dev server on `:5174`. Proxy optionally available via dev-server hub (`:3000/dairy-admin`).

### 3. `apps/dfarm-collection-app`
- **Location:** `src/api/client.ts`
- **Resolution Logic:** `import.meta.env.VITE_API_BASE_URL || '/api/v1'`
- **Vite Proxy Config:** In `apps/dfarm-collection-app/vite.config.ts`:
  ```typescript
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  }
  ```
  Proxies relative `/api/v1` requests directly to `localhost:4000`, eliminating cross-origin preflight in development.

### 4. `apps/dfarm-super-admin`
- **Location:** `src/api/client.ts`
- **Resolution Logic:** `getApiRoot()`
  - Reads `import.meta.env.VITE_API_URL` or `VITE_API_BASE_URL`
  - Defaults to `'http://localhost:4000/api/v1'`
  - Trims trailing slashes safely.

---

## 2. Environment Variable Inventory & Redacted Audit

| Variable | Scope | Configured Value | Status |
| :--- | :--- | :--- | :--- |
| `PORT` | Backend | `4000` | Verified |
| `API_BASE_URL` | Backend | `http://localhost:4000/api/v1` | Verified |
| `CORS_ALLOWED_ORIGINS` | Backend | `http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:8081,http://localhost:4000,http://127.0.0.1:3000,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,http://127.0.0.1:8081,http://127.0.0.1:4000,http://10.114.224.223:*` | Verified & Expanded |
| `EXPO_PUBLIC_API_URL` | Customer App | `http://10.114.224.223:4000/api/v1` | Verified (Wi-Fi adapter IP) |
| `VITE_API_BASE_URL` | Vite Apps | `http://localhost:4000/api/v1` | Verified |
| `DOVE_SMS_API_URL` | Backend | `https://mobicomm.dove-sms.com/submitsms.jsp` | Verified live |
