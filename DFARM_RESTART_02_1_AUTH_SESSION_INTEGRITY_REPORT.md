# DFarm — RESTART-02.1 Authentication & Session Integrity Report

**Phase:** `RESTART-02.1`  
**Date:** `2026-11-26`  
**Repository / Branch:** `Swiftify0099/DFarm` — `fix/cloudflare-pages-production-deploy`  
**Local HEAD / Verified Public Remote HEAD:** `c67dbb94694a67882b0cf92a3d8e6c41b049de2d` *(identical pre-edit baseline; local `RESTART-02.1` changes remain uncommitted per non-destructive rules)*  
**Tracked `.temp/`:** `0` · **Local Ignored `.temp/`:** `1,829` files preserved  
**Master Register:** [DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md)  
**Final Classification:** **`PARTIAL — SPECIFIC FIXES OR INTEGRATION GATES REMAIN`** *(All local codebase fixes implemented, compiled cleanly, and verified offline against `pg-mem`, Jest, and Vitest; physical PostgreSQL concurrency/RLS execution under `DF-030` and external `DF-003`/`DF-013` rotations/remote push remain external/environment gates.)*

---

## 1. Local vs. Remote Baseline Reconciliation (Phase 0)

| Check | Result |
| :--- | :--- |
| Git Branch & `HEAD` | `fix/cloudflare-pages-production-deploy` at `c67dbb94694a67882b0cf92a3d8e6c41b049de2d` |
| Remote Ref (`origin`) | `c67dbb94694a67882b0cf92a3d8e6c41b049de2d` (`0` divergence pre-edit) |
| Gaps Present at `c67dbb94` | Best-effort `TokenRevocationService` failing open; no `revoked_tokens` migration (`044`); check-then-insert refresh race; `presentation/middleware/authenticate.ts` skipping live DB account/org active validation; `POST /customers/register` lacking identity proof / active org & center validation / biometric consent & fabricating centers on empty lookup; `AuthService.getCenters()` falling back to hardcoded Tasgaon/Miraj/Karveer/P11 UUIDs & granting org-wide centers to ordinary operators. |

---

## 2. Unified Account & Session Authority (Phase 3 — `DF-009`)

### Old vs. New Behavior
- **Old (`c67dbb94`):** `services/backend/src/middleware/authenticate.ts` ran DB checks on `users`/`customers`, whereas `services/backend/src/presentation/middleware/authenticate.ts` trusted signed JWTs without checking DB user/customer/organization status and `middleware/authenticate.ts`'s `try/catch` swallowed `503 AppError` from `TokenRevocationService.isRevoked()` and fell through to a `401`.
- **New (`RESTART-02.1`):**
  - Created shared authoritative service [AccountAuthorityService.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/AccountAuthorityService.ts) used across:
    1. [middleware/authenticate.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/middleware/authenticate.ts)
    2. [presentation/middleware/authenticate.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/middleware/authenticate.ts) (`authenticate`, `optionalAuthenticate`, and `authenticateSseStream`)
    3. [CustomerAuthUseCases.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/auth/CustomerAuthUseCases.ts) (`RefreshTokenUseCase`)
  - **Enforced checks on every authenticated request:**
    - `tokenType === 'refresh'` rejected (`401 INVALID_TOKEN_TYPE`).
    - Durable `tokenRevocationService.isRevoked(...)` checked cleanly outside JWT-to-Supabase fallback (`401 TOKEN_REVOKED`, `503 AUTH_DB_UNAVAILABLE` on DB failure).
    - **Staff (`actorType === 'STAFF'`):** Verifies user exists in `users`, `status === 'ACTIVE'` (`403 ACCOUNT_SUSPENDED`), authoritative role resolved from DB `COALESCE(user_role, role)`, active org required for non-platform roles (`403 ORG_SUSPENDED`), claimed token `organizationId` mismatch rejected (`403 TENANT_CONTEXT_MISMATCH`), and platform staff (`SUPER_ADMIN`, `PLATFORM_OPERATOR`) preserve explicit tenant selection without inheriting arbitrary DB defaults.
    - **Customer (`actorType === 'CUSTOMER'`):** `GUEST_FARMER` allowed only in presentation onboarding routes after verifying `global_customer_identities.phone_verified_at`; registered `FARMER_CUSTOMER` verified across central `customers`, `customer_dairy_memberships`, and `tenantDbManager` with immediate rejection on deleted (`403 ACCOUNT_DELETED`), suspended/rejected (`403 ACCOUNT_SUSPENDED`), or inactive org (`403 ORG_SUSPENDED`).
    - Unmapped identities fail closed (`401 USER_NOT_FOUND` on presentation routes, `403 UNMAPPED_IDENTITY` on root module routes); DB outages fail closed with `503 AUTH_DB_UNAVAILABLE` and never leak raw SQL errors.

---

## 3. Center Scoping & Super Admin Optional Auth Classification (Phases 5 & 7 — `DF-012`)

- **Center Lookup ([auth.service.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/auth/auth.service.ts), [auth.controller.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/auth/auth.controller.ts)):**
  - Removed all hardcoded center fallback records (Tasgaon/Miraj/Karveer/P11).
  - Ordinary operators (`COLLECTION_OPERATOR`, etc.) receive ONLY active centers explicitly mapped to them in `user_center_assignments` within their active organization (never org-wide fallback; `[]` if unassigned).
  - Dairy-wide roles (`PRIMARY_DAIRY_ADMIN`, `DAIRY_ADMIN`, `DAIRY_OWNER`, `BRANCH_MANAGER`, `CENTER_MANAGER`) fall back to active centers of their own active organization.
  - Platform staff (`SUPER_ADMIN`, `PLATFORM_OPERATOR`) require explicit `requestedOrganizationId` / context org selection (else `[]`).
  - Cross-org requests throw `403 CROSS_TENANT_ACCESS_DENIED`; DB failure fails closed (`503 AUTH_DB_UNAVAILABLE`).
- **Super Admin Middleware ([super-admin.routes.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/super-admin.routes.ts)):**
  - Preserved `optionalAuthenticate` followed immediately by mandatory `requirePlatformStaffRole`. Because `optionalAuthenticate` runs DB-backed revocation & `AccountAuthorityService` checks (failing closed `503` on DB outage while clearing unauthenticated/invalid/revoked `req.user`), `requirePlatformStaffRole` enforces `401` (`{ success: false, error: 'Authentication token required...' }`) for missing/invalid/revoked tokens, `403` for `CUSTOMER`, `COLLECTION_OPERATOR`, and `DAIRY_ADMIN`, and `200` for valid platform staff.

---

## 4. Exact Files Changed & Remaining Manual Actions

- **Modified/Added Backend Source & Migrations:** `AccountAuthorityService.ts`, `TokenRevocationService.ts`, `middleware/authenticate.ts`, `presentation/middleware/authenticate.ts`, `CustomerAuthUseCases.ts`, `customers.routes.ts`, `auth.routes.ts`, `auth.service.ts`, `auth.controller.ts`, `super-admin.routes.ts`, `MigrationRunner.ts`, `PostgresPool.ts`, `packages/database/src/index.ts`, `supabase/migrations/044_revoked_tokens_durable_revocation.sql`.
- **Remaining External / Production Actions:** Review and approve Git commit/push (including `RESTART-02.1` fixes), apply migration `044` to Supabase PostgreSQL, run physical PostgreSQL E2E suites (`DF-030`), and complete external key rotations & remote Git purge checklist ([DFARM_RESTART_02_SECRET_ROTATION_CHECKLIST.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_02_SECRET_ROTATION_CHECKLIST.md)).
