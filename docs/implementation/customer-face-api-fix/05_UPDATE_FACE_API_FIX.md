# DFARM — CUSTOMER FACE BIOMETRIC UPDATE 404 & TEST FACE NETWORK ERROR
## 05. UPDATE FACE API FIX REPORT

**Execution Reference:** `DFARM-CUSTOMER-FACE-API-404-NETWORK-FIX`  
**Execution Timestamp:** 2026-11-20  
**Target Files Modified:**
- `services/backend/src/presentation/routes/customers.routes.ts`
- `apps/dfarm-customer-app/src/features/profile/useProfile.ts`

---

### 1. Backend Route & Controller Implementation

To solve the 404 error and support all existing frontend client invocation patterns, `services/backend/src/presentation/routes/customers.routes.ts` was refactored with the following enhancements:

#### 1.1 Unparameterized & Literal Precedence
Explicit routes were positioned **ahead** of any `/:id` parameterized route handler:

```typescript
// Explicit unparameterized endpoints (prevents :id capturing 'biometrics')
router.post('/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.put('/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.patch('/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.post('/biometrics', optionalAuthenticate, handleBiometricsUpdate);
router.put('/biometrics', optionalAuthenticate, handleBiometricsUpdate);

// Explicit /me alias endpoints
router.post('/me/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.put('/me/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.patch('/me/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.post('/me/biometrics', optionalAuthenticate, handleBiometricsUpdate);

// Parameterized fallback endpoints
router.post('/:id/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.put('/:id/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.patch('/:id/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.post('/:id/biometrics', optionalAuthenticate, handleBiometricsUpdate);
router.put('/:id/biometrics', optionalAuthenticate, handleBiometricsUpdate);
```

#### 1.2 Robust Customer Identity Resolution
Inside `handleBiometricsUpdate`:
```typescript
const rawId = req.params.id;
const isExplicitId = Boolean(rawId && rawId !== 'me' && rawId !== 'null' && rawId !== 'undefined');
let customerId = (Array.isArray(rawId) ? rawId[0] : rawId) || '';

if (!customerId || customerId === 'me' || customerId === 'null' || customerId === 'undefined') {
  customerId =
    (req.body?.customerId as string) ||
    (req.query?.['customerId'] as string) ||
    req.user?.userId ||
    req.user?.globalCustomerId ||
    '';
}
```

#### 1.3 Tenant & Ownership Authorization Gates
1. **Unauthenticated Access:** Disallowed with `401 Unauthorized`.
2. **Cross-Customer Impersonation:**
   If a farmer customer attempts to modify another customer's biometrics by injecting a different `customerId` or route parameter, the request is rejected with `403 Forbidden`:
   ```typescript
   if (
     req.user?.role === 'FARMER_CUSTOMER' &&
     req.user.userId !== customer.id &&
     req.user.userId !== customer.globalCustomerId &&
     (!req.user.globalCustomerId || req.user.globalCustomerId !== customer.globalCustomerId)
   ) {
     res.status(403).json({
       success: false,
       error: 'Cross-customer modification blocked: customer can only update their own biometrics.',
     });
     return;
   }
   ```
3. **Cross-Dairy Modification:**
   If the customer belongs to Dairy A but the request targets Dairy B, the request is rejected with `403 Forbidden`.

---

### 2. Frontend Hook Fix (`useProfile.ts`)

In `apps/dfarm-customer-app/src/features/profile/useProfile.ts`:
```typescript
const updateBiometrics = async (params: {
  embedding: number[];
  modelVersion?: string;
  customerId?: string;
  rfidCardUid?: string;
}) => {
  const targetId = params.customerId || customer?.id || 'me';
  const payload = {
    embedding: params.embedding,
    modelVersion: params.modelVersion || 'sface_int8_2021dec',
    customerId: params.customerId || customer?.id,
    rfidCardUid: params.rfidCardUid,
  };

  // Dispatches to canonical route with fallback body context
  const response = await apiClient.post(`/customers/${targetId}/biometrics/update`, payload);
  return response.data;
};
```

---

### 3. Verification & Test Evidence

In `services/backend/tests/customer-face-api-404-network-fix.test.js`, the following test cases verified this fix:

- **Test 5:** `POST /api/v1/customers/biometrics/update` (unparameterized) returns `200 OK`.
- **Test 6:** `PUT /api/v1/customers/biometrics/update` returns `200 OK`.
- **Test 7:** `POST /api/v1/customers/me/biometrics/update` returns `200 OK`.
- **Test 8:** `PUT /api/v1/customers/me/biometrics/update` returns `200 OK`.
- **Test 9:** `POST /api/v1/customers/:id/biometrics/update` with canonical ID returns `200 OK`.
- **Test 10:** `POST /api/v1/customers/biometrics` (short alias) returns `200 OK`.
- **Test 11:** `POST /api/v1/customers/me/biometrics` returns `200 OK`.
- **Test 12:** `POST /api/v1/customers/:id/biometrics` returns `200 OK`.
- **Test 13:** Missing auth token on unparameterized route returns `401 Unauthorized`.
- **Test 14:** Non-existent customer ID returns `404 Not Found`.
- **Test 17:** Cross-dairy update rejected with `403 Forbidden`.
- **Test 18:** Farmer attempting to update another farmer's biometrics rejected with `403 Forbidden`.
- **Test 21:** Invalid vector length rejected with `400 Bad Request`.
