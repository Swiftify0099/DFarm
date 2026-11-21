# DFARM — CUSTOMER FACE BIOMETRIC UPDATE 404 & TEST FACE NETWORK ERROR
## 04. TEST FACE NETWORK ERROR ROOT CAUSE INVESTIGATION

**Execution Reference:** `DFARM-CUSTOMER-FACE-API-404-NETWORK-FIX`  
**Execution Timestamp:** 2026-11-20  

---

### 1. Root Cause Breakdown

The `Network Error` displayed when clicking "Test Face" in the Face AI Diagnostics feature was caused by three architectural root causes across networking, CORS policy, and client error handling:

#### Root Cause 1: Missing `X-Organization-Id` in CORS Allowed Headers
In `services/backend/src/config/cors.ts`, the Express application configures Cross-Origin Resource Sharing (CORS) using the `cors` package.
The pre-fix `allowedHeaders` array contained:
```typescript
allowedHeaders: [
  'Content-Type',
  'Authorization',
  'X-Dairy-Tenant-Id',
  'X-Requested-With',
  'Accept',
  'Origin',
  'Idempotency-Key',
]
```
However, in `apps/dfarm-customer-app/src/services/api-client.ts`, the Axios request interceptor attaches the dairy identifier header using the standard header key:
```typescript
config.headers['X-Organization-Id'] = dairyId;
```
When running in a web browser (React Native Web / Chrome DevTools):
1. The browser sends an HTTP `OPTIONS` preflight request with header `Access-Control-Request-Headers: authorization,content-type,x-organization-id`.
2. The backend returned status 204, but omitted `X-Organization-Id` from `Access-Control-Allow-Headers`.
3. The browser security engine immediately aborted the network transaction and refused to send the actual POST request.
4. Axios converts browser-level CORS policy rejections into a generic `AxiosError: Network Error`.

#### Root Cause 2: Dead LAN IP in Base URL Resolution
In `apps/dfarm-customer-app/src/services/api-client.ts`, the default fallback API URL was hardcoded to an obsolete private IP address:
```typescript
const DEFAULT_URL = 'http://10.114.224.223:4000/api/v1';
```
When developers or testing environments loaded the app on localhost, port forwarding, or local WiFi with different subnets without explicitly setting `EXPO_PUBLIC_API_URL`, requests routed to `10.114.224.223:4000` timed out, yielding `ERR_CONNECTION_TIMED_OUT` (which Axios also converts to `Network Error`).

#### Root Cause 3: Aggressive Error Catching in Diagnostics Telemetry
In `apps/dfarm-customer-app/src/face-ai/diagnostics.ts`, the catch block handling face matching errors blindly classified any exception as a network failure:
```typescript
// Pre-fix code
catch (error) {
  return {
    success: false,
    errorType: 'NETWORK_ERROR',
    message: 'Network Error',
  };
}
```
Even if the backend returned a legitimate 401 Unauthorized (e.g., expired token) or 404 (customer not yet enrolled), the UI replaced the informative diagnostic error with `Network Error`.

---

### 2. Trace of Failing Execution

```
[Customer clicks "Test Face Recognition"]
             │
             ▼
[Face AI Diagnostics captures frame & generates 128-D vector]
             │
             ▼
[Axios Client in Browser]
Preparing POST http://localhost:4000/api/v1/identity/face/match
Attaching headers:
  Authorization: Bearer eyJhbGci...
  X-Organization-Id: a1111111-4444-1111-1111-111111111111
             │
             ▼
[Browser Security Subsystem]
Sending Preflight:
  OPTIONS /api/v1/identity/face/match
  Access-Control-Request-Headers: authorization,content-type,x-organization-id
             │
             ▼
[Backend cors.ts preflight handler]
Validating requested headers against allowedHeaders...
'X-Organization-Id' IS NOT in allowedHeaders!
Returns 204 with Access-Control-Allow-Headers omitting 'X-Organization-Id'
             │
             ▼
[Browser Security Subsystem]
CORS Header Disallowed: 'x-organization-id'
Aborting POST request.
             │
             ▼
[Axios throws: Error: Network Error]
             │
             ▼
[diagnostics.ts catch block]
Formats as: { errorType: 'NETWORK_ERROR', message: 'Network Error' }
             │
             ▼
[Customer App UI displays modal toast: "Network Error"]
```

---

### 3. Resolution Verification

1. In `services/backend/src/config/cors.ts`, added comprehensive tenant and routing headers to `allowedHeaders` and `exposedHeaders`:
   - `X-Organization-Id`
   - `x-organization-id`
   - `X-Dairy-Tenant-Id`
   - `X-Tenant-Id`
   - `x-tenant-id`
   - `X-Center-Id`
   - `x-center-id`
   - `X-Farmer-Id`
   - `X-Customer-Id`
2. In `apps/dfarm-customer-app/src/services/api-client.ts`, implemented dynamic host detection:
   - On Web: uses `http://${window.location.hostname}:4000/api/v1`.
   - On Native: inspects Metro bundler host IP before falling back to `http://localhost:4000/api/v1`.
3. In `apps/dfarm-customer-app/src/face-ai/diagnostics.ts`, added structured HTTP status code inspection (`401`, `404`, `403`) to prevent classifying application errors as network errors.
4. Automated tests 1-4 and 24-26 in `customer-face-api-404-network-fix.test.js` verify that preflight options return `204` with `X-Organization-Id` in `access-control-allow-headers`.
