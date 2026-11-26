# DFarm — RESTART-02 Authentication, Authorization, OTP, JWT & Secrets Remediation Report

**Phase:** `RESTART-02`  
**Date:** `2026-11-26`  
**Repository / Branch:** `Swiftify0099/DFarm` — `fix/cloudflare-pages-production-deploy`  
**Baseline HEAD:** `6fddf03cb35c343f38a7f4f1a46ac0cc9632c0c3`  
**Master Register:** [DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md)  
**Overall Phase Status:** **`PARTIAL`** *(All local codebase auth, RBAC, OTP, JWT, AES-256-GCM, and secret-validation fixes are implemented, built, and verified against `pg-mem` offline test suites; external secret rotations, live Render key provisioning, Git history force-push under `DF-003`/`DF-013`, and physical PostgreSQL integration execution under `DF-030` remain pending infrastructure/operator actions.)*

---

## 1. Phase 0 — Safety & Baseline Preservation

Verified post-remediation without destructive Git actions (`reset`, `clean`, `rebase`, `stash`, `checkout`, or `force-push` were never run):
- **Active branch & HEAD:** `fix/cloudflare-pages-production-deploy` at `6fddf03cb35c343f38a7f4f1a46ac0cc9632c0c3`
- **Tracked `.temp/` files (`git ls-files .temp`):** `0`
- **Local ignored `.temp/` files preserved:** `1,829` (`.temp/chrome-cdp/` untouched)
- **Modified/untracked working tree entries (`git status --short`):** `192`
- **Sibling worktree:** Untouched per safety rules (`DF-031`)
- **Prior `FIX-01` / `FIX-01.1` hardening:** Preserved and regression-tested (`fix01-production-auth-otp-security.test.js` `10/10` PASS)

---

## 2. Remediations Implemented by Issue ID

### `DF-001` — Passwordless Staff Login Bypass (`FIXED`)
- Unmounted legacy `/api/users/auth` and `/api/auth` duplicate auth routers in `services/backend/src/app.ts`.
- Removed `POST /login` from `services/backend/src/modules/auth/auth.routes.ts` so `/api/v1/auth/login`, `/api/users/auth/login`, and `/api/auth/login` all fail closed (`404`).
- Disabled `AuthService.loginStaff` in `services/backend/src/modules/auth/auth.service.ts` to fail closed with `401 AUTH_METHOD_DISABLED`.
- Verified staff/admin authentication continues exclusively through OTP-backed and verified flows (`/api/v1/auth/admin/otp/*`, `/api/v1/auth/operator/otp/*`, and `/api/v1/auth/verify-otp`).

### `DF-002` & `DF-014` — Unauthenticated Dairy Lifecycle & Enumeration (`FIXED`)
- Removed `optionalAuthenticate` from privileged dairy lifecycle routes in `services/backend/src/presentation/routes/dairies.routes.ts`.
- Enforced `authenticate` + `authorizeRoles('SUPER_ADMIN')` / `authorizeRoles('SUPER_ADMIN', 'PLATFORM_OPERATOR')` across directory, tenant-database listing, dairy creation, provisioning retry, suspend/reactivate, invitation resend, and deprovision routes.
- Enforced cross-tenant ownership checks on `GET /api/v1/dairies/:id` and `PATCH /api/v1/dairies/:id/location` (`403` when non-`SUPER_ADMIN` targets another dairy).
- Guarded purge endpoints (`DELETE /dairies/admin/by-phone/:phone`, `/purge/phone/:phone`) so `NODE_ENV !== 'test'` returns `403` even unauthenticated, while test mode still requires `authenticate` + `SUPER_ADMIN`.
- Hardened public onboarding (`invitations/validate`, `invitations/otp/request`, `invitations/activate`) by removing `dairyCode` lookup (requiring SHA-256 `token_hash` only, rejecting missing tokens with `400 MISSING_TOKEN`), removing the no-op `doveOtpService.registerAuthorizedAdminPhone(...)` call, and failing closed in production on DB transaction errors.

### `DF-003`, `DF-008`, `DF-013` — AES-256-GCM Key Fallback, Secret Hygiene & Git History Prep (`CODE HARDENED / PREP COMPLETE — EXTERNAL PENDING`)
- **`DF-008` (AES-256-GCM):** Removed hardcoded `'0123456789abcdef...'` key fallback from `Aes256GcmBiometricEncryptor.ts` and `services/backend/src/biometric/encryption.ts`; enforced strict 64-hex / 32-byte key length and entropy validation (`validateKeyEntropyAndByteLength`); added `DATA_ENCRYPTION_PREVIOUS_KEYS_HEX` decryption-only key rotation support; preserved `'key-sface128-v1'` `keyReference`; removed `JWT_SECRET` / placeholder key fallbacks in `CredentialEncryption.ts` and `DoveOtpService.ts`.
- **`DF-013` (Secrets & Env Validation):** Registered `JWT_ISSUER`, `JWT_AUDIENCE`, `DATA_ENCRYPTION_KEY_HEX` (`sync: false` in `render.yaml`), and `DATA_ENCRYPTION_PREVIOUS_KEYS_HEX` in `services/backend/src/config/env.ts`; added weak/default literals to `KNOWN_INSECURE_SECRETS`; enforced production fail-closed checks for `DATA_ENCRYPTION_KEY_HEX`, `DOVE_SMS_AUTHKEY`, and WhatsApp secrets (`WHATSAPP_ENABLED=true`) across `env.ts`, `DoveSmsService.ts`, and `whatsapp-webhook.handler.ts`.
- **Client SMS Key Removal (`DF-013`):** Removed direct Dove SMS dispatch and hardcoded `'ba9dcdcdfcXX'` fallback from `apps/dfarm-customer-app/src/services/smsService.ts`, `src/app/(auth)/login.tsx`, and `.env.example`.
- **`DF-003` (Git History & Human Cutover Checklist):** Documented exposed commits (`e638850`, `5cca96c`, `d3d2189`, `c3b1a24`, `110b899`) vs `dfarm-audit-mirror.git` (`c84ab21`) drift and produced [DFARM_RESTART_02_SECRET_ROTATION_CHECKLIST.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_02_SECRET_ROTATION_CHECKLIST.md) for human execution of provider key rotations, Render secret updates, and owner-approved history rewrite.

