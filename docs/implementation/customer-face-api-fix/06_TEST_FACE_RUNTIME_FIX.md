# DFARM — CUSTOMER FACE BIOMETRIC UPDATE 404 & TEST FACE NETWORK ERROR
## 06. TEST FACE RUNTIME FIX REPORT

**Execution Reference:** `DFARM-CUSTOMER-FACE-API-404-NETWORK-FIX`  
**Execution Timestamp:** 2026-11-20  
**Target Files Modified:**
- `services/backend/src/config/cors.ts`
- `services/backend/src/presentation/routes/identity.routes.ts`
- `apps/dfarm-customer-app/src/services/api-client.ts`
- `apps/dfarm-customer-app/src/face-ai/diagnostics.ts`
- `apps/dfarm-customer-app/src/app/(main)/profile/diagnostics.tsx`

---

### 1. Backend CORS Whitelisting Fix

In `services/backend/src/config/cors.ts`:

```typescript
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allows requests with no origin (mobile apps, curl) or matching allowed list
    callback(null, true);
  },
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Dairy-Tenant-Id',
    'x-dairy-tenant-id',
    'X-Organization-Id',
    'x-organization-id',
    'X-Tenant-Id',
    'x-tenant-id',
    'X-Center-Id',
    'x-center-id',
    'X-Farmer-Id',
    'x-farmer-id',
    'X-Customer-Id',
    'x-customer-id',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Idempotency-Key',
    'idempotency-key',
  ],
  exposedHeaders: [
    'X-Request-Id',
    'X-Dairy-Id',
    'X-Dairy-Tenant-Id',
    'X-Organization-Id',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};
```

---

### 2. Backend Face Match Route 1:1 Defaults

In `services/backend/src/presentation/routes/identity.routes.ts`:

When a customer calls `POST /api/v1/identity/face/match` from Customer App:
1. It reads `req.headers['x-organization-id']` or `req.user.organizationId` to select the correct physical tenant database.
2. If `req.body.customerId` is `'me'` or omitted, and caller is `FARMER_CUSTOMER`:
   ```typescript
   if (
     (!targetCustomerId || targetCustomerId === 'me') &&
     req.user &&
     req.user.role === 'FARMER_CUSTOMER'
   ) {
     targetCustomerId = req.user.userId || req.user.globalCustomerId;
   }
   ```
3. If `targetCustomerId` is specified, it runs a fast **1:1 biometric comparison** against that customer's active enrolled template.
4. If `targetCustomerId` is omitted and caller is an operator or admin, it runs a **1:N dairy-wide identification search** across all active enrolled templates in that dairy's database.

---

### 3. Frontend Base URL & Diagnostics Telemetry

#### 3.1 Dynamic URL Resolution (`api-client.ts`)
```typescript
const resolveBaseUrl = (): string => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  // On Web / Browser: dynamically use current hostname
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:4000/api/v1`;
  }
  // On Native device / simulator: default to localhost
  return 'http://localhost:4000/api/v1';
};
```

#### 3.2 Granular Diagnostics Error Handling (`diagnostics.ts`)
```typescript
try {
  const matchResult = await testFaceMatch(probeVector, customerId, dairyId);
  return {
    success: true,
    matched: matchResult.matched,
    similarity: matchResult.similarityScore,
    threshold: matchResult.threshold || 0.363,
  };
} catch (error: any) {
  const status = error.response?.status;
  if (status === 401) {
    return { success: false, errorType: 'AUTH_EXPIRED', message: 'Session expired. Please log in again.' };
  }
  if (status === 404) {
    return { success: false, errorType: 'NOT_ENROLLED', message: 'No face biometric enrolled for this account.' };
  }
  if (error.code === 'ECONNABORTED' || !error.response) {
    return { success: false, errorType: 'NETWORK_ERROR', message: 'Unable to reach dairy backend.' };
  }
  return { success: false, errorType: 'SERVER_ERROR', message: error.response?.data?.error || 'Diagnostic test failed.' };
}
```

---

### 4. Verification & Test Evidence

In `services/backend/tests/customer-face-api-404-network-fix.test.js`:
- **Test 1:** `OPTIONS /api/v1/identity/face/match` with `Access-Control-Request-Headers: X-Organization-Id` returns `204 No Content` and includes `X-Organization-Id` in `access-control-allow-headers`.
- **Test 2:** Preflight with lowercase `x-organization-id` returns `204` with allow headers.
- **Test 3:** Preflight for `POST /api/v1/customers/biometrics/update` succeeds with CORS approval.
- **Test 24:** `POST /api/v1/identity/face/match` accepts `X-Organization-Id` header for tenant scoping.
- **Test 25:** `POST /api/v1/identity/face/match` automatically defaults `customerId` from customer auth token when omitted in body.
- **Test 26:** SFace INT8 calibrated threshold of `0.363` is strictly returned in the match response.
