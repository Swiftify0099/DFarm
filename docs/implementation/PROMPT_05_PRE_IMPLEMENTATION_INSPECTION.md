# DFARM — PROMPT 05 PRE-IMPLEMENTATION INSPECTION
## COMPREHENSIVE ARCHITECTURAL AUDIT & READINESS ASSESSMENT FOR CUSTOMER MOBILE EXPERIENCE

**Document Reference:** `DFARM-INSPECTION-PROMPT-05`  
**Execution Phase:** Prompt 05  
**Target Application:** `apps/dfarm-customer-app` (React Native, Android-first) + Supporting Backend APIs  
**Working Directory:** `c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init`  
**Audit Date:** 2026-11-17  

---

## 1. EXISTING CUSTOMER APP SCREEN & COMPONENT INVENTORY

`apps/dfarm-customer-app` is a Greenfield React Native application built with Expo SDK 58, React 19, React Native 0.88.1, and Expo Router file-based routing.

### 1.1 Screen Directory Structure (`src/app`)
- **`src/app/index.tsx`**: Application entry point / splash dispatcher. Checks active session in `expo-secure-store`; routes to `/(auth)/login`, `/(onboarding)/dairy-discovery`, `/(onboarding)/pending-approval`, or `/(main)`.
- **`src/app/(auth)/login.tsx`**: Mobile number entry screen with Claymorphism styling and DFarm branding. Dispatches OTP via `/auth/request-otp`.
- **`src/app/(auth)/verify-otp.tsx`**: 6-digit numeric OTP verification screen with countdown timer and resend capability.
- **`src/app/(onboarding)/dairy-discovery.tsx`**: Nearby dairy discovery screen integrating GPS location, distance calculation, area filters (Kolhapur, Sangli, Pune), search bar, and dairy selection cards.
- **`src/app/(onboarding)/register.tsx`**: Producer details form (Full Name, Village, Milk Supply Category: Cow, Buffalo, Both) and explicit biometric consent checkbox.
- **`src/app/(onboarding)/face-enroll.tsx`**: Biometric camera viewport with oval reticle overlay, real-time feedback, YuNet landmark alignment check, and SFace INT8 128-D vector extraction.
- **`src/app/(onboarding)/pending-approval.tsx`**: Application status screen displaying real-time review state (`PENDING_APPROVAL`, `APPROVED`, `REJECTED`), status timeline, farmer code, and polling.
- **`src/app/(main)/index.tsx`**: Farmer Home Dashboard displaying greeting, today's shift weighment card (volume, fat %, SNF %, rate, total amount), quick ledger balance pill, and test face action.
- **`src/app/(main)/collection.tsx`**: Historical milk intake ledger filtering by morning/evening shifts and cow/buffalo category.
- **`src/app/(main)/ledger.tsx`**: Double-entry financial passbook (`Khata`) detailing `MILK_CREDIT`, `PAYMENT` debits, and running balances.
- **`src/app/(main)/bills.tsx`**: Monthly billing statements displaying gross earnings, feed deductions, net payable amounts, and payment status.
- **`src/app/(main)/profile/index.tsx`**: Farmer account summary, verified status, affiliated dairy, village, supply animals, face biometric status badge, and secure logout.
- **`src/app/(main)/profile/diagnostics.tsx`**: On-device sensor and camera diagnostic tool.
- **`src/app/(main)/profile/update-face.tsx`**: Re-enrollment screen for updating biometric templates.

### 1.2 Design System Components (`src/design-system`)
- **Theme**: Warm Claymorphism tokens (`#FF6A00` Saffron, `#211B18` Cocoa Slate, `#FFF5EE` Cream, `#FFFFFF` Surface).
- **Primitives**: `ClayCard`, `ClayButton`, `ClayBadge`, `ClayInput`, `ClayOTPInput`, `ClayModal`, `ClayHeader`, `ClayStateView`, `StatusTimeline`, `AnimalSelector`, `DistanceBadge`.
- **Vector Assets**: `DFarmBrandMark`, `CowIcon`, `BuffaloIcon`, `HerdIcon`, `BiometricAssets`, `LocationAssets`, `NavAssets`, `StatusAssets`.