### `DF-004`, `DF-005`, `DF-006`, `DF-010`, `DF-012` (Auth/RBAC), `DF-015` (Bank IDOR) — Middleware & Route Protection (`AUTH/RBAC FIXED`)
- Replaced `optionalAuthenticate`, missing authentication, fallback default UUIDs (`00000000-...`), and broken no-op middleware invocations (`authorizePermission(...)(req, res, () => {})`) across:
  - `customers.routes.ts` (all customer directory/approval/lifecycle endpoints, `GET /:id/status`, 18 biometric endpoints, `PUT /:id/bank-details` tenant IDOR fix)
  - `identity.routes.ts` (all 6 face endpoints, 3 no-op callbacks, tenant subquery on `re-enroll`/`revoke`, removed `'00000000-...001'`)
  - `collections.routes.ts` (all session/transaction/quality/history endpoints, `organizationId` forwarding to `closeSessionUseCase`, duplicate `GET /transactions/recent` removal, fallback UUID removal)
  - `ledger.routes.ts`, `payments.routes.ts`, `bills.routes.ts`, `feed.routes.ts`, `rate-charts.routes.ts` (`DF-010`, including 2 rate-chart no-op callbacks)
  - `devices.routes.ts` (including previously unauthenticated `/telemetry`), `rfid.routes.ts` (4 no-op callbacks), `staff.routes.ts`, `reports.routes.ts`, `audit.routes.ts`, `notifications.routes.ts`, `dashboard.routes.ts`, `tenant-database.routes.ts`, `super-admin.routes.ts`, and `sync.routes.ts` (`authorizePermission` added)
- Hardened `presentation/middleware/authorize.ts` to normalize roles uppercase and fail closed on empty role/permission lists.
- See full endpoint inventory in [DFARM_RESTART_02_ENDPOINT_AUTHORIZATION_MATRIX.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_02_ENDPOINT_AUTHORIZATION_MATRIX.md).

### `DF-009` — JWT Database Failure Must Fail Closed (`FIXED`)
- Removed permissive `decodedToken` fallback from `services/backend/src/middleware/authenticate.ts`.
- Middleware rejects `tokenType === 'refresh'` and revoked tokens (`401`), queries authoritative Postgres `pool` (`users`, `organizations`, `user_center_assignments`) and `tenantDbManager.getTenantDb` (`customers`), returns `403` for suspended/deleted/unmapped accounts, and fails closed with `503 AUTH_DB_UNAVAILABLE` when the database is unavailable.

### `DF-011` — JWT Token Typing, Refresh Verification & Revocation (`FIXED`)
- Created `services/backend/src/infrastructure/security/TokenRevocationService.ts` and wired `application/ports/index.ts`, `HmacJwtTokenService.ts`, `jwt.ts`, and `presentation/middleware/authenticate.ts` with `tokenType` (`'access' | 'refresh'`), `jti`, `exp`, strict `HS256` alg/typ checks, entropy checks, and revocation validation.
- Updated `CustomerAuthUseCases.ts`, `AdminAuthUseCases.ts`, `OperatorAuthUseCases.ts`, `SelectDairyMembershipUseCase.ts`, and `presentation/routes/auth.routes.ts`:
  - `RefreshTokenUseCase.execute` is now async, rejects non-`refresh` tokens and `GUEST_FARMER`, validates revocation and live DB user/customer/org active status (`503`/`401`/`403`), and rotates/revokes the consumed refresh token.
  - `POST /api/v1/auth/logout` revokes submitted access and refresh tokens via `TokenRevocationService`.

---

## 3. Companion RESTART-02 Deliverables & Open Downstream Scope

| Deliverable | Purpose |
| :--- | :--- |
| [DFARM_RESTART_02_ENDPOINT_AUTHORIZATION_MATRIX.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_02_ENDPOINT_AUTHORIZATION_MATRIX.md) | Complete HTTP endpoint auth, factor, middleware, and tenant-isolation matrix |
| [DFARM_RESTART_02_SECRET_ROTATION_CHECKLIST.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_02_SECRET_ROTATION_CHECKLIST.md) | AES-256-GCM migration procedure, provider secret rotation list, and `DF-003` history purge steps |
| [DFARM_RESTART_02_TEST_RESULTS.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_02_TEST_RESULTS.md) | Exact post-edit build & test counts plus offline/external scope boundaries |
| [DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md) | Updated `DF-001`..`DF-015` statuses preserving `DF-016`..`DF-033` for `RESTART-03`..`RESTART-12` |

Non-auth/future-phase defects intentionally preserved in the Master Register: `DF-003`/`DF-013` external rotations & remote purge, `DF-007` (`sync.routes.ts` route-shadow & `organizationId`), `DF-015` (`customers.routes.ts:724-830` non-prod seeding), `DF-016`..`DF-033`.
