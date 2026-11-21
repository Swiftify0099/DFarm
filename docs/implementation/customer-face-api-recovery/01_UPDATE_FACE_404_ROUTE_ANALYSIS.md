# DFARM — POST P0 FACE BIOMETRIC API CONTRACT & MOBILE RUNTIME RECOVERY
## 01. UPDATE FACE 404 ROUTE ANALYSIS & CONTRACT AUDIT

**Execution Reference:** `DFARM-FACE-P0-API-RUNTIME-RECOVERY`  
**Execution Timestamp:** 2026-11-20  
**Target:** `apps/dfarm-customer-app` & `services/backend`  
**Status:** AUDITED & RESOLVED  

---

### 1. Complete Layer-by-Layer Route Comparison

The following table provides the exhaustive end-to-end trace from the user's tactile tap on the mobile screen to physical PostgreSQL row insertion:

| Layer | Actual Value / Source Location | Description & Contract Behavior |
|---|---|---|
| **Update Face Button Handler** | `handleUpdate`<br>`apps/dfarm-customer-app/src/app/(main)/profile/update-face.tsx#L61` | Triggered by `<ClayButton title="Update Face Biometrics" onPress={handleUpdate} />`. Executes 5 live camera captures, calls detection/embedding service, computes L2 normalized average, and invokes profile update mutation. |
| **Frontend API Method** | `updateFace` (`updateFaceMutation.mutateAsync`)<br>`apps/dfarm-customer-app/src/features/profile/useProfile.ts#L21` | Wraps Axios call inside React Query mutation. Reads `customerId` and `dairyId` from secure storage; falls back to `'me'` if `customerId` is null. |
| **Request URL** | `${API_BASE_URL}/customers/${targetId}/biometrics/update`<br>(resolving to `/api/v1/customers/me/biometrics/update` or `/api/v1/customers/:id/biometrics/update`) | Full URL dispatched over HTTP to backend. Defaults `:targetId` to `'me'` for authenticated farmer sessions. |
| **HTTP Method** | `POST` (with `PUT` and `PATCH` supported as aliases) | Idempotent biometric update verb carrying payload in JSON request body. |
| **Backend Registered Route** | `cleanApiRouter.use('/customers', customerRoutes)` (`src/presentation/routes/index.ts#L36`)<br>`router.post('/me/biometrics/update', ...)` (`src/presentation/routes/customers.routes.ts#L755`)<br>`router.post('/:id/biometrics/update', ...)` (`src/presentation/routes/customers.routes.ts#L764`)<br>`router.post('/biometrics/update', ...)` (`src/presentation/routes/customers.routes.ts#L747`) | Explicit unparameterized `/me/biometrics/update` and `/biometrics/update` routes registered with precedence before wildcard `/:id` handlers. |
| **Backend Controller** | `handleBiometricsUpdate`<br>`services/backend/src/presentation/routes/customers.routes.ts#L610` | Extracts `customerId` across parameters, token claims, and body. Verifies caller identity, enforces tenant authorization, assigns RFID card if provided, and triggers persistence use case. |
| **Persistence Use Case** | `UpdateCustomerBiometricsUseCase.execute`<br>`services/backend/src/application/use-cases/customers/BiometricUseCases.ts#L65` | Validates 128-D embedding dimension, resolves model version record, encrypts vector with AES-256-GCM + AAD, and calls tenant repository. |
| **Tenant Repository** | `PostgresCustomerRepository.updateFaceEnrollment`<br>`services/backend/src/infrastructure/repositories/PostgresCustomerRepository.ts#L516` | Acquires tenant database client via `tenantDbManager.getTenantDb(orgId)`. Updates previous active enrollment to `SUPERSEDED`, inserts new active `face_enrollments` record, and touches `customers.updated_at`. |
| **Database Table** | `face_enrollments` table inside physical PostgreSQL tenant schema/database `dfarm_tenant_<code_hash>` | Columns: `id`, `customer_id`, `model_version_id`, `embedding_encrypted`, `embedding_iv`, `embedding_auth_tag`, `quality_score`, `status` (`'ACTIVE'`), `enrolled_at`, `enrolled_by`, `device_id`. |

---

### 2. Precise Root Cause of HTTP 404

The HTTP 404 error was triggered by **three distinct defects** in route matching and customer resolution:

