# DFarm — Clean Architecture Backend Route Map

**Document ID:** DFARM-ARCH-008  
**Version:** 1.0.0  
**Phase:** Prompt 01 Baseline Implementation  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION

---

## 1. Route Consolidation Architecture (DF-FIND-003 Resolution)

During the Prompt 0 audit, competing route trees (`cleanApiRouter` vs legacy modular routers mounted at overlapping `/api/v1` prefixes) caused non-deterministic endpoint behavior and route shadowing.

**Resolution in `services/backend/src/app.ts`:**
1. **Primary Gateway:** `cleanApiRouter` is mounted at `/api/v1` as the single authoritative Clean Architecture API router for core domain operations (Auth, Customers, Intake, Sessions, Ledger, Rate Charts, Dairies).
2. **Specialized Non-Overlapping Extensions:** Domain modules with dedicated schemas (Employees/Payroll, Hardware Identification, Feed Inventory, Bank Reconciliation, Reports, Webhooks) are mounted on distinct, non-competing paths.

---

## 2. Authoritative Route Registration Map

### 2.1 Core Clean Architecture Router (`/api/v1`)
Mounted in `clean-api-router.ts`:

| Route Path | HTTP Method | Handler / Use Case | Auth & Context Rules |
|---|---|---|---|
| `/api/v1/health` | `GET` | `HealthController` | Public. Checks physical PostgreSQL and tenant pool metrics. |
| `/api/v1/auth/operator/otp/request` | `POST` | `RequestOperatorOtpUseCase` | Public. Requests 6-digit OTP for kiosk operator login. |
| `/api/v1/auth/operator/otp/verify` | `POST` | `VerifyOperatorOtpUseCase` | Public. Verifies OTP and returns HMAC-SHA256 JWT token. |
| `/api/v1/auth/customer/otp/request`| `POST` | `RequestCustomerOtpUseCase` | Public. Farmer mobile OTP request. |
| `/api/v1/auth/customer/otp/verify` | `POST` | `VerifyCustomerOtpUseCase` | Public. Farmer mobile OTP verify & session token. |
| `/api/v1/auth/admin/login` | `POST` | `AdminLoginUseCase` | Public. Primary Dairy Admin email & password login. |
| `/api/v1/customers/register` | `POST` | `RegisterCustomerUseCase` | Public self-registration. Validates `selectedDairyId`. |
| `/api/v1/customers/:id/status` | `GET` | `GetCustomerStatusUseCase` | Public status polling. Resolves tenant from central lookup index. |
| `/api/v1/customers` | `GET` | `GetCustomersUseCase` | Requires tenant context (`req.tenantDb`). IDOR protected. |
| `/api/v1/customers/:id` | `GET` | `GetCustomerByIdUseCase` | Requires tenant context (`organizationId`). |
| `/api/v1/customers/pending` | `GET` | `GetPendingRegistrationsUseCase`| Requires Dairy Admin or Operator authentication. |
| `/api/v1/customers/:id/approve` | `POST` | `ApproveRegistrationUseCase`| Requires Dairy Admin authentication. |
| `/api/v1/customers/:id/reject` | `POST` | `RejectRegistrationUseCase` | Requires Dairy Admin authentication. |
| `/api/v1/customers/:id/biometrics`| `PUT`| `UpdateCustomerBiometricsUseCase`| Requires tenant context. Encrypts with AES-256-GCM. |
| `/api/v1/sessions/active` | `GET` | `GetActiveShiftSessionUseCase` | Requires Kiosk Operator authentication. |
| `/api/v1/sessions/open` | `POST` | `OpenShiftSessionUseCase` | Requires Kiosk Operator authentication. |
| `/api/v1/sessions/:id/close` | `POST` | `CloseShiftSessionUseCase` | Requires Kiosk Operator authentication. |
| `/api/v1/collections/intake` | `POST` | `ProcessMilkIntakeUseCase` | Requires Kiosk Operator authentication. Idempotency enforced. |
| `/api/v1/ledger/accounts/:customerId`| `GET`| `GetCustomerLedgerAccountUseCase`| Requires tenant context. |
| `/api/v1/ledger/entries` | `GET` | `GetCustomerLedgerEntriesUseCase`| Requires tenant context. |
| `/api/v1/rates/active` | `GET` | `GetActiveRateChartUseCase` | Requires tenant context. |
| `/api/v1/rates/calculate` | `POST` | `CalculateMilkRateUseCase` | Matrix lookup with linear formula fallback. |
| `/api/v1/dairies/nearby` | `GET` | `GetNearbyDairiesUseCase` | Public. Haversine distance search on control plane. |

### 2.2 Specialized Feature Routes
Mounted without prefix collision in `app.ts`:
- `/api/v1/employees` -> Staff directory & shift assignments.
- `/api/v1/attendance` -> Daily staff clock-in/clock-out records.
- `/api/v1/payroll` -> Monthly salary slips & disbursements.
- `/api/v1/identification` -> Kiosk face/RFID check-in logs.
- `/api/v1/inventory` -> Cattle feed warehouse stock & store sales.
- `/api/v1/reconciliation` -> Farmer payment reconciliation batches.
- `/api/v1/reports` -> Tenant analytics and aggregate summaries.
- `/api/v1/webhooks/whatsapp` -> WhatsApp status callbacks.
