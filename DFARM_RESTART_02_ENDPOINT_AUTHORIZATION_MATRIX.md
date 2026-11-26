# DFarm — RESTART-02 Endpoint Authorization Matrix

**Audit Phase:** `RESTART-02`  
**Date:** `2026-11-26`  
**Scope:** Backend HTTP endpoints across `services/backend/src/presentation/routes/` and `services/backend/src/modules/auth/`

---

## 1. Authentication Entry Points (`DF-001`, `DF-011`, `DF-014`)

| Method & Path | Intended Actor | Accepted Factor(s) | Middleware Chain | DB Verification | Gap Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST /api/v1/auth/login` (legacy module) | *Disabled* | *Removed* | Route removed from `modules/auth/auth.routes.ts`; `AuthService.loginStaff` throws `401 AUTH_METHOD_DISABLED` | N/A | **CLOSED (`DF-001`)** |
| `POST /api/users/auth/login`, `/api/auth/login` | *Disabled* | *Removed* | Duplicate router mounts removed from `app.ts` | N/A | **CLOSED (`DF-001`)** |
| `POST /api/v1/auth/request-otp`, `/customer/otp/request` | Customer | Mobile number | Rate limiter | Sends OTP (`CUSTOMER_AUTH`) | Verified |
| `POST /api/v1/auth/verify-otp`, `/customer/otp/verify` | Customer | Mobile number + HMAC OTP | Rate limiter | Global identity & memberships DB lookup; issues `tokenType: 'access'` + `'refresh'` (`GUEST_FARMER` receives `access` only) | **HARDENED (`DF-011`)** |
| `POST /api/v1/auth/device/challenge` | Kiosk Device | `deviceIdentifier` | Rate limiter | Verifies active non-blocked device & issues nonce | Verified |
| `POST /api/v1/auth/operator/otp/request`, `/operator/otp/verify` | Operator | Registered active staff phone + OTP (+ device proof) | Rate limiter | Active staff + center + org DB verification; issues `tokenType: 'access'` | **HARDENED (`DF-011`)** |
| `POST /api/v1/auth/admin/otp/request`, `/admin/otp/verify` | Dairy Admin / Super Admin | Persisted active admin phone + `ADMIN_LOGIN` OTP | Rate limiter | Re-verifies active user & active org DB state pre- and post-OTP; issues `access` + `refresh` | **HARDENED (`DF-011`)** |
| `GET /api/v1/auth/admin/me` | Dairy Admin / Super Admin | Bearer access JWT | `authenticate` | Live `users` + `organizations` DB status/role/org match (`503` on DB failure) | Verified |
| `POST /api/v1/auth/refresh-token` | Authenticated Staff / Customer | `tokenType: 'refresh'` JWT | Public + `RefreshTokenUseCase` | Rejects `access` & `GUEST_FARMER`; checks revocation + live DB user/customer/org (`503`/`401`/`403`); rotates & revokes old token | **CLOSED (`DF-011`)** |
| `POST /api/v1/auth/logout` | Any caller | Access / Refresh JWT | Handler | Revokes submitted access & refresh tokens in `TokenRevocationService` | **HARDENED (`DF-011`)** |

---

## 2. Dairy Lifecycle & Invitation Endpoints (`DF-002`, `DF-014`)

| Method & Path | Intended Actor | Middleware Chain | Tenant / Enumeration Safeguard | Status |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/v1/dairies/nearby`, `/discover` | Public / Farmer Discovery | Public | Excludes suspended/disabled/failed-DB dairies; no secrets leaked | Preserved |
| `GET /api/v1/dairies/invitations/validate` | Invited Dairy Admin | Public (`rate-limited` onboarding) | **SHA-256 `token_hash` lookup only**; `dairyCode`-only rejected `400 MISSING_TOKEN` | **CLOSED (`DF-014`)** |
| `POST /api/v1/dairies/invitations/otp/request` | Invited Dairy Admin | Public onboarding | **SHA-256 `token_hash` only**; `PENDING` invitation required; masked response | **CLOSED (`DF-014`)** |
| `POST /api/v1/dairies/invitations/activate` | Invited Dairy Admin | Public onboarding + `ADMIN_LOGIN` OTP | **SHA-256 `token_hash` + OTP**; transactional DB activation (prod fails closed `503`); removed no-op phone registration | **CLOSED (`DF-014`)** |
| `POST /api/v1/dairies/invitations/resend` | Super Admin | `authenticate`, `authorizeRoles('SUPER_ADMIN')` | Revokes prior link; authenticates actor | **CLOSED (`DF-002`)** |
| `GET /api/v1/dairies`, `GET /api/v1/dairies/tenant-databases` | Platform Staff | `authenticate`, `authorizeRoles('SUPER_ADMIN', 'PLATFORM_OPERATOR')` | Global platform directory & DB mappings restricted to platform roles | **CLOSED (`DF-002`)** |
| `GET /api/v1/dairies/:id` | Platform Staff or Own Dairy Staff | `authenticate` | Cross-tenant `req.user.organizationId !== dairyId` returns `403` | **CLOSED (`DF-002`)** |
| `POST /api/v1/dairies`, `POST /:id/retry-provisioning`, `POST /:id/{suspend,reactivate}`, `DELETE /:id*` | Super Admin | `authenticate`, `authorizeRoles('SUPER_ADMIN')` | Required `req.user.userId` audit actor; prod DB tx failure fails closed (`503`) | **CLOSED (`DF-002`)** |
| `PATCH /api/v1/dairies/:id/location` | Super Admin or Owning Dairy Admin | `authenticate`, `authorizeRoles('SUPER_ADMIN', 'DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'DAIRY_OWNER')` | Non-`SUPER_ADMIN` blocked (`403`) on other dairy's ID | **CLOSED (`DF-002`)** |
| `DELETE /api/v1/dairies/admin/by-phone/:phone`, `/purge/phone/:phone` | Test Harness Only | `guardPurgeEndpoint` (`403` if `NODE_ENV !== 'test'`, else `authenticate` + `SUPER_ADMIN`) | Permanently disabled in production; requires Super Admin JWT in test mode | **CLOSED (`DF-002`)** |
| `ALL /api/v1/dairies/:dairyId/database/*` (`tenant-database.routes.ts`) | Platform Staff / Super Admin | Router-level `authenticate`, `authorizeRoles('SUPER_ADMIN', 'PLATFORM_OPERATOR')` (mutations require `SUPER_ADMIN`) | Standalone mount also protected | **CLOSED (`DF-012`)** |