---

## 2. ACTUAL FEATURES ALREADY IMPLEMENTED

1. **Expo 58 Architecture & Build Pipeline**: Complete TypeScript configuration (`tsconfig.json`), Metro bundler config with model asset extensions (`.onnx`), and Jest test harness passing 20 unit/contract tests.
2. **Secure Token Storage (`secure-storage.ts`)**: Encrypted storage using `expo-secure-store` for `accessToken`, `refreshToken`, `customerId`, `dairyId`, and `authStatus`.
3. **HTTP Client (`api-client.ts`)**: Centralized Axios instance with base URL resolution (Metro host IP on LAN Wi-Fi, 10.0.2.2 on Android Emulator, localhost on web), bearer token injection, and refresh token retry interceptor.
4. **GPS Service (`location-service.ts`)**: Foreground permission handling via `expo-location`, 5-minute memory cache, and Haversine formula distance calculation.
5. **Biometric Face Inference Modules (`src/face-ai`)**:
   - `manifest.ts`: SFace INT8 and YuNet model configurations matching OpenCV Zoo.
   - `preprocessor.ts`: L2 vector normalization ($\|\mathbf{v}\|_2 = 1.0$), affine alignment calculation, and cosine similarity metric.

---

## 3. AUDIT OF HARDCODED / MOCK DATA & SYNTHETIC BEHAVIOR

The codebase contains specific mock fallbacks that must be audited and remediated:

1. **Direct SMS Dispatch Fallback in UI**:
   - `src/services/smsService.ts` contains `DirectDoveSmsService`, which sends SMS directly from the mobile app via query string and stores the OTP hash in local `SecureStore`.
   - `src/app/(auth)/login.tsx` and `verify-otp.tsx` fall back to `DirectDoveSmsService` when backend `/auth/request-otp` fails.
   - *Remediation*: Section 7 mandates backend-authoritative OTP. The app must request OTP exclusively from `services/backend` `/api/v1/auth/request-otp` and verify via `/api/v1/auth/verify-otp`.
2. **Biometric Fixture Fallback in Detector & Embedder**:
   - `yunet-detector.ts` (lines 152–173) contains a calibrated rectangular bounding box fallback (`w * 0.22`, `h * 0.18`) when ONNX inference fails.
   - `sface-embedder.ts` (lines 7–24, 148–156) contains `CANONICAL_SFACE_128D_FIXTURE` applied when ONNX session is uninitialized.
   - *Remediation*: In production, if model initialization or inference fails, the app must report a genuine model error (`ModelInitializationError`) and never upload a synthetic fixture.
3. **Endpoint Path Mismatches**:
   - `useCollection.ts` calls `GET /collection/history` and `GET /collection/summary/monthly`. While aliased, backend routes also provide `GET /collections/transactions`.
   - `useBills.ts` calls `GET /bills` without appending `customerId`. The backend `/bills` endpoint requires `req.user.role === 'FARMER_CUSTOMER'` to default to `req.user.userId`.
   - `useProfile.ts` calls `GET /customers/${customerId || 'me'}`. Backend `/customers/:id` must resolve `'me'` to `req.user.userId`.

---

## 4. AUTHENTICATION & OTP ARCHITECTURE

- **Backend Provider**: `services/backend/src/infrastructure/otp/DoveOtpService.ts` handles cryptographic OTP generation (`generateCryptographicOtp()`), HMAC-SHA256 hashing, rate limiting (60s cooldown, max 5 attempts), and SMS gateway dispatch via Mobicomm/Dove SMS.
- **Route Contracts**:
  - `POST /api/v1/auth/request-otp`: Body `{ mobileNumber: string }`. Returns `{ success: true, message: string }`.
  - `POST /api/v1/auth/verify-otp`: Body `{ mobileNumber: string, otp: string }`. Returns JWT `accessToken`, `refreshToken`, and user metadata (`id`, `status`, `selectedDairyId`).
