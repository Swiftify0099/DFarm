# DFarm: Four Application Architecture

This document defines the structural architecture, component responsibilities, state management strategies, and platform considerations for the four applications in the DFarm ecosystem.

---

## 1. Application 1: Admin Web Dashboard

- **Target Technology:** React 18/19, TypeScript, Vite, Tailwind CSS, TanStack Query (React Query), Zustand/Context for global UI state.
- **Deployment Model:** Containerized web application (Docker/Cloudflare Pages/Vercel) communicating with the Node.js backend.
- **Key Modules:**
  1. **Center Operations:** Multi-center registration, center-level shift timings (Morning/Evening windows), and operator assignments.
  2. **Customer Administration:** Farmer KYC reviews, status changes (`ACTIVE`, `SUSPENDED`, `SOFT_DELETED`, `RESTORED`), permission configuration (`COW`, `BUFFALO`, `BOTH`), and biometric consent oversight.
  3. **Rate Management:** Grid matrix builder and formula editor for Cow and Buffalo milk rates based on Fat% and SNF% with effective date schedules.
  4. **Intake Monitoring:** Real-time collection feeds, shift aggregates (total liters, average fat, average SNF, total payable), and manual supervisor override inspection.
  5. **Financial Ledger & Billing:** Periodic billing cycle generation (10-day cycle or calendar month), farmer passbooks, cash advance disbursements, cattle feed deduction reconciliation, and payout batch exports.
  6. **Feed Inventory:** Cattle feed SKU catalog, supplier purchases, stock warehouse tracking, retail pricing, and farmer credit sales.
  7. **Employee Payroll:** Staff master directory, attendance, fixed/variable salary structure, and payout ledger (isolated from farmer accounts).
  8. **Audit & Compliance:** Central audit log viewer detailing security actions, login events, and transaction cancellations.

---

## 2. Application 2: Customer Registration Android App

- **Selected Technology:** Native Android (**Kotlin 2.3 + Jetpack Compose Material 3**), Retrofit 2 + OkHttp 4 REST client, Android Keystore `EncryptedSharedPreferences` for session tokens.
- **Implementation Status:** Phase 06 Complete (`apps/registration-android/`).
- **Target Device Profile:** Field Android smartphones (Android 7.0+ / API 24 to API 36) carried by dairy registration officers.
- **Implemented Modules (Phase 06):**
  1. **Officer Authentication:** Real backend authentication (`POST /api/v1/auth/login`, `GET /api/v1/auth/me`), multi-center selection (`X-Center-ID`), and hardware Keystore session persistence.
  2. **Customer Registration Wizard:** 5-step unidirectional workflow: Personal Details $\rightarrow$ Unique Mobile Validation $\rightarrow$ Milk Category $\rightarrow$ Review Details $\rightarrow$ Backend Confirmation.
  3. **Canonical Server UUID:** Authority resides strictly with backend `public.register_customer` stored procedure; zero conflicting client UUIDs generated.
  4. **Customer Management:** Paginated customer list with debounced search (by name, mobile, farmer code), filtering by category (Cow/Buffalo) and status, detail view, and authorized profile editing.
  5. **Strict Scope Enforcement:** Facial Biometric Inference (Phase 07) and Physical RFID Scanner Integration (Phase 08) are cleanly isolated and tracked as pending steps on the customer status dashboard.

---

## 3. Application 3: Collection / Security Application

- **Target Technology:** Cross-platform intake application (React Native for Android Tablet or Electron/React desktop application for counter PCs) with native local SQLite storage.
- **Target Device Profile:** Fixed collection counter terminals equipped with a high-definition webcam or tablet front camera, an RFID card scanner, and a thermal slip printer.
- **Key Modules:**
  1. **Triple-Method Identification Engine:**
     - *Priority 1 — Face Recognition:* Real-time camera feed detects face, extracts embedding, computes cosine similarity against local active templates. Match score $\ge \text{Threshold}$ establishes identity.
     - *Priority 2 — RFID Card Verification:* Tap of assigned card queries local SQLite store to retrieve associated `customer_uuid`.
     - *Priority 3 — Supervisor Manual Override:* Authenticated supervisor searches farmer directory, selects profile, and enters mandatory reason code (e.g. "Facial injury", "RFID lost").
  2. **Intake State Machine:**
     - Enforces single canonical `customer_uuid`.
     - Category validation: Auto-selects Cow or Buffalo if single permission; prompts operator selection if customer is authorized for Both. Locks category for session.
     - Shift session validation: Enforces Morning or Evening session context.
  3. **Software Composition & Weight Validation:**
     - Receives Fat% and SNF% values via software input interface; validates against configurable species bounds.
     - Receives milk weight (kg/L); validates against positive non-zero volume limits.
  4. **Pricing Engine:** Looks up effective rate from locally cached rate chart; calculates total amount ($W \times R$).
  5. **Atomic Local Transaction:** Writes collection record, credits customer ledger, updates offline sync journal, and triggers thermal slip printer.

---

## 4. Application 4: Customer Mobile App

- **Target Technology:** React Native, Expo, TypeScript.
- **Target Device Profile:** Android and iOS smartphones owned by dairy farmers.
- **Key Modules:**
  1. **Farmer Authentication:** Secure login via mobile phone number and SMS OTP.
  2. **Farmer Dashboard:** Today's milk collection summary (Morning & Evening sessions), current billing cycle total, and net ledger balance.
  3. **Collection Slip History:** Historical list of collection receipts showing date, shift, milk type (Cow/Buffalo), weight, fat%, SNF%, rate applied, and total credit amount.
  4. **Farmer Passbook / Ledger:** Complete statement showing milk credits, cattle feed purchase debits, advance debits, veterinary deductions, and payments received.
  5. **Monthly Settlement Statements:** Downloadable PDF statements summarizing 10-day or monthly billing cycles with gross milk value, total deductions, and net payout.
  6. **Push Notifications:** Instant delivery alerts for milk intake slips, rate revisions, and payment disbursements.

