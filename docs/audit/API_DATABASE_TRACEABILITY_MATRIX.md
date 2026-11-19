# API DATABASE TRACEABILITY MATRIX

**Audit Document Reference:** `DFARM-AUDIT-008`  
**Version:** `1.0.0-PROMPT0-AUDIT`  
**Status:** `READ-ONLY TECHNICAL BASELINE`  
**Classification:** `End-to-End API Route to Database Traceability Matrix`  
**Evaluator:** DFarm Principal Solution Architect & API Integration Auditor  

---

## 1. Traceability Methodology & Endpoint Classification Codes

Every API endpoint is classified into one of nine status categories:
- **[1] Implemented & Genuinely Used:** Real business logic connects UI to database.
- **[2] Implemented but Not Connected:** Backend endpoint exists, but frontend calls a mock client.
- **[3] Returns Mock/Static Data:** Endpoint responds with hardcoded or synthetic payloads.
- **[4] Uses Incorrect Tenant DB:** Endpoint targets control plane or wrong tenant database.
- **[5] Incorrect Query Filter:** SQL query lacks proper tenant filtering or status checks.
- **[6] Broken:** Fails with runtime error, missing parameter, or unhandled exception.
- **[7] Duplicate:** Multiple conflicting routes exist across `presentation/routes` and `modules/*`.
- **[8] Unused:** Endpoint exists in backend but is never invoked by any client application.
- **[9] Missing:** Endpoint is required by UI specification but has not been implemented in backend.

---

## 2. Master API to Database Traceability Table

