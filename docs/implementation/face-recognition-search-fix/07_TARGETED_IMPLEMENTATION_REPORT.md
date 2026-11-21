# 07. TARGETED IMPLEMENTATION REPORT

**Reference:** DFARM-FACE-RECOGNITION-AND-CUSTOMER-SEARCH-FIX  
**Target Applications:** `apps/dfarm-customer-app`, `apps/dfarm-collection-app`, `services/backend`  
**Execution Date:** 2026-11-19  
**Status:** COMPLETED & VERIFIED

---

## 1. Executive Summary

Four critical operational defects were audited, diagnosed to their root causes, and systematically resolved without breaking existing functionality:
1. **Issue A (Customer Biometric Update 500 Error):** Resolved tenant database routing, missing `organizationId` propagation, foreign key constraint on `enrolled_by`, and audit lifecycle supersession in `services/backend` and `apps/dfarm-customer-app`.
2. **Issue B (Customer Test Face Diagnostics):** Connected live OpenCV YuNet sensor telemetry, SFace INT8 128-D embedding extraction, and real backend read-only match verification against enrolled dairy templates.
3. **Issue C (Collection Face Unrecognized):** Enabled tenant-scoped biometric template synchronization (`GET /identity/face/templates`), cross-app SFace INT8 parameter alignment (128-D Float32, L2 normalization, threshold 0.363), and fallback customer identity projection in `apps/dfarm-collection-app`.
4. **Issue D (Customer Search Enter Key):** Attached explicit `organizationId` context to `/customers?search=...` queries, added instant Enter key event interception (`onKeyDown`), and ensured multi-index lookup (`customersMap`) across farmer code, mobile number, and patron name.

---

## 2. File-by-File Changes & Line-Level Summary

### A. Backend Services (`services/backend`)

#### 1. [application/ports/index.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/ports/index.ts)
- **Change:** Updated `ICustomerRepository.updateFaceEnrollment` signature to accept `organizationId?: string`.
- **Purpose:** Enables callers to explicitly propagate tenant context to avoid fallbacks when looking up customer database connections.

#### 2. [application/use-cases/customers/BiometricUseCases.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/customers/BiometricUseCases.ts)
- **Change:** In `UpdateCustomerBiometricsUseCase.execute`, passed `customer.organizationId` down to `customerRepo.updateFaceEnrollment(..., customer.organizationId)`.
- **Purpose:** Guarantees tenant database manager resolves the customer's specific dairy database.

#### 3. [infrastructure/repositories/PostgresCustomerRepository.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresCustomerRepository.ts)
- **Changes:**
  - In `updateFaceEnrollment`: Updated tenant DB resolution order (`orgId` parameter $\rightarrow$ `customer_dairy_memberships` in control DB $\rightarrow$ scan all active tenant DBs).
  - Replaced non-existent relation query `customer_tenant_lookup` with authoritative `customer_dairy_memberships`.
  - Added audit preservation by updating previous active templates to `status = 'SUPERSEDED'`.
  - Resolved `enrolled_by` foreign key constraint violation (`face_enrollments_enrolled_by_fk`) by checking `users` table and automatically provisioning a system kiosk operator record if `users` is empty.
  - Touched `customers.updated_at` to trigger real-time polling synchronization across client apps.

#### 4. [presentation/routes/customers.routes.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/customers.routes.ts)
- **Changes:**
  - In `handleBiometricsUpdate`: Handled `customerId === 'me'`, `null`, or undefined by falling back to authenticated `req.user?.userId`.
  - Extracted `organizationId` from route query (`req.query['organizationId']`), body (`req.body.organizationId`), headers (`x-dairy-tenant-id`, `x-dairy-id`), and token claims.
  - Fixed TypeScript property access from `updatedCustomer?.faceTemplateEnrolled` to `updatedCustomer?.isBiometricEnrolled`.
  - Returned comprehensive `biometricStatus` payload (`isEnrolled: true, version, enrolledAt`).

#### 5. [presentation/routes/identity.routes.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/identity.routes.ts)
- **Changes:**
  - In `GET /face/templates`: Inspected `req.headers['x-dairy-tenant-id']` and `req.headers['x-dairy-id']` alongside query and token. Decrypted 128-D Float32 vectors using AES-256-GCM.
  - In `POST /face/match`: Enhanced response format to return both `isMatch: true` and `matched: true`, along with `farmerId`, `farmerCode`, and `farmerName` for universal client compatibility.

