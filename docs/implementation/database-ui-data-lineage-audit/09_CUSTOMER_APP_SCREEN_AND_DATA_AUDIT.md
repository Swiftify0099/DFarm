# DFARM — CUSTOMER APP SCREEN AND DATA AUDIT (`dfarm-customer-app`)
## 16 SCREENS, HOOKS, STATE & DATABASE LINEAGE

**Audit Reference:** `DFARM-AUDIT-APP-CUSTOMER-001`  
**Target:** `apps/dfarm-customer-app` (Expo SDK 51 / React Native)  
**Date:** 2026-11-18  

---

### 1. Screen-by-Screen Data Traceability Matrix

| Screen Name | File Path | Primary Hook / Query | Backend API | Source Database & Tables | Displayed Fields | Verification Status |
|---|---|---|---|---|---|---|
| **Splash / Entry** | `src/app/index.tsx` | Token Check | `GET /api/v1/auth/customer/me` | `dfarm_tenant`: `customers` | Brand logo, Loading Spinner | STATIC SOURCE & RUNTIME |
| **Login Screen** | `src/app/(auth)/login.tsx` | `useAuth` | `POST /api/v1/auth/customer/otp/request` | `dfarm_central`: `otp_rate_limits` | Mobile Number Input, Send OTP button | STATIC SOURCE VERIFIED |
| **Verify OTP** | `src/app/(auth)/verify-otp.tsx` | `useAuth` | `POST /api/v1/auth/customer/otp/verify` | `dfarm_tenant`: `customers` | 6-digit OTP boxes, Resend Timer | STATIC SOURCE VERIFIED |
| **Dairy Discovery** | `src/app/(onboarding)/dairy-discovery.tsx` | `useDairyDiscovery` | `GET /api/v1/dairies/nearby` | `dfarm_central`: `organizations`, `dairy_centers` | Distance, Dairy Name, Village, Select | STATIC SOURCE VERIFIED |
| **Registration** | `src/app/(onboarding)/registration.tsx` | `useRegistration` | `POST /api/v1/customers/register` | `dfarm_tenant`: `customer_registration_records` | Full Name, Mobile, Cattle Count, Bank IFSC | STATIC SOURCE VERIFIED |
| **Pending Approval**| `src/app/(onboarding)/pending-approval.tsx` | Polling Query | `GET /api/v1/customers/registration-status` | `dfarm_tenant`: `customer_registration_records` | Application Ref, Status ('PENDING'), Help | STATIC SOURCE VERIFIED |
| **Face Enrollment** | `src/app/(onboarding)/face-enroll.tsx` | Camera Driver | `POST /api/v1/identity/face/enroll` | `dfarm_tenant`: `face_enrollments` | Camera Preview, Liveness Check, Submit | STATIC SOURCE VERIFIED |
| **Farmer Dashboard**| `src/app/(main)/index.tsx` | `useProfile`, `useCollection` | `GET /api/v1/customers/profile`, `/collection/history` | `dfarm_tenant`: `customers`, `customer_ledger_accounts` | Farmer Code, Balance, Today's Liters | STATIC SOURCE & RUNTIME |
| **Milk Collections**| `src/app/(main)/collection.tsx` | `useCollection` | `GET /api/v1/collection/history` | `dfarm_tenant`: `milk_collections` | Date, Shift, Qty, FAT, SNF, Rate, Gross | STATIC SOURCE VERIFIED |
| **Passbook Ledger** | `src/app/(main)/ledger.tsx` | `useLedger` | `GET /api/v1/ledger/statement` | `dfarm_tenant`: `ledger_entries` | Date, Txn Type, Debit, Credit, Net Bal | STATIC SOURCE VERIFIED |
| **Billing History** | `src/app/(main)/bills.tsx` | `useBills` | `GET /api/v1/bills/my-bills` | `dfarm_tenant`: `monthly_bills` | Cycle, Gross, Deductions, Net Payable | STATIC SOURCE VERIFIED |
| **Farmer Profile**  | `src/app/(main)/profile/index.tsx` | `useProfile` | `GET /api/v1/customers/profile` | `dfarm_tenant`: `customers`, `customer_addresses` | Name, Mobile, Village, Primary Center | STATIC SOURCE VERIFIED |
| **Bank Details**   | `src/app/(main)/profile/bank-details.tsx` | `useProfile` | `GET /api/v1/customers/profile` | `dfarm_tenant`: `customers` | Account Number (Masked), IFSC, Bank Name | STATIC SOURCE VERIFIED |

---

### 2. Mobile State Management & Storage Security

- **Storage Layer:** `src/services/secure-storage.ts` utilizes Expo SecureStore (hardware keychain on iOS / Android Keystore on Android).
- **Session Tokens:** Access token, refresh token, customer ID, and tenant dairy ID are persisted in SecureStore.
- **Logout Behavior:** `secureStorage.clearAll()` purges tokens and cached credentials upon user signout.
