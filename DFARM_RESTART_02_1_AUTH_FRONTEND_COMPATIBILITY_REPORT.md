# DFarm — RESTART-02.1 Auth Routes & Frontend Compatibility Report

**Phase:** `RESTART-02.1` (Phase 6)  
**Date:** `2026-11-26`  
**Apps Inspected:** `apps/dfarm-customer-app`, `apps/dfarm-collection-app`, `apps/dfarm-dairy-admin`, `apps/dfarm-super-admin`  
**Backend Auth Layer:** [app.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/app.ts), [presentation/routes/auth.routes.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/auth.routes.ts), [modules/auth/auth.routes.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/auth/auth.routes.ts), [modules/auth/auth.controller.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/auth/auth.controller.ts)

---

## 1. Frontend-to-Backend Auth Consumer Mapping

| Application | Client Auth Endpoints Called | Backend Route Handler | OTP Provider | Compatibility Status |
| :--- | :--- | :--- | :--- | :--- |
| **Customer Mobile (`dfarm-customer-app`)** | `POST /auth/request-otp`, `POST /auth/verify-otp`, `POST /auth/refresh-token`, `POST /auth/logout`, `GET /customers/memberships`, `POST /customers/switch-dairy`, `POST /customers/register`, `GET /customers/:id/status` | `cleanApiRouter` -> `presentation/routes/{auth,customers}.routes.ts` | `DoveOtpService` (server-side HMAC OTP + DB rate limit) | **COMPATIBLE (`8/8` Jest suites, `31/31` pass)**; receives `GUEST_FARMER` JWT from `/auth/verify-otp` before calling `/customers/register`. |
| **Collection Kiosk (`dfarm-collection-app`)** | `POST /auth/device/challenge`, `POST /auth/operator/otp/request`, `POST /auth/operator/otp/verify`, `GET /auth/health` | `cleanApiRouter` -> `presentation/routes/auth.routes.ts` | `DoveOtpService` + `DeviceChallengeService` | **COMPATIBLE (`17/17` Vitest files, `162/162` pass)**. |
| **Dairy Admin Web (`dfarm-dairy-admin`)** | `POST /auth/admin/otp/request`, `POST /auth/admin/otp/verify`, `GET /auth/admin/me`, `GET /staff/centers` | `cleanApiRouter` -> `presentation/routes/{auth,staff}.routes.ts` | `DoveOtpService` + active user/org DB checks | **COMPATIBLE (`5/5` Vitest files, `14/14` pass)**; uses `/staff/centers` which enforces tenant/permission checks. |
| **Super Admin Web (`dfarm-super-admin`)** | `POST /auth/admin/otp/request`, `POST /auth/admin/otp/verify`, `POST /dairies/invitations/otp/request`, `/super-admin/*` | `cleanApiRouter` -> `presentation/routes/{auth,dairies,super-admin}.routes.ts` | `DoveOtpService` + `requirePlatformStaffRole` | **COMPATIBLE (`10/10` Vitest files, `48/48` pass)**. |

---

## 2. Duplicate Mounts, Legacy Compatibility & Hardening Changes

1. **Legacy Passwordless Staff Login (`DF-001`):** `/api/users/auth` and `/api/auth` remain unmounted in `app.ts`; `POST /login` remains removed from `modules/auth/auth.routes.ts`; `AuthService.loginStaff` continues throwing `401 AUTH_METHOD_DISABLED`. Dead unused handler `AuthController.login` was removed from [auth.controller.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/auth/auth.controller.ts).
2. **Legacy Compatibility Router (`/api/v1/auth` -> `modules/auth/auth.routes.ts`):** Mounted after `cleanApiRouter` solely for `/me`, `/centers`, `/otp/send`, and `/otp/verify` (`Supabase` Auth OTP) exercised by backend compatibility suites (`health-and-auth.test.js`, `customer-endpoints.test.js`, `dashboard-history-verification.test.js`, `registration-app-connectivity.test.js`). Both `/me` and `/centers` run behind unified DB-backed `middleware/authenticate.ts` + `AccountAuthorityService`, and `/centers` enforces role/org scoping with zero hardcoded fallback centers.
3. **Logout & Refresh Contracts:** `/api/v1/auth/logout` now fails truthfully (`503 REVOCATION_DB_UNAVAILABLE`) when durable revocation fails (note: `dfarm-customer-app` `useAuth.ts` catches network errors to still clear local storage), and `/api/v1/auth/refresh-token` uses atomic single-use rotation backed by `AccountAuthorityService`.
4. **No Login UI Changes:** Zero login screens were redesigned across any application.