| Functional Capability | UI Screen & Caller | HTTP Method & Route | Backend Controller / Use Case | Repository / DB Resolver | DB Resource & Table | Endpoint Classification | Audit Notes & Defect Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Super Admin Login OTP** | Super Admin Login (`client.ts:36`) | `POST /api/v1/auth/admin/otp/request` | `RequestAdminOtpUseCase` | `DoveOtpService` -> `PostgresPool` | Central DB: `admin_otp_challenges` | **[1]** | Dispatches real SMS via Dove SMS gateway. |
| **Super Admin Login Verify**| Super Admin Login (`client.ts:57`) | `POST /api/v1/auth/admin/otp/verify` | `VerifyAdminOtpUseCase` | `DoveOtpService` -> `HmacJwtTokenService` | Central DB: `users`, `organizations` | **[1]** | Returns JWT with `role: 'super_admin'`. |
| **Super Admin Platform Overview**| Overview Page (`client.ts:121`) | *No HTTP Call* (`mockBackend.ts`) | *None* | *None* | Central DB: `organizations`, `devices` | **[2]** | UI reads from local mock state. Backend endpoint is missing. |
| **Create New Dairy** | Super Admin Dairies (`client.ts:190`) | `POST /api/v1/dairies` | `dairies.routes.ts` (inline) | `PostgresPool` -> `TenantDatabaseManager` | Central DB: `organizations`, `dairy_centers`, `users`, `invitations` | **[1]** | Persists dairy and admin invitation. Triggers tenant DB provisioning. |
| **List Dairies** | Super Admin Dairies (`client.ts:132`) | `GET /api/v1/dairies` | `dairies.routes.ts` (inline) | `PostgresPool` | Central DB: `organizations` | **[1]** | Returns all registered dairies. Syncs into frontend mock storage. |
| **Dairy Primary Admin Accounts**| Super Admin Admins (`client.ts:284`) | *No HTTP Call* (`mockBackend.ts`) | *None* | *None* | Central DB: `users`, `dairy_admin_invitations` | **[2]** | Frontend reads from `mockBackend.ts`. Backend endpoint missing. |
| **Platform System Health**| System Health Page (`client.ts:393`) | *No HTTP Call* (`mockBackend.ts`) | *None* | *None* | Central DB: `platform_telemetry_events` | **[9]** | Telemetry ingestion and query endpoints do not exist. |
| **Platform Alerts** | Alerts Page (`client.ts:399`) | *No HTTP Call* (`mockBackend.ts`) | *None* | *None* | Central DB: `platform_alerts` | **[9]** | Alerts lifecycle backend endpoints do not exist. |
| **Platform Audit Logs**| Audit Log Page (`client.ts:415`) | *No HTTP Call* (`mockBackend.ts`) | *None* | *None* | Central DB: `system_audit_logs` | **[2]** | Table exists in migration 010, but no Super Admin query route is wired. |
| **Controlled Support Access**| Support Portal (`client.ts:431`) | *No HTTP Call* (`mockBackend.ts`) | *None* | *None* | Central DB: `controlled_support_sessions` | **[9]** | Form is non-functional; missing backend routes and tables. |
| **Platform Aggregate Reports**| Reports Page (`client.ts:442`) | *No HTTP Call* (`mockBackend.ts`) | *None* | *None* | Central DB: `organizations` | **[2]** | Report aggregation executed on client using mock arrays. |
| **Dairy Admin Login OTP**| Dairy Admin Login (`api/index.ts:30`)| `POST /api/v1/auth/admin/otp/request` | `RequestAdminOtpUseCase` | `DoveOtpService` -> `PostgresPool` | Central DB: `admin_otp_challenges` | **[1]** | Dispatches real SMS. |
| **Dairy Admin Verify OTP**| Dairy Admin Login (`api/index.ts:43`)| `POST /api/v1/auth/admin/otp/verify` | `VerifyAdminOtpUseCase` | `PostgresPool` -> `users` table | Central DB: `users`, `organizations` | **[4]** | Hardcodes Pankaj (`7755995615`) to Gokul organization ID. |
| **Dairy Admin Dashboard**| Dashboard Page (`api/index.ts:111`)| `GET /api/v1/dashboard/summary` | `dashboard.routes.ts` (inline) | `TenantDatabaseManager.getTenantDb()` | Tenant DB: `collections`, `customers` | **[1]** | Queries tenant DB. Returns zeros when empty. |
| **List Pending Approvals**| Pending Approvals (`api/index.ts:183`)| `GET /api/v1/customers/pending` | `GetPendingCustomerRegistrationsUseCase`| `PostgresCustomerRepository` | Tenant DB: `customers`, `customer_addresses` | **[5]** | Displays 0 because Dairy Admin queries Gokul, not farmer's dairy. |
| **Approve Farmer Registration**| Pending Approvals (`api/index.ts:221`)| `POST /api/v1/customers/:id/approve` | `ApproveCustomerRegistrationUseCase` | `PostgresCustomerRepository` | Tenant DB: `customers`, `face_enrollments` | **[1]** | Updates status to `APPROVED`, assigns farmer code, activates face. |
| **Reject Farmer Registration**| Pending Approvals (`api/index.ts:255`)| `POST /api/v1/customers/:id/reject` | `RejectCustomerRegistrationUseCase` | `PostgresCustomerRepository` | Tenant DB: `customers`, `customer_status_history`| **[1]** | Updates status to `REJECTED` with mandatory audit reason. |
| **List Customers (Directory)**| Customer Directory (`api/index.ts:280`)| `GET /api/v1/customers` | `GetCustomersUseCase` | `PostgresCustomerRepository` | Tenant DB: `customers`, `customer_addresses` | **[7]** | Mounted in both `cleanApiRouter` and `modules/customers`. |
| **Farmer Self-Registration**| Customer App (`useRegistration.ts:31`)| `POST /api/v1/customers/register` | `RegisterCustomerUseCase` | `PostgresCustomerRepository` | Tenant DB: `customers`, `face_enrollments` | **[1]** | Persists farmer to selected dairy's tenant database. |
| **Customer Registration Status**| Customer App (`useRegistration.ts:52`)| `GET /api/v1/customers/:id/status` | `GetCustomerStatusUseCase` | `PostgresCustomerRepository` | Tenant DB: `customers` | **[1]** | Returns current approval status and assigned code. |
| **Nearby Dairy Discovery**| Customer App (`dairy-discovery.tsx:25`)| `GET /api/v1/dairies/nearby` | `GetNearbyDairiesUseCase` | `PostgresPool` -> Haversine SQL | Central DB: `organizations` | **[1]** | Discovers dairies within radius. Lost on restart in `pg-mem`. |
| **Operator Login OTP** | Collection Kiosk (`client.ts:130`) | `POST /api/v1/auth/operator/otp/request` | `RequestOperatorOtpUseCase` | `DoveOtpService` | Central DB: `users` | **[1]** | Dispatches real SMS to kiosk operator. |
| **Operator Verify OTP**| Collection Kiosk (`client.ts:137`) | `POST /api/v1/auth/operator/otp/verify` | `VerifyOperatorOtpUseCase` | `DoveOtpService` -> `PostgresPool` | Central DB: `users`, `organizations` | **[1]** | Returns operator session token with dairy and center context. |
| **Face Biometric Match**| Collection Kiosk (`client.ts:249`) | `POST /api/v1/identity/face/match` | `identity.routes.ts` (inline) | `TenantDatabaseManager.getTenantDb()` | Tenant DB: `face_enrollments` | **[6]** | Compares 128-D vector; fails due to canonical fixture mismatch. |
| **Open Shift Session** | Collection Kiosk (`client.ts:325`) | `POST /api/v1/collections/sessions/start` | `collections.routes.ts` (inline) | `TenantDatabaseManager.getTenantDb()` | Tenant DB: `shift_sessions` | **[1]** | Starts Morning/Evening session for specific kiosk device. |
| **Record Milk Intake** | Collection Kiosk (`client.ts:395`) | `POST /api/v1/collections/transactions` | `collections.routes.ts` (inline) | `TenantDatabaseManager.getTenantDb()` | Tenant DB: `milk_collection_transactions`, `ledger`| **[1]** | Atomic insertion of intake slip and double-entry ledger credit. |
| **Batch Payout Generation**| Dairy Admin Billing (`api/index.ts:500`)| `POST /api/v1/payments/batches` | `payment.controller.ts` | `payment.repository.ts` | Tenant DB: `payment_batches`, `customer_payouts`| **[7]** | Defined in `modules/payments`, conflicts with `presentation/routes`. |
| **Reconcile Bank UTR**| Dairy Admin Payments (`api/index.ts:580`)| `POST /api/v1/payments/payouts/:id/confirm`| `payment.controller.ts` | `payment.repository.ts` | Tenant DB: `customer_payouts`, `ledger_entries` | **[1]** | Updates payout to `SETTLED` and debits customer liability. |

---

## 3. High-Priority Remediation Actions

1. **Route De-duplication (Prompt 2):** Remove legacy routes in `services/backend/src/modules/*`. Route all requests through `presentation/routes/*`.
2. **Super Admin Endpoint Realization (Prompt 3 & 4):** Implement missing routes `GET /api/v1/super-admin/metrics`, `GET /api/v1/super-admin/admins`, and `POST /api/v1/super-admin/support/sessions`.
3. **Tenant Context Enforcing (Prompt 2):** Ensure `req.user.organizationId` strictly guides repository resolution so that Dairy Admin queries its own tenant database, resolving the "0 Pending Registrations" defect.