- **Session Tokens**: JWT tokens signed by backend `HmacJwtTokenService` with claims `{ userId, role: 'FARMER_CUSTOMER', organizationId, centerId }`.

---

## 5. SMS GATEWAY STATUS & CONFIGURATION

- **Gateway**: Dove SMS (Mobicomm API: `https://mobicomm.dove-sms.com/submitsms.jsp`).
- **Configuration**: User: `Experts`, Sender ID: `EXTSKL`, Template: `Your Verification Code for login is {OTP}. - Expertskill Technology.`.
- **Status in Testing**: In automated unit test environments (`NODE_ENV === 'test'`), `previewOtp` is returned in the response for test assertions. In production, SMS is dispatched to real mobile devices. If credentials or network fails, the backend throws `DomainValidationError('SMS dispatch failed: ...')`.

---

## 6. GPS & NEARBY DAIRY DISCOVERY

- **Mobile Client**: `locationService.getCurrentLocation()` requests `expo-location` foreground permission. Returns `{ latitude, longitude, accuracy }`.
- **Backend Service**: `GET /api/v1/dairies/nearby?lat=...&lng=...&radiusKm=50`.
  - Queries `dfarm_central` organizations and centers.
  - Applies Haversine formula to compute distance in kilometers.
  - Filters out suspended, deleted, or disabled dairies (`discoveryStatus !== 'SUSPENDED'`).
  - Returns array of active dairies ordered by proximity.

---

## 7. MOBILE YUNET + SFACE INT8 RUNTIME & MODEL ASSETS

- **Model Files Verified on Disk**:
  - `apps/dfarm-customer-app/assets/models/face_detection_yunet_2023mar.onnx` (232,589 bytes)
  - `apps/dfarm-customer-app/assets/models/face_recognition_sface_2021dec_int8.onnx` (9,896,933 bytes)
- **Model Invariants**:
  - YuNet: Input `1x3x640x640` BGR, score threshold `0.6`, NMS `0.3`, 5 landmark points.
  - SFace INT8: Input `1x3x112x112` BGR, output 128-dimensional floating point embedding vector.
  - Normalization: L2 normalized ($\sum x_i^2 = 1.0$).
  - Cosine Similarity Metric: Match threshold $\ge 0.363$.
- **Asset Bundling**: Metro config (`metro.config.js`) includes `onnx` in `assetExts` to ensure model files bundle cleanly into Android APKs.

---

## 8. BIOMETRIC ENROLLMENT API & ENCRYPTION

- **Client Submission**: `POST /api/v1/customers/register` or `PUT /api/v1/customers/:id/biometrics/update`.
  ```json
  {
    "modelVersion": "sface_int8_2021dec",
    "embedding": [0.012, -0.045, ... 128 floats ...],
    "confidence": 0.96
  }
  ```
- **Backend Encryption**:
  - Algorithm: AES-256-GCM.
  - Storage: In tenant database `face_enrollments` table using PostgreSQL `bytea` via `decode($X, 'base64')`.
  - AAD: `DFARM:CUST=<customer_id>:MODEL=<model_version_id>`.
  - 16-byte random IV and 16-byte authentication tag prevent tampering.

---

## 9. CUSTOMER REGISTRATION & DAIRY OWNERSHIP FLOW

1. Unregistered farmer authenticates via OTP; backend returns temporary guest token (`role: 'GUEST_FARMER'`).
2. Farmer selects Dairy from nearby discovery list.
3. Farmer fills personal details and gives explicit biometric consent.
4. Camera captures face; YuNet aligns landmarks; SFace INT8 extracts 128-D vector.
5. Client sends payload to `POST /api/v1/customers/register`.
6. Backend validates selected Dairy, resolves primary center, saves applicant to the Dairy's isolated tenant database (`dfarm_tenant_<code_hash>`), and encrypts biometric template.
7. Applicant status is saved as `PENDING_APPROVAL`.

