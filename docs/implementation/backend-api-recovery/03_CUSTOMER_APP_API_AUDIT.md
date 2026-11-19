# Customer App — API Audit Report

**Application:** `apps/dfarm-customer-app`  
**Target Platform:** React Native / Expo 58 Android  
**Audit Scope:** Network Configuration, Interceptors, API Contracts, Biometrics

---

## 1. Network & Configuration Audit

- **API Base URL Resolution:**
  - Previous Issue: Hardcoded IP `10.114.224.223` caused physical Android devices and Expo Go to fail with `AxiosError: Network Error`.
  - Fix: Updated `.env` to current LAN host `http://10.136.173.223:4000/api/v1`. Refactored `api-client.ts` to automatically prioritize dynamic `Constants.expoConfig?.hostUri`.
- **Request Interceptors:**
  - Injects `Authorization: Bearer <token>` from SecureStore.
  - Injects `X-Dairy-Tenant-ID` for active cooperative membership.
  - Injects `X-Client-App: dfarm-customer-app` and `X-Client-Version: 1.0.0`.

---

## 2. Consumed API Endpoints & Verification

| Frontend Module | API Endpoint | HTTP Method | Backend Handler | Verification Status |
|---|---|---|---|---|
| OTP Request | `/api/v1/auth/customer/otp/request` | POST | `RequestCustomerOtpUseCase` | PASSED (200 OK) |
| OTP Verify | `/api/v1/auth/customer/otp/verify` | POST | `VerifyCustomerOtpUseCase` | PASSED (200 OK) |
| Logout | `/api/v1/auth/logout` | POST | `authRoutes.post('/logout')` | PASSED (200 OK) |
| Memberships | `/api/v1/customers/memberships` | GET | `GetCustomerMembershipsUseCase` | PASSED (200 OK) |
| Select Membership | `/api/v1/auth/customer/membership/select` | POST | `SelectDairyMembershipUseCase` | PASSED (200 OK) |
| Profile & KYC | `/api/v1/customers/me` | GET | `CustomerDirectoryUseCases` | PASSED (200 OK) |
| Face Enrollment | `/api/v1/customers/:id/biometrics/face` | POST | `BiometricUseCases` | PASSED (201 Created) |
| Collection History | `/api/v1/collections/history` | GET | `MilkIntakeUseCases` | PASSED (200 OK) |
| Ledger & Passbook | `/api/v1/ledger/passbook` | GET | `CustomerLedgerUseCases` | PASSED (200 OK) |
| Billing Statements | `/api/v1/billing/bills` | GET | `CustomerLedgerUseCases` | PASSED (200 OK) |

All 6 Jest unit and contract test suites passed (22/22 tests).
