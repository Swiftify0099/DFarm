# DFARM — PROMPT 05 HANDOFF
## OPERATIONAL HANDOFF FOR PROMPT 05: CUSTOMER APP (FARMER MOBILE EXPERIENCE) PRODUCTION READINESS

**Handoff Reference:** `DFARM-HANDOFF-PROMPT-05`  
**From:** Prompt 04 — Collection App / Kiosk Counter Production Readiness  
**To:** Prompt 05 — Customer App (Farmer Mobile Experience) Production Readiness  
**Target Repository:** `c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init`  
**Primary App Surface:** `apps/dfarm-customer-app` (React Native, Android-first) + `services/backend`  

---

## 1. BASELINE ARCHITECTURAL STATE AFTER PROMPT 04

The DFarm platform has achieved full production readiness for:
1. **Control Plane & Database-per-Dairy Provisioning (Prompt 01)**:
   - Central database `dfarm_central` manages organizations, database mappings, and operator identities.
   - Separate physical PostgreSQL databases (`dfarm_tenant_<code_hash>`) operate independently per dairy.
   - `TenantDatabaseManager` routes queries reliably and safely.
2. **Super Admin Platform Operations (Prompt 02)**:
   - Geolocation polygon bounds, hardware inventory allocation, 2FA admin activation, and AMC subscription management with Razorpay are operational.
3. **Dairy Admin Operational Platform (Prompt 03)**:
   - Farmer applicant registration approval and structured rejection workflows are live.
   - Shift session opening, active querying, and closing are connected to isolated tenant databases.
   - Dynamic rate charts with matrix and formula pricing are live.
   - Cattle feed inventory management and double-entry subledger recording (`customer_ledger_entries`) are verified.
4. **Milk Collection Kiosk Counter (Prompt 04)**:
   - Web Serial and WebUSB hardware drivers for RS232 continuous scales (`ScaleDriver`), ultrasonic milk analyzers (`MilkAnalyzerDriver`), RFID card scanners (`RfidReaderDriver`), and ESC/POS thermal printers (`ThermalPrinterDriver`).
   - 1:N OpenCV YuNet + SFace INT8 (128-dim) face template matching with AES-256-GCM encryption and calibrated match threshold $\ge 0.363$.
   - Offline intake queue (IndexedDB) with client-generated UUIDv4 idempotency keys and batch synchronization (`POST /api/v1/sync/push`).
   - Real-time subledger milk credit (`MILK_CREDIT`) posting on intake weighment.
   - Thermal receipt printing (58mm/80mm) with paper cut and Web Speech voice announcements.
5. **Monorepo Test Suite**:
   - Monorepo test suite passes **232/232 tests (100%)** across backend, database, and all four frontend applications.

---

## 2. PREREQUISITES & SCOPE FOR PROMPT 05

Prompt 05 focuses on making `apps/dfarm-customer-app` (the farmer mobile application built in React Native, Android-first) production-ready.

### 2.1 Prompt 05 Primary Objectives
1. **Farmer Onboarding & Registration Workflow**:
   - Connect farmer registration to `POST /api/v1/customers/register`.
   - Capture applicant name, mobile number, milk category preference (`COW`, `BUFFALO`, `BOTH`), bank account details (account number, IFSC code, account holder name), and optional selfie for face enrollment.
   - Support registration status polling via `GET /api/v1/customers/:id/status` (transitions from `PENDING_APPROVAL` to `APPROVED` or `REJECTED`).
2. **Real-Time Milk Delivery Passbook & Transaction History**:
   - Connect farmer dashboard and delivery history to `GET /api/v1/ledger/entries?customerId=:id` and `GET /api/v1/collections/transactions?customerId=:id`.
   - Render daily morning/evening milk weighments: date, shift, net weight (liters), fat %, SNF %, applied rate per liter, and total credit amount.
   - Display real-time outstanding ledger balance (`GET /api/v1/ledger/balance?customerId=:id`).
3. **Monthly Billing Statements & Settlement Breakdown**:
   - Query finalized billing statements via `GET /api/v1/bills?customerId=:id`.
   - Display billing period breakdown: gross milk supply, rate chart incentives, feed/advance deductions, and net payout status.
4. **Cattle Feed Catalog & Purchase Requests**:
   - Query available cattle feed products from dairy inventory (`GET /api/v1/feed/products`).
   - Allow farmers to submit feed purchase requests to be deducted from upcoming milk payouts.
5. **Multilingual Localization & Accessibility**:
   - Implement localized UI strings in Marathi (मराठी), Hindi (हिंदी), and English.
   - Ensure clean accessibility for rural farmers (large high-contrast text, clear status badges, and audio feedback).
6. **Strict Invariant: Zero Razorpay for Farmers**:
   - The Customer App must NOT import or integrate Razorpay for receiving farmer milk payouts.
   - Farmer payouts are strictly managed on the backend double-entry ledger and disbursed via bank batch transfers.

---

## 3. COMPLETED REPOSITORIES & ENDPOINTS READY FOR PROMPT 05 CONSUMPTION

| Endpoint | Method | Expected Consumer in Prompt 05 | Contract Status |
|---|---|---|---|
| `/api/v1/customers/register` | `POST` | Farmer onboarding screen | VERIFIED LIVE |
| `/api/v1/customers/:id/status` | `GET` | Registration status polling screen | VERIFIED LIVE |
| `/api/v1/customers/:id` | `GET` | Farmer profile screen | VERIFIED LIVE |
| `/api/v1/ledger/entries?customerId=:id` | `GET` | Farmer passbook / ledger history screen | VERIFIED LIVE |
| `/api/v1/ledger/balance?customerId=:id` | `GET` | Farmer home screen balance card | VERIFIED LIVE |
| `/api/v1/collections/transactions?customerId=:id` | `GET` | Milk delivery history screen | VERIFIED LIVE |
| `/api/v1/bills?customerId=:id` | `GET` | Monthly billing & settlement screen | VERIFIED LIVE |
| `/api/v1/feed/products` | `GET` | Cattle feed store catalog screen | VERIFIED LIVE |
| `/api/v1/rate-charts?centerId=:centerId` | `GET` | Transparent milk rate chart viewer | VERIFIED LIVE |

---

## 4. INVARIANTS & POLICIES TO MAINTAIN IN PROMPT 05

1. **Claymorphism UI Styling & Visual Tokens**:
   - Maintain the approved dairy color palette (`#FF6A00` Saffron accent, `#211B18` Cocoa Slate text, `#FFF5EE` Cream background, `#FFFFFF` Cards).
   - Preserve soft clay shadows, rounded card geometries (`borderRadius: 16`), and warm typography.
2. **Tenant Database Scoping**:
   - The customer app communicates with the shared backend supplying the farmer's Bearer token.
   - The backend resolves the dairy tenant database automatically; the mobile app never needs to know the database connection URI or PostgreSQL cluster topography.
3. **Double-Entry Financial Accuracy**:
   - All balance displays must match the underlying `customer_ledger_entries` sum. Never calculate or invent balances client-side.
4. **Offline Caching for Rural Connectivity**:
   - Cache recent delivery history and balance in AsyncStorage or SQLite for instant rendering in areas with spotty cellular coverage.