---

### B. Customer App (`apps/dfarm-customer-app`)

#### 1. [services/secure-storage.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-customer-app/src/services/secure-storage.ts)
- **Changes:**
  - Added safe fallback to `window.localStorage` when running on Expo Web (`Platform.OS === 'web'`).
  - Implemented `safeGetItem`, `safeSetItem`, and `safeDeleteItem` so sessions, `customerId`, and `dairyId` persist reliably across browser reloads.

#### 2. [services/api-client.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-customer-app/src/services/api-client.ts)
- **Changes:**
  - In Axios request interceptor, injected `X-Dairy-Id`, `X-Dairy-Tenant-Id`, and `X-Organization-Id` headers using `secureStorage.getDairyId()`.

#### 3. [features/profile/useProfile.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-customer-app/src/features/profile/useProfile.ts)
- **Changes:**
  - In `updateFaceMutation`, safely resolved `customerId || 'me'` and propagated `organizationId` in both body and query parameters.

#### 4. [types/face.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-customer-app/src/types/face.ts)
- **Changes:**
  - Extended `FaceDiagnosticsReport` to include `matchStatus` (`MATCH_VERIFIED`, `MATCH_FAILED`, `NOT_ENROLLED`, `SKIPPED`, `BACKEND_ERROR`), `matchScore`, and `matchedFarmerName`.

#### 5. [face-ai/diagnostics.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-customer-app/src/face-ai/diagnostics.ts)
- **Changes:**
  - Accepted `RunDiagnosticsOptions` (`cameraPermissionGranted`, `customerId`, `dairyId`, `verifyEnrolledMatch`).
  - Added real read-only probe verification against `/api/v1/identity/face/match`.
  - Returned human-readable Marathi and English status messages based on genuine match outcome.

#### 6. [app/(main)/profile/diagnostics.tsx](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-customer-app/src/app/(main)/profile/diagnostics.tsx)
- **Changes:**
  - Connected `permission?.granted` to `runFaceDiagnostics`.
  - Rendered "Template Match Verification" telemetry badge and status message card.

---

### C. Collection App (`apps/dfarm-collection-app`)

#### 1. [api/client.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-collection-app/src/api/client.ts)
- **Changes:**
  - In `apiRequest`, injected `X-Dairy-Tenant-Id` and `X-Organization-Id` alongside `X-Dairy-Id`.
  - In `customersApi.list`, added `organizationId?: string` parameter and automatically appended `organizationId=${dairyId}` to query string.
  - In `identityApi.getFaceTemplates`, appended `?organizationId=${dairyId}`.
  - In `identityApi.matchFace`, passed `organizationId` and constructed synthetic fallback `CustomerIdentity` if patron record was missing from directory.

#### 2. [context/HardwareContext.tsx](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-collection-app/src/context/HardwareContext.tsx)
- **Changes:**
  - In `customersMap`, indexed `customerCode`, `farmerCode`, `mobileNumber`, and lowercase `fullName` for instant $O(1)$ search resolution.
  - In `refreshCustomersAndTemplates`, passed `dairyId` to both `customersApi.list` and `identityApi.getFaceTemplates`.

#### 3. [face-ai/matcher.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-collection-app/src/face-ai/matcher.ts)
- **Changes:**
  - Made tenant ID comparison case-insensitive.
  - If `customersMap.get(bestTemplate.customerId)` is undefined, constructed a valid `CustomerIdentity` from the enrolled template's verified `farmerCode` and `fullName`.

#### 4. [components/workspace/CustomerIdentityPanel.tsx](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-collection-app/src/components/workspace/CustomerIdentityPanel.tsx)
- **Changes:**
  - Added explicit `onKeyDown` handler to the farmer code/mobile input:
    ```tsx
    onKeyDown={(e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleFarmerLookup();
      }
    }}
    ```
  - Passed `organizationId: dairyId || undefined` to `customersApi.list({ search: query, organizationId })`.
  - Preserved single-match auto-select, multiple-match selection pills, and no-match error banner.
