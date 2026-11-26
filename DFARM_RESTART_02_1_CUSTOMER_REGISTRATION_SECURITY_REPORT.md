# DFarm — RESTART-02.1 Customer Registration Security Report

**Phase:** `RESTART-02.1` (Phase 4 — `DF-004`, `DF-015`)  
**Date:** `2026-11-26`  
**Route Audited:** `POST /api/v1/customers/register` in [customers.routes.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/customers.routes.ts) & [CustomerDirectoryUseCases.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/customers/CustomerDirectoryUseCases.ts)

---

## 1. Old vs. New Behavior

| Security Surface | Old Behavior (`c67dbb94`) | Hardened Behavior (`RESTART-02.1`) |
| :--- | :--- | :--- |
| **Caller Identity Proof (4A)** | Allowed completely unauthenticated submissions (`!req.user`) with only `mobileNumber`, enabling fake pending registrations, overwrites of pending records, and biometric spoofing by phone number alone. | Requires verified proof: **(a)** verified `CUSTOMER` token (`GUEST_FARMER` backed by `global_customer_identities.phone_verified_at` or `FARMER_CUSTOMER` whose normalized phone matches submitted phone, rejecting mismatches `403 PHONE_MISMATCH`), **(b)** authorized `STAFF` (`customers:update`/`approve`/`SUPER_ADMIN`, cross-dairy blocked `403`), or **(c)** inline single-use `body.otp` verified via `doveOtpService.verifyOtp(..., 'CUSTOMER_AUTH')`. Unverified callers fail `401 REGISTRATION_PROOF_REQUIRED`. |
| **Organization Validation (4B)** | Checked only `tenantDbManager.getTenantMapping()` `FAILED` status; did not verify `organizations` existence or active status. | Validates UUID format (`400 INVALID_ORGANIZATION_ID`), verifies organization exists in DB (`400 INVALID_ORGANIZATION`), and rejects suspended/inactive organizations (`403 ORGANIZATION_INACTIVE`, `503 ORGANIZATION_DB_UNAVAILABLE` on DB error). |
| **Center Validation & Fallback Removal (4C)** | Accepted arbitrary unverified `body.centerId`; when omitted, fabricated a dummy `'C-01'` row (`INSERT INTO dairy_centers ...`) or fell back to hardcoded `'00000000-0000-0000-0000-000000000002'` on catch. | When `centerId` is provided: validates UUID (`400`), confirms existence (`400 INVALID_CENTER`), enforces `organization_id === targetOrgId` (`403 CROSS_TENANT_CENTER`), and enforces `ACTIVE` status (`400 INACTIVE_CENTER`). When omitted: queries active default center from DB (`503` on DB error, `400 NO_ACTIVE_CENTER` if empty — zero dummy creation or hardcoded UUID fallback). |
| **Biometric Enrollment (4D)** | Accepted `body.faceTemplate.embedding` without verifying `biometricConsent === true`, embedding dimensionality/norm/confidence, or propagation on enrollment error (`console.error` swallowed failure). | Rejects missing consent (`400 BIOMETRIC_CONSENT_REQUIRED`), validates finite 128-dim vector with non-zero norm (`400 INVALID_BIOMETRIC_PAYLOAD`) & `confidence >= 0.5` (`400 LOW_BIOMETRIC_QUALITY`), executes encryption only after registration succeeds, never logs embedding vectors, and fails cleanly instead of masking failed biometric storage. |
| **Abuse Prevention (4E)** | No route-specific rate limiter. | Attached `registrationLimiter` (`express-rate-limit`: 15/min/IP in non-test mode, 500/min in test mode); preserves `PENDING_APPROVAL` initial status (never issues active customer privileges before Dairy Admin approval) and avoids exposing cross-dairy membership state on unregistered errors. |

---

## 2. Preserved Workflows & Remaining Future Debt (`DF-017`)

- **Customer App Self-Registration Preserved:** The legitimate Customer App onboarding sequence (`/auth/request-otp` -> `/auth/verify-otp` -> `GUEST_FARMER` token -> `POST /customers/register` with `Authorization: Bearer <token>`) and retry on `PENDING_APPROVAL` continue operating identically.
- **`DF-017` Tenant Center Lookup (`RESTART-03`):** Central `db` lookup with fallback to `tenantDb` (only when mapped) was preserved cleanly until `DF-017` unifies tenant center provisioning in `RESTART-03`.