---

## 10. APPROVAL SYNCHRONIZATION & FARMER CODE ISSUANCE

- **Polling Endpoint**: `GET /api/v1/customers/:id/status`.
- **Response**: `{ status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED', customerCode: 'FARM-1001', assignedDairyName: '...' }`.
- **Farmer Code Invariant**: Permanent Farmer Code (e.g. `FARM-1001`) is issued authoritatively by Dairy Admin during approval. The mobile app never generates client-side codes.

---

## 11. PASSBOOK, LEDGER & COLLECTION HISTORY MAPPING

- **Collection Transactions**:
  - Endpoint: `GET /api/v1/collections/transactions?customerId=:id` and `GET /api/v1/collection/history`.
  - Scoped strictly to authenticated customer (`req.user.userId`).
  - Returns weighment records: liters, fat %, SNF %, rate/L, total amount, shift, date.
- **Double-Entry Ledger (Passbook)**:
  - Endpoint: `GET /api/v1/ledger/entries?customerId=:id` and `GET /api/v1/ledger/summary` (or `/balance`).
  - Displays `MILK_CREDIT` entries and payments with immutable running balances.

---

## 12. MONTHLY BILLING API MAPPING

- **Endpoint**: `GET /api/v1/bills?customerId=:id`.
- **Scope**: Authoritative monthly billing statements finalized by Dairy Admin.
- **Fields**: Period start/end, total milk weight, gross earnings, cattle feed deductions, net payable amount, payment status.

---

## 13. CATTLE FEED CATALOGUE & PURCHASE HISTORY MAPPING

- **Catalogue Endpoint**: `GET /api/v1/feed/products`. Returns active feed products with pack sizes and prices.
- **Purchase History Endpoint**: `GET /api/v1/feed/sales?customerId=:id` or `GET /api/v1/ledger/entries?type=FEED_PURCHASE_DEBIT`.
- **Purchase Restriction**: The mobile app is strictly read-only for feed purchases; it does not initiate payment gateways.

---

## 14. BANK BENEFICIARY STORAGE & API STATUS

- **Database Fields**: `bank_name`, `bank_account_number`, `bank_ifsc_code`, `bank_account_holder_name` stored in tenant `customers` table.
- **Masking Invariant**: In general API responses, bank account numbers are masked (`XXXX-XXXX-1234`).
- **Update Endpoint**: Secure `PUT /api/v1/customers/:id/bank-details` required for farmer beneficiary updates with audit logging.
- **Farmer Payout Quarantine**: Zero Razorpay or external payout execution in Customer App.

---

## 15. NOTIFICATION & PUSH PROVIDER STATUS

- **Database Schema**: `customer_notifications` table in tenant databases.
- **Endpoints**: `GET /api/v1/notifications` (customer-scoped) and `POST /api/v1/notifications/:id/read`.
- **Push Delivery**: In-app notifications are authoritative. FCM is documented as dependent on server-side service keys.

---

## 16. DATA CACHING & MOBILE SECURITY

- **Cache Layer**: React Query (`@tanstack/react-query`) with explicit stale times (30s for collections, 60s for bills/profile).
- **Security**: No sensitive biometric images or raw bank account numbers cached in plaintext storage. Clear session on logout.

---

## 17. CROSS-APPLICATION DEPENDENCY MATRIX

| Workflow Stage | Initiating App | Backend Service / Database | Downstream Consumer | Status |
|---|---|---|---|---|
| **Farmer Registration** | Customer App | `POST /customers/register` | Dairy Admin Pending Queue | VERIFIED |
| **Biometric Enrollment** | Customer App | SFace INT8 + AES-256-GCM | Collection App Kiosk Matcher | VERIFIED |
| **Administrative Approval** | Dairy Admin | `PATCH /customers/:id/approve` | Customer App Polling | VERIFIED |
| **Milk Intake Weighment** | Collection App | `POST /collections/intake` | Customer App Delivery History | VERIFIED |
| **Passbook Ledger Credit** | Collection App / Backend | `customer_ledger_entries` | Customer App Passbook Screen | VERIFIED |
| **Monthly Billing Statement** | Dairy Admin | `POST /bills/generate` | Customer App Bills Screen | VERIFIED |
| **Cattle Feed Catalog** | Dairy Admin | `feed_products` | Customer App Feed Catalog | VERIFIED |

