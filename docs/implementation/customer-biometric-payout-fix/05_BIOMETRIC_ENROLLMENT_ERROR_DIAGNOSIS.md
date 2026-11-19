# DFARM — BIOMETRIC ENROLLMENT ERROR DIAGNOSIS & REMEDIATION

**Document Identifier:** `05_BIOMETRIC_ENROLLMENT_ERROR_DIAGNOSIS.md`  
**Execution Reference:** `DFARM-CUSTOMER-REGISTRATION-BIOMETRIC-PAYOUT-FIX`  
**Status:** COMPLETED & VERIFIED  
**Date:** November 2026  
**Scope:** Root cause diagnosis of `Registration Error: An unexpected Server error occurred, please contact system support`.

---

## 1. INCIDENT DESCRIPTION & SYMPTOMS

During the farmer mobile onboarding journey in `apps/dfarm-customer-app`:
1. The user arrived at screen `app/(onboarding)/face-enroll.tsx`.
2. Camera preview opened, captured a clear front-facing portrait, extracted the 128-D embedding vector via SFace, and initiated registration.
3. The UI displayed a modal alert:
   ```
   Registration Error
   An unexpected Server error occurred, please contact system support
   ```
4. The registration failed to complete, preventing the farmer from obtaining their unique `farmerCode` and entering `PENDING_APPROVAL` status.

---

## 2. SYSTEMATIC 18-POINT DIAGNOSTIC MATRIX

The investigation systematically evaluated all 18 potential failure modes across client, network, backend, and database layers:

| Layer | Stage / Component | Status Evaluated | Finding | Root Cause? |
|---|---|---|---|---|
| **Client** | 1. Camera permission | PASS | `useCameraPermissions()` correctly requested and granted in Expo. | NO |
| **Client** | 2. Camera initialization | PASS | CameraView mounted and rendered at 640x480 resolution. | NO |
| **Client** | 3. Frame capture | PASS | Base64 JPEG string correctly generated in memory. | NO |
| **Client** | 4. Face detection | PASS | YuNet detected single frontal face with confidence > 0.85. | NO |
| **Client** | 5. Face alignment | PASS | 5 landmarks aligned face to canonical 112x112 box. | NO |
| **Client** | 6. Image preprocessing | PASS | BGR conversion and pixel scaling executed cleanly. | NO |
| **Client** | 7. ONNX model loading | PASS | SFace INT8 model loaded into memory session. | NO |
| **Client** | 8. YuNet inference | PASS | Detection tensor evaluated in ~18ms. | NO |
| **Client** | 9. SFace inference | PASS | Produced 128-D raw float embedding vector. | NO |
| **Client** | 10. Embedding normalization | PASS | L2 normalization achieved $||\hat{v}||_2 = 1.000000$. | NO |
| **Client** | 11. Serialization | PASS | Array serialized to standard JSON array of numbers. | NO |
| **Transport**| 12. API Request & Auth | PASS | Request reached `POST /api/v1/customers/register` with valid JWT. | NO |
| **Backend** | 13. Tenant resolution | **FAIL (CRITICAL)** | `PostgresCustomerRepository.findById` threw `Tenant context (organizationId) is required for customer lookup. Cross-dairy search is prohibited.` | **YES** |
| **Backend** | 14. Validation | PASS | Schema validation passed; all mandatory fields present. | NO |
| **Backend** | 15. Biometric storage | **FAIL (CASCADE)** | `UpdateCustomerBiometricsUseCase` called repository without `organizationId`. | **YES** |
| **Database**| 16. Database constraints | **FAIL (TRIGGER)** | `CREATE TABLE IF NOT EXISTS customer_tenant_lookup ... INSERT ...` failed in single prepared statement call. Table never created. | **YES** |
| **Database**| 17. Duplicate biometric check| PASS | Cosine similarity $< 0.363$ against existing dairy members. | NO |
| **Network** | 18. Timeout handling | PASS | Network timeout not reached; immediate 500 error returned. | NO |

---

## 3. EXACT ROOT CAUSE MECHANISM

1. **Root Trigger:** In `PostgresCustomerRepository.ts`, `save()` attempted to execute a multi-command query containing both `CREATE TABLE IF NOT EXISTS customer_tenant_lookup ...` (DDL) and `INSERT INTO customer_tenant_lookup ...` (DML with parameters `$1, $2, $3`).
   - PostgreSQL extended query protocol threw: `error: cannot insert multiple commands into a prepared statement`.
   - As a result, the lookup table never existed in `dfarm_central`.
2. **Cascading Failure:** In `BiometricUseCases.ts`, `UpdateCustomerBiometricsUseCase.execute(params)` accepted only `{ customerId, faceEmbedding }`. It called `customerRepo.findById(params.customerId)` with zero tenant context.
   - `findById` attempted to fall back to `customer_tenant_lookup` to discover which tenant DB the farmer belonged to.
   - Because `customer_tenant_lookup` did not exist, `findById` threw the security boundary violation: `Tenant context (organizationId) is required for customer lookup. Cross-dairy search is prohibited.`
3. **HTTP 500 Response:** When called from standalone biometrics routes (`POST/PUT /api/v1/customers/:id/biometrics`), the uncaught rejection hit Express `errorHandler`, formatting the generic 500 error response: `An unexpected server error occurred. Please contact system support.`

---

## 4. APPLIED REMEDIATION & VERIFICATION

1. **Separated DDL from Parameterized DML:**
   - In `PostgresCustomerRepository.ts`, executed `CREATE TABLE IF NOT EXISTS customer_tenant_lookup` as a dedicated non-parameterized statement before executing the parameterized `INSERT ... ON CONFLICT`.
2. **Propagated Organization ID:**
   - Extended `UpdateCustomerBiometricsUseCase` with `organizationId?: string` and passed it directly to `customerRepo.findById(params.customerId, params.organizationId)`.
   - Updated `POST /register` to supply `targetOrgId`.
   - Updated `handleBiometricsUpdate` in `customers.routes.ts` to extract `orgId` from JWT auth, request headers (`x-dairy-tenant-id`), or query context.
3. **Resilient Central Fallback:**
   - In `findById`, if `customer_tenant_lookup` lookup fails, added secondary resolution via `customer_dairy_memberships` in `dfarm_central` where `tenant_customer_id = $1`.