---

## 3. Customer, Biometric & Identity Endpoints (`DF-004`, `DF-005`, `DF-015`)

| Method & Path | Allowed Roles / Permissions | Tenant / Ownership Enforcement | Previous Defect Fixed |
| :--- | :--- | :--- | :--- |
| `GET /api/v1/customers` | `customers:read`, `customers:identify_face`, `customers:identify_rfid`, `customers:identify_manual` | Rejects cross-org query/header (`403`) unless `SUPER_ADMIN` | Replaced `optionalAuthenticate` |
| `GET /api/v1/customers/memberships` | `authenticate` (all authenticated users) | Self-scoped for customers (cross-customer `phone`/`globalCustomerId` rejected `403`) | Replaced `optionalAuthenticate` |
| `POST /api/v1/customers/register` | Public / Guest self-registration (`optionalAuthenticate`) | If authenticated as `STAFF`, requires `customers:update`/`approve` & own org (`403`) | Added staff boundary check |
| `GET /api/v1/customers/pending` | `customers:read`, `customers:approve` | Org-scoped via JWT | Fixed no-op `authorizePermission` + `optionalAuthenticate` |
| `GET /api/v1/customers/:id/status` | `authenticate` (self or dairy staff with customer read/identify permission) | Self-only for customers; org-isolated for staff | Added missing `authenticate` |
| `POST/PATCH /api/v1/customers/:id/{approve,reject}` | `customers:approve` (or `customers:reject`) | Org-scoped via JWT | Replaced `optionalAuthenticate` |
| `POST /api/v1/customers/:id/{suspend,reactivate,restore}`, `PATCH /:id`, `DELETE /:id` | `customers:update` / `customers:delete` | Org-scoped via JWT; bank fields blocked on generic `PATCH /:id` | Fixed 5 no-op `authorizePermission` callbacks + `optionalAuthenticate` |
| All 18 `/biometrics*` routes | `authenticate` (`FARMER_CUSTOMER`/`GUEST_FARMER` self-only; `STAFF` needs `biometrics:manage`/`customers:update`) | Cross-customer & cross-org blocked (`403`) | Replaced `optionalAuthenticate` on all 18 routes |
| `GET /api/v1/customers/:id` | `authenticate` (self or staff with read/identify) | Cross-customer & cross-org blocked (`403`) | Replaced `optionalAuthenticate` |
| `PUT /api/v1/customers/:id/bank-details` | `FARMER_CUSTOMER` (own) or staff with `customers:update` / `SUPER_ADMIN` | Tenant ownership checked against customer `organizationId` (`403`) | **CLOSED (`DF-015` bank IDOR)** |
| `GET /api/v1/identity/face/templates` | `customers:read`, `customers:identify_face`, `biometrics:manage` | JWT `organizationId` only; removed `'00000000-...001'` default | **CLOSED (`DF-005`)** |
| `POST /api/v1/identity/face/detect-and-embed` | `authenticate` | Requires valid session | Replaced `optionalAuthenticate` |
| `POST /api/v1/identity/face/match` | `customers:identify_face`, `biometrics:manage`, `customers:read`, `profile:view_own` | JWT org isolation; farmer customer self-only; removed default org UUID | **CLOSED (`DF-005`)** |
| `GET /api/v1/identity/face/enrollments`, `POST /:id/{re-enroll,revoke}` | `customers:read` / `biometrics:manage` / `customers:update` | Tenant-scoped update subquery (`customer_id IN ... organization_id`) | Fixed 3 no-op callbacks + cross-tenant mutation |