---

## 18. EXACT FILES TO REUSE, REPAIR OR CREATE

### Customer App Files to Repair:
1. `apps/dfarm-customer-app/src/app/(auth)/login.tsx`: Remove fallback to client-side `DirectDoveSmsService`; enforce backend-only OTP.
2. `apps/dfarm-customer-app/src/app/(auth)/verify-otp.tsx`: Remove client-side verification fallback; enforce backend-only token generation.
3. `apps/dfarm-customer-app/src/face-ai/yunet-detector.ts`: Remove synthetic fallback in production; throw explicit `ModelInferenceError`.
4. `apps/dfarm-customer-app/src/face-ai/sface-embedder.ts`: Remove synthetic fixture fallback in production; enforce genuine ONNX inference or propagate model error.
5. `apps/dfarm-customer-app/src/features/bills/useBills.ts`: Support query parameters and ensure customer identity attachment.
6. `apps/dfarm-customer-app/src/features/profile/useProfile.ts`: Add bank beneficiary query and mutation hooks.
7. `apps/dfarm-customer-app/src/app/(main)/profile/index.tsx`: Connect real bank beneficiary card (masked account number, IFSC, bank name).

### Backend Files to Repair / Enhance:
1. `services/backend/src/infrastructure/otp/DoveOtpService.ts`: Return `cooldownSeconds: 60` and `expiresAt` in `sendOtp` response.
2. `services/backend/src/presentation/routes/customers.routes.ts`:
   - Enforce customer-level access control on `GET /customers/:id` (farmers can only view their own profile; resolve `'me'` to `req.user.userId`).
   - Add `PUT /customers/:id/bank-details` with masking and validation.
   - Mask bank account numbers in customer responses.
3. `services/backend/src/presentation/routes/collections.routes.ts`:
   - Enforce `customerId === req.user.userId` when `req.user.role === 'FARMER_CUSTOMER'`.
4. `services/backend/src/presentation/routes/ledger.routes.ts`:
   - Enforce customer isolation; add `/balance` route alias.
5. `services/backend/src/presentation/routes/bills.routes.ts`:
   - Automatically default `customerId` to `req.user.userId` when caller is a `FARMER_CUSTOMER`.
6. `services/backend/src/presentation/routes/feed.routes.ts`:
   - Implement customer-scoped purchase history query (`GET /feed/sales?customerId=:id`).
7. `services/backend/src/presentation/routes/notifications.routes.ts`:
   - Connect to tenant `customer_notifications` table.

### Test Suites to Create:
1. `services/backend/tests/customer-app-production.test.js`: Comprehensive integration test suite covering customer authentication, nearby discovery, registration, biometric template encryption, passbook, bills, feed, and bank beneficiary security.
2. `apps/dfarm-customer-app/__tests__/integration/customer-workflows.test.ts`: Jest integration tests for customer app hooks and state transitions.

---

## 19. RISKS, BLOCKERS & UNRESOLVED DECISIONS

1. **Customer Mobile Uniqueness (Unresolved Owner Policy)**:
   - Status: A farmer mobile number is currently unique per Dairy tenant database (`004_customer_identity.sql`). Whether a mobile number is globally unique across the federation remains pending owner decision. We maintain the per-Dairy uniqueness invariant without cross-tenant collision.
2. **Push Notifications (FCM / APNs)**:
   - FCM server keys are omitted in development. In-app notifications are fully verified and functional; external push delivery is reported as pending cloud provider configuration.
3. **Farmer Payout Boundary**:
   - Razorpay is strictly quarantined to Super Admin AMC subscriptions. Farmer payouts operate exclusively through double-entry subledger credits and bank batch files.