#### Defect 1: Greedy Wildcard Capture in Express Router
In the pre-fix backend, `customers.routes.ts` registered:
```typescript
router.put('/:id/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
router.post('/:id/biometrics/update', optionalAuthenticate, handleBiometricsUpdate);
```
Because Express evaluates route definitions in registration order, whenever a request arrived at `/api/v1/customers/biometrics/update`, Express matched `/:id/biometrics/update` with `req.params.id = 'biometrics'`.  
The controller then called:
```typescript
const customer = await customerRepo.findById("biometrics", orgId);
```
In PostgreSQL, no customer had the UUID or identifier `"biometrics"`. The query returned `0` rows, the controller threw `CustomerNotFoundError("biometrics")`, and the centralized error middleware converted this domain exception into `HTTP 404 Not Found` with `{ success: false, error: "Customer 'biometrics' not found." }`.

#### Defect 2: Missing Route Definition for `/me` Endpoint
When the mobile client used `/api/v1/customers/me/biometrics/update`, the pre-fix router had no explicit `/me/biometrics/update` route. Express routed it to `/:id/biometrics/update` with `req.params.id = 'me'`. Without parameter sanitization, `findById('me')` failed to match any tenant customer record, again throwing `CustomerNotFoundError('me')` -> `HTTP 404`.

#### Defect 3: Global Customer ID vs Local Tenant Customer ID Mismatch
In DFARM's multi-tenant architecture:
- `dfarm_central` stores the global user account (`global_customer_id`).
- `dfarm_tenant_<code_hash>` stores the Dairy-scoped customer record (`id`).

During OTP login (`/auth/verify-otp`), the JWT token payload includes `userId` and `globalCustomerId`. If the mobile client sent the central `globalCustomerId` as the target parameter, the tenant repository query previously searched only `WHERE id = $1`. Because the tenant primary key did not match the global UUID, the lookup returned `null` and threw `CustomerNotFoundError` -> `HTTP 404`.

---

### 3. Separation of Responsibilities: Inference vs Persistence

The audit confirmed that the facial recognition workflow strictly separates **detection/inference** from **persistence**:

```
┌────────────────────────────────────────────────────────┐
│ 1. DETECTION & EMBEDDING API                           │
│ POST /api/v1/identity/face/detect-and-embed           │
│ Input: { imageBase64: string }                         │
│ Output: { faceCount, isAligned, embedding: 128-D }     │
│ State: Stateless, read-only neural inference           │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. BIOMETRIC PERSISTENCE & AUDIT API                   │
│ POST /api/v1/customers/:id/biometrics/update           │
│ Input: { embedding: 128-D, modelVersion, confidence }  │
│ Output: { success: true, isBiometricEnrolled, status } │
│ State: Physical tenant DB mutation, AES-256-GCM        │
└────────────────────────────────────────────────────────┘
```

`detect-and-embed` does not touch customer records or modify database state. Persistence only occurs when the validated 128-D template is explicitly submitted to the `/customers/:id/biometrics/update` endpoint.

---

### 4. Required End-to-End Sequence & Failure Preservation

The implemented and verified execution flow strictly adheres to the required sequence:

```
[Live Front Camera]
        │
        ▼ (5 Real Camera Captures sequentially)
[Capture Frame 1..5 via CameraView]
        │
        ▼
[POST /api/v1/identity/face/detect-and-embed]
        │
        ▼
[YuNet Detection & SFace INT8 Embedding]
        │
        ▼
[Validate 128-D Finite Numbers & Landmark Alignment]
        │
        ▼
[averageAndNormalizeEmbeddings (L2 Unit Centroid)]
        │
        ▼
[POST /api/v1/customers/:id/biometrics/update]
        │
        ▼
[Verify Caller Identity (req.user vs customerId)]
        │
        ▼
[Verify Dairy Membership (tenant DB resolution)]
        │
        ▼
[AES-256-GCM + AAD Encryption with Model UUID]
        │
        ▼
[Set Old Enrollment Status = 'SUPERSEDED' in Tenant DB]
        │
        ▼
[INSERT New Enrollment with Status = 'ACTIVE' in Tenant DB]
        │
        ▼
[Read-back Confirmation from Tenant DB (isBiometricEnrolled: true)]
        │
        ▼
[Mobile UI Displays "Biometric Template Updated!"]
```

#### Failure Invariant:
If any step in the sequence fails (e.g., face misaligned, network timeout, database constraint error, unauthorized caller):
- No `SUPERSEDED` flag is written to the database.
- The customer's prior valid enrollment remains `'ACTIVE'` and untouched.
- The frontend UI displays an error alert and never marks the operation successful prematurely.