---

## 4. Collection, Sync, Financial & Operational Endpoints (`DF-006`, `DF-007`, `DF-010`, `DF-012`)

| Router & Endpoints | Middleware Enforced | Tenant & Ownership Controls |
| :--- | :--- | :--- |
| `collections.routes.ts` (`/sessions*`, `/transactions*`, `/intake`, `/sync/bulk`, `/bulk`, `/quality/readings`, `/history`, `/summary/monthly`) | `authenticate` + granular `authorizePermission` (`sessions:*`, `collections:*`, `passbook:view_own`, `hardware:kiosk_read`) | Removed all `optionalAuthenticate` & `'00000000-...001/2/3'` fallbacks; forwarded `organizationId` to `closeSessionUseCase`; tenant-checked `/transactions/:id/adjust`; removed duplicate `GET /transactions/recent` |
| `sync.routes.ts` (`/bulk`, `/transactions`, `/push`) | `authenticate` + `authorizePermission('collections:intake', 'sessions:manage')` | Org mismatch returns `403`; device-proof shadowing (`DF-007`) flagged for `RESTART-03/04` |
| `ledger.routes.ts` (`/accounts/:id`, `/summary`, `/balance`, `/entries`, `/adjustment`) | `authenticate` + `authorizePermission('passbook:view_own', 'billing:read', 'billing:manage', 'collections:view_all')` (`billing:manage` for `/adjustment`) | Cross-customer & cross-org blocked (`403`) |
| `payments.routes.ts` (`GET /`, `POST /`) | `authenticate` + `authorizePermission` (`billing:read`/`manage`/`passbook:view_own`; `billing:manage` on `POST`) | Cross-org blocked (`403`); removed `'00000000-...083/084'` fallbacks; ephemeral `/batches/:batchId/download` token preserved |
| `bills.routes.ts` (`GET /`, `POST /generate`) | `authenticate` + `authorizePermission('bills:view_own', 'billing:read', 'billing:manage')` (`billing:manage` for `POST`) | Prevented header override of JWT `organizationId`; removed `'00000000-...002'` default |
| `feed.routes.ts` (`/products`, `/stock`, `/sales`, `/movements`) | `authenticate` + `authorizePermission('feed:*')` (`feed:view_own` excluded from `/movements`) | Cross-org & cross-customer blocked (`403`) |
| `rate-charts.routes.ts` (`/`, `/sync`, `/draft`, `/:id/activate`, `/preview`) | `authenticate` + `authorizePermission('rate_charts:*', ...)` (`rate_charts:manage` on writes) | Fixed 2 no-op callbacks; verified chart `organization_id`; removed `'00000000-...010'` default |
| `rfid.routes.ts` (`/`, `/assign`, `/mark-lost`, `/unassign`, lookup) | `authenticate` + `authorizePermission('rfid:manage', ...)` | Fixed 4 no-op callbacks; removed `'00000000-...002/003'` defaults; org isolation |
| `devices.routes.ts` (`/heartbeat`, `/`, `/:id/{sync,mapping,calibration}`, `/telemetry`) | `authenticate` + `authorizePermission('devices:manage', 'hardware:read', 'hardware:kiosk_read')` | Added `authenticate` to `/telemetry` & all optional routes; cross-org blocked (`403`) |
| `staff.routes.ts`, `reports.routes.ts`, `audit.routes.ts`, `dashboard.routes.ts`, `notifications.routes.ts` | `authenticate` + role/module `authorizePermission` (customer self-only on `notifications`) | Cross-org query/header overrides rejected `403` for non-`SUPER_ADMIN` |
| Root `middleware/authenticate.ts` (`modules/*` routes) | JWT/Supabase check + live DB `users` / `customers` lookup via `pool` & `tenantDbManager` | Rejects `tokenType === 'refresh'` & revoked tokens (`401`), suspended/deleted/unmapped (`403`), DB outage fails closed **`503 AUTH_DB_UNAVAILABLE`** (`DF-009`) |
