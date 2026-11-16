# DFarm — Comprehensive Backend Audit Report

**Date:** 2026-11-15  
**Audit Scope:** DFarm Monorepo — Backend Services, Database Architecture, Frontend Integration Contracts, Security, and Offline Synchronization  
**Status:** Complete Read-Only Analysis (Phase 1 Deliverable)

---

## Executive Summary

DFarm is an enterprise dairy management platform comprising four core applications:
1. **DFarm Collection App — React Web (`apps/dfarm-collection-app` / Vite + React)**: Counter kiosk terminal for high-throughput milk intake, triple-identification (YuNet/SFace Face Recognition $\rightarrow$ RFID $\rightarrow$ Manual Override), scale/lactometer telemetry, and offline-first queueing.
2. **DFarm Customer Mobile App (`apps/dfarm-customer-app` / Expo / React Native)**: Self-service portal for dairy farmers to monitor deliveries, rates, passbooks, and payments.
3. **DFarm Dairy Admin Web (`apps/dfarm-dairy-admin` / Vite + React)**: Administrative portal for dairy owners, managers, and accountants.
4. **DFarm Super Admin Web (`apps/dfarm-super-admin` / Vite + React)**: Multi-tenant platform administration for managing dairy organizations.

A comprehensive read-only audit of the newly built DFarm workspace was conducted. While significant database migrations (26 SQL files, 90+ tables) and partial backend modules exist in `services/backend`, **the current backend violates Clean Architecture principles, exhibits critical security backdoors, contains severe contract mismatches with the frontend, and relies on mock/fake data generators.**

The immediate implementation scope is the **Collection App Backend**. This report details the audit findings and establishes the technical basis for the Clean Architecture proposal.

---

## 1. Current Architecture

```
DFarm Workspace/
├── apps/
│   ├── dfarm-collection-app/     # High-speed intake counter terminal (React + Vite)
│   ├── dfarm-customer-app/       # React Native / Expo self-service mobile app
│   ├── dfarm-dairy-admin/        # Dairy owner & center manager portal (React + Vite)
│   └── dfarm-super-admin/        # Central platform multi-tenant portal (React + Vite)
├── services/
│   └── backend/                  # Node.js + Express + TypeScript REST API
├── packages/
│   ├── database/                 # Migration test runner & schema verification
│   ├── shared-types/             # Monorepo shared TypeScript domain interfaces
│   └── shared-validation/        # Zod validation schemas
├── supabase/
│   └── migrations/               # 26 PostgreSQL migration files (001 - 026)
├── docs/                         # Specifications & historical phase documentation
├── dfarm-collection-app/         # Stale / partial duplicate of apps/dfarm-collection-app
```

### Architectural Deficiencies Identified:
1. **Absence of Clean Architecture Layers:**
   The backend in `services/backend` is structured as a conventional, tightly coupled MVC/module pattern (`modules/{auth, collections, sync, rates, ledger, ...}`), where route handlers invoke monolithic services that directly execute raw SQL queries (`pool.query(...)`). There is no Domain layer, no Entity business invariants, no Use Case / Application ports, and no Repository abstraction.
2. **Dual Conflicting Database Clients:**
   The backend simultaneously initializes:
   - `pg.Pool` (`services/backend/src/config/db.ts`) for raw parameterized SQL queries.
   - `@supabase/supabase-js` (`services/backend/src/config/supabase.ts`) using the administrative `SERVICE_ROLE_KEY` (bypassing PostgreSQL Row-Level Security).
   Different modules use different clients without a unified transaction coordinator.
3. **Heavy Reliance on Stored Procedures vs Domain Logic:**
   Critical business rules (rate determination, session state transitions, double-entry financial ledger postings) are buried inside complex PL/pgSQL stored procedures (`create_milk_collection_session`, `complete_milk_collection_session`, `get_applicable_milk_rate`). This prevents test-driven domain modeling in TypeScript, conceals errors behind generic SQL exceptions, and makes portability impossible.

---

## 2. Existing Backend Status

| Module / Component | Current Implementation Status | Clean Architecture Compliance | Audit Verdict |
| :--- | :--- | :--- | :--- |
| **Authentication (`auth`)** | Partial Express controller & service. Supports username staff login and Supabase customer SMS OTP. | **Violated** (Controller $\rightarrow$ Raw SQL / Supabase SDK). Hardcoded fallback users. | **Critical Repair Required** |
| **Milk Collections (`collections`)** | 3-step stateful flow (`/sessions`, `/measurements`, `/complete`). Invokes PL/pgSQL RPCs. | **Violated** (Direct `pool.query`, tightly coupled to notifications). | **Redesign into Use Cases** |
| **Rate Management (`rates`)** | Comprehensive grid matrix CRUD and cell lookup. Exact cell matching only. | **Violated** (811-line service with embedded raw SQL strings). | **Refactor into Domain / Repositories** |
| **Customer Directory (`customers`)** | CRUD operations, soft-delete, address management. | **Violated** (Direct Supabase service-role client queries). | **Refactor into Clean Use Cases** |
| **Biometrics (`biometrics`)** | AES-256-GCM template encryption, template retrieval. | **Violated** (Hardcoded 512-dim ArcFace instead of approved 128-dim SFace). | **Critical Bug — Model Mismatch** |
| **RFID Management (`rfid`)** | RFID card mapping, activation, deactivation, lookup. | **Violated** (Direct raw SQL queries). | **Refactor into Repository Pattern** |
| **Offline Sync Gateway (`sync`)** | Push/pull cursor engine with conflict logging. | **Violated** (766-line monolithic service generating fake rate charts on the fly). | **Critical Repair Required** |
| **Customer Ledger (`ledger`)** | 1061-line double-entry accounting service. | **Violated** (Direct raw SQL queries, tightly coupled). | **Keep DB guarantees, Clean Up App Layer** |
| **Device Telemetry (`devices`)** | Basic registration, revocation, and heartbeat routes. | **Violated** (Does not match Collection Kiosk telemetry shape). | **Update API Contract** |

---

## 3. Frontend-to-Backend Contract Inventory (Collection App)

The Collection Web App (`apps/dfarm-collection-app`) currently interacts with `src/api/mock-backend.ts`. The inventory below details the exact contracts expected by the frontend and the corresponding backend mismatch:

### A. Operator Authentication
- **Contract 1: Request Operator OTP**
  - **Frontend Call:** `MockCollectionBackend.sendOtp(mobileNumber: string)`
  - **HTTP Method & Route:** `POST /api/v1/auth/otp/send`
  - **Frontend Payload:** `{ "mobileNumber": "9876543210" }`
  - **Frontend Expected Response:** `{ "success": true, "message": "OTP dispatched...", "previewOtp": "849201" }`
  - **Existing Backend Route:** `POST /api/v1/auth/otp/send` expects `{ "phone": "+91..." }` and only sends customer OTP via Supabase SMS.
  - **Mismatch:** Payload key mismatch (`mobileNumber` vs `phone`), actor mismatch (Customer vs Operator), and missing operator validation against the dairy staff registry.

- **Contract 2: Verify Operator OTP & Session Resolution**
  - **Frontend Call:** `MockCollectionBackend.verifyOtp(mobileNumber: string, code: string)`
  - **HTTP Method & Route:** `POST /api/v1/auth/otp/verify`
  - **Frontend Payload:** `{ "mobileNumber": "9876543210", "otp": "849201" }`
  - **Frontend Expected Response:**
    ```json
    {
      "id": "op-02",
      "mobileNumber": "9876543210",
      "fullName": "Sachin Ananda Patil",
      "dairyId": "dairy-ten-9801",
      "dairyName": "Gokul Dairy Farmers Cooperative",
      "dairyCode": "DF-GOKUL-01",
      "role": "COLLECTION_OPERATOR",
      "sessionToken": "dfarm_jwt_eyJhbGciOi...",
      "activeSessionId": "ses-2026-11-15-e"
    }
    ```
  - **Existing Backend Route:** `POST /api/v1/auth/otp/verify` expects `{ "phone": "...", "token": "..." }` and returns `{ "session": { ... } }` (Supabase auth session).
  - **Mismatch:** Total response schema mismatch. Collection App cannot deserialize operator session or establish tenant context.

### B. Active Kiosk Shift Session
- **Contract 3: Get Active Shift Session**
  - **Frontend Call:** `MockCollectionBackend.getActiveSession()`
  - **HTTP Method & Route:** `GET /api/v1/collections/sessions/active`
  - **Frontend Expected Response:**
    ```json
    {
      "id": "ses-2026-11-15-e",
      "sessionCode": "SES-2026-11-15-E",
      "dairyId": "dairy-ten-9801",
      "date": "2026-11-15",
      "shift": "EVENING",
      "status": "OPEN",
      "openedAt": "2026-11-15T17:00:00Z",
      "openingOperatorName": "Sachin Ananda Patil",
      "deviceId": "DF-KIOSK-001",
      "deviceName": "Gokul Main Collection Kiosk #1",
      "totals": {
        "totalLiters": 245.0,
        "cowLiters": 160.0,
        "buffaloLiters": 85.0,
        "transactionCount": 16,
        "totalAmount": 11140.0,
        "averageFat": 4.75,
        "averageSnf": 8.72
      }
    }
    ```
  - **Existing Backend Route:** No such endpoint. Backend has `POST /api/v1/collections/sessions` which creates a *per-farmer delivery session*, and `GET /api/v1/collections/shift-summary` which returns raw sums.
  - **Mismatch:** Missing domain concept of a Kiosk Shift Session.

- **Contract 4: Close Shift Session**
  - **Frontend Call:** `MockCollectionBackend.closeSession(operatorName: string)`
  - **HTTP Method & Route:** `POST /api/v1/collections/sessions/active/close`
  - **Frontend Expected Response:** Closed `ActiveCollectionSession` with `closedAt` timestamp and `closingOperatorName`.
  - **Existing Backend Route:** Does not exist.

### C. Customer Directory & Lookup
- **Contract 5: Search & List Customers**
  - **Frontend Call:** `MockCollectionBackend.getCustomers(search?: string)`
  - **HTTP Method & Route:** `GET /api/v1/customers`
  - **Frontend Fields Used:** `id`, `customerCode`, `fullName`, `mobileNumber`, `village`, `preferredCategory`, `status`, `balanceDue`, `biometric: { templateVersion, qualityScore, modelVersion, consentVerified }`, `rfidCardUid`, `lastDelivery`.
  - **Existing Backend Route:** `GET /api/v1/customers` returns `CustomerProfile` with `farmerCode`, `normalizedMobileNumber`, `address: { village }`, etc.
  - **Mismatch:** Field name discrepancies (`customerCode` vs `farmerCode`, `mobileNumber` vs `normalizedMobileNumber`, missing `balanceDue` and `lastDelivery` in default projection).

- **Contract 6: Resolve Customer by RFID**
  - **Frontend Call:** `MockCollectionBackend.getCustomerByRfid(cardUid: string)`
  - **HTTP Method & Route:** `GET /api/v1/rfid/lookup/:cardUid` or `POST /api/v1/rfid/lookup`
  - **Existing Backend Route:** `POST /api/v1/rfid/lookup` exists and returns mapped customer.
  - **Mismatch:** Minor payload format alignment needed.

### D. Authoritative Collection Intake Submission
- **Contract 7: Submit Intake Transaction**
  - **Frontend Call:** `MockCollectionBackend.submitTransaction(params)`
  - **HTTP Method & Route:** `POST /api/v1/collections/transactions` (Atomic Intake)
  - **Frontend Payload:**
    ```json
    {
      "customerId": "cust-101",
      "milkCategory": "COW",
      "weightLiters": 14.5,
      "fat": 4.2,
      "snf": 8.7,
      "clrDensity": 29.5,
      "identificationMethod": "FACE_YUNET_SFACE",
      "operatorName": "Sachin Ananda Patil",
      "idempotencyKey": "intake-uuid-...",
      "isOffline": false
    }
    ```
  - **Frontend Expected Response:**
    ```json
    {
      "id": "txn-1731670000",
      "transactionCode": "COL-670000",
      "sessionId": "ses-2026-11-15-e",
      "dairyId": "dairy-ten-9801",
      "customerId": "cust-101",
      "customerCode": "C-101",
      "customerName": "Pandurang Mahadev Patil",
      "timestamp": "2026-11-15T17:35:00Z",
      "date": "2026-11-15",
      "shift": "EVENING",
      "milkCategory": "COW",
      "weightLiters": 14.5,
      "fatPercentage": 4.2,
      "snfPercentage": 8.7,
      "clrDensity": 29.5,
      "appliedRatePerLiter": 42.14,
      "rateChartVersion": 2,
      "totalAmount": 611.03,
      "identificationMethod": "FACE_YUNET_SFACE",
      "syncStatus": "SYNCED_CLOUD",
      "deviceId": "DF-KIOSK-001",
      "operatorName": "Sachin Ananda Patil"
    }
    ```
  - **Existing Backend Route:** Backend enforces a 3-step stateful flow:
    1. `POST /api/v1/collections/sessions`
    2. `POST /api/v1/collections/sessions/:id/measurements`
    3. `POST /api/v1/collections/sessions/:id/complete`
  - **Mismatch:** Severe operational mismatch. The collection counter requires atomic 1-call intake when submitting readings, returning the calculated amount, applied rate version, ledger update, and receipt code in a single round-trip.

### E. Hardware Telemetry & Diagnostics
- **Contract 8: Get Kiosk Peripherals Telemetry**
  - **Frontend Call:** `MockCollectionBackend.getDevices()`
  - **HTTP Method & Route:** `GET /api/v1/devices/telemetry`
  - **Frontend Expected Response:** Array of `HardwareDevice` objects (`CAMERA`, `FACE_MODEL`, `RFID_READER`, `MILK_ANALYZER`, `DIGITAL_SCALE`, `CLOUD_NETWORK`).
  - **Existing Backend Route:** `GET /api/v1/devices` returns database device records, not operational telemetry.

### F. Offline Sync Queue Flushing
- **Contract 9: Sync Push Offline Collection Transactions**
  - **Frontend Call:** `localDB.getOfflineQueue()` $\rightarrow$ flush
  - **HTTP Method & Route:** `POST /api/v1/sync/push`
  - **Frontend Payload:** Array of offline queue items.
  - **Existing Backend Route:** `POST /api/v1/sync/push` expects `{ deviceId, events: [ { id, entityType: "MILK_COLLECTION", payload: { ... } } ] }`.
  - **Mismatch:** Event payload structure must match `CollectionTransaction` attributes.

---

## 4. Existing Database Structure

The database schema defined in `supabase/migrations/` is comprehensive (90+ tables) and possesses strong relational integrity.

### Verified Database Strengths:
1. **Zero Floating-Point Types:** All financial amounts, milk rates, weights, fat, and SNF percentages strictly use `NUMERIC(10,2)`, `NUMERIC(12,2)`, or `NUMERIC(5,2)`. No `FLOAT` or `REAL` types exist.
2. **UUID Primary Keys:** All tables enforce UUID primary keys with `DEFAULT gen_random_uuid()`.
3. **Double-Entry Financial Isolation:** The customer ledger (`customer_ledger_accounts`, `ledger_transactions`, `ledger_entries`) enforces debit/credit balance equality and restricts cascading deletes (`ON DELETE RESTRICT`).
4. **Idempotency Keys:** Unique indexes exist on `milk_collections(idempotency_key)` and `ledger_transactions(idempotency_key)`.
5. **Multi-Tenant Scoping:** Unique constraints (such as customer mobile numbers and RFID card UIDs) are scoped by `organization_id` (or `center_id`), avoiding global collisions across independent dairies.
6. **Row-Level Security (RLS):** Enabled across all tables with tenant isolation policies.

### Database Deficiencies & Inconsistencies:
1. **Migration Index Drift:** `packages/database/src/index.ts` hardcodes file names that do not match `supabase/migrations/` (e.g. `012_milk_collection_workflow_and_atomic_ledger.sql` vs actual `017_milk_collection_workflow_and_atomic_ledger.sql`).
2. **Missing Kiosk Shift Session Table:** The schema has `collection_shifts` (operating hours definitions) and `collection_sessions` (individual customer deliveries), but lacks an explicit `kiosk_shift_sessions` table to track the terminal's open/close shift lifecycle and operator handover.
3. **Face Model Seed Mismatch:** Migration `013_face_model_version_metadata.sql` seeds `MobileFaceNet-ArcFace` (512-dim) instead of `OpenCV YuNet + SFace INT8` (128-dim).

---

## 5. Critical Bugs

1. **Biometric Embedding Dimension Mismatch:**
   - `services/backend/src/biometric/encryption.ts` line 29: `EXPECTED_EMBEDDING_DIM = 512`.
   - `services/backend/src/biometric/model-service.ts` line 26: `embeddingDimension: 512`.
   - Approved model is **OpenCV SFace INT8**, which generates **128-dimensional** embeddings. Any attempt to encrypt or match genuine SFace vectors throws an unhandled `INVALID_EMBEDDING_DIMENSION` error.
2. **JWT Signature Bypass in Test Environment:**
   - `services/backend/src/jwt.ts` lines 67-69: Signature mismatches are suppressed when `NODE_ENV === 'test'`.
   - Lines 48-50: Any valid UUID string is treated as a valid token without checking signature or expiration.
3. **Hardcoded Fallback Staff Credentials:**
   - `services/backend/src/modules/auth/auth.service.ts` lines 120-186: Hardcoded mock accounts (`officer_kolhapur`, `operator_tasgaon`, `owner_kolhapur`, `owner_sangli`) are returned whenever database queries fail or are unavailable.
4. **Staff Login Without Password Verification:**
   - `services/backend/src/modules/auth/auth.service.ts` lines 105-113: Staff login queries users by username alone. No password hash, salt, or verification takes place.
5. **Exact Rate Cell Failure (No Fallback or Two-Axis Formula):**
   - In `RateService.calculateRate` (`rate.service.ts`), if an exact matrix cell does not exist for a given (Fat, SNF) pair, the service throws `RATE_CELL_NOT_FOUND` (404), blocking milk intake. In contrast, the dairy collection workflow requires a fallback two-axis formula when matrix cells are not populated.
6. **Frontend Broken Build & Default Vite Screen:**
   - Root `dfarm-collection-app` contains the default Vite template (`App.tsx` has count button).
   - The actual implementation in `apps/dfarm-collection-app` fails `tsc -b` compilation due to type mismatch errors in `ClayBadge`, `ClayButton`, and `ClayModal`.
7. **Offline Sync Data Loss Simulation:**
   - `apps/dfarm-collection-app/src/pages/sync/OfflineQueueView.tsx` line 47 deletes items from IndexedDB during `handleSyncNow` without actually transmitting them to the server.

---

## 6. Security Risks

1. **Privilege Escalation via Unchecked Token Claims:**
   - In `authenticate.ts` lines 124-150: If the user is not found in the database, the middleware accepts role claims directly from the unverified JWT payload (`decodedToken['role']`, `decodedToken['organizationId']`) and sets `userSupabaseClient: adminClient` (service role).
2. **Service Role Key Exposure Risk:**
   - `services/backend/src/config/env.ts` contains hardcoded fallback Supabase service-role keys.
   - Modules widely import `getAdminSupabaseClient()`, bypassing PostgreSQL Row-Level Security for routine queries instead of executing under the authenticated tenant's RLS policy.
3. **Missing Authentication on Collection App Login:**
   - Currently, the collection app has no backend-connected authentication. Any user can click "Operator Preset" and access the intake terminal.
4. **Lack of Rate Limiting on OTP Endpoints:**
   - `/api/v1/auth/otp/send` lacks IP and phone-based rate limiting, enabling SMS flooding and brute-force attacks.

---

## 7. Data Consistency Risks

1. **Client-Side Financial Calculations:**
   - The collection frontend calculates rates and total amounts in `mock-backend.ts` and `TransactionSummaryPanel.tsx`. If the frontend amount is trusted, malicious or buggy clients could credit arbitrary amounts to customer ledgers.
   - **Correction:** The backend must be the sole authority for rate version resolution, amount calculation, and ledger credits.
2. **Unit Inconsistency (Liters vs. Kilograms):**
   - The collection app frontend operates in Liters (`weightLiters`).
   - The backend rate engine (`rate.service.ts`) rejects any unit other than `KG` (`MEASUREMENT_UNIT_MISMATCH`).
   - Density conversion ($M = V \times D$, where $D = \text{CLR}/1000 + 1$) must be applied consistently.
3. **Silent Rate Chart Creation in Sync Service:**
   - `services/backend/src/modules/sync/sync.service.ts` lines 264-278 automatically inserts a dummy "Standard Rate Chart" if no active chart is found for an organization during offline sync. This creates invalid financial transactions with arbitrary rates.

---

## 8. Performance Problems

1. **Monolithic In-Memory Sync Processing:**
   - `SyncService.pushEvents` iterates sequentially over all events in a batch within a single database transaction, creating long-lived transaction locks and savepoints (`SAVEPOINT sp_evt_X`). A large offline batch could exhaust database connection pools and cause lock timeouts.
2. **Missing Database Connection Pooling Tuning:**
   - `services/backend/src/config/db.ts` configures `max: 10` connections with no health check or statement timeout.
3. **Repeated Redundant Queries in Loop:**
   - In `sync.service.ts`, individual queries are executed per event for shift resolution, rate chart lookup, customer lookup, and permitted categories.

---

## 9. Missing Functionality

1. **Kiosk Shift Session Management API:**
   - No endpoints to open a shift, query the active shift session with live aggregates (total volume, cow/buffalo split, average fat/SNF), or close a shift with a printed summary.
2. **Atomic Milk Intake Transaction Endpoint:**
   - No single-round-trip endpoint that validates readings, computes rate, updates aggregates, posts to the ledger, and returns receipt data atomically.
3. **Real Operator Mobile OTP Flow:**
   - No backend flow to dispatch and verify OTPs for registered dairy collection operators and shift supervisors.
4. **Hardware Telemetry Health Monitoring:**
   - No endpoint for the kiosk to report and query the health and status of connected peripherals (weighing scale, analyzer, camera, RFID reader).
5. **Biometric Face Template Sync for YuNet/SFace INT8 (128-dim):**
   - No endpoint to retrieve 128-dim encrypted templates for local WASM/ONNX browser-based matching.

---

## 10. Duplicate or Unnecessary Code

1. **Duplicate Collection App Folder:**
   - `dfarm-collection-app/` in the workspace root is a stale, incomplete duplicate of `apps/dfarm-collection-app/`.
2. **Duplicate Validation Logic:**
   - Biological bounds (Fat min/max, SNF min/max) are defined in 3 separate places: `packages/shared-validation`, `center_settings` database table, and hardcoded in `collection.service.ts`.
3. **Dead Legacy Expo Code:**
   - Git working tree indicates hundreds of deleted files from obsolete Expo apps (`apps/collection-expo`, `apps/registration-expo`, `apps/admin-web`), while active development has moved to `apps/dfarm-*`.

---

## 11. What Can Be Preserved

1. **PostgreSQL Database Migrations (`supabase/migrations/`):**
   - The relational architecture (90+ tables) is robust. Table schemas for `organizations`, `dairy_centers`, `customers`, `customer_ledger_accounts`, `ledger_transactions`, `rate_charts`, `devices`, and `sync_events` are sound and should be retained.
2. **Shared Types & Validation Packages:**
   - `packages/shared-types` and `packages/shared-validation` provide a solid domain vocabulary and Zod schemas that can be reused across layers.
3. **Collection App UI & Styling:**
   - The Claymorphism UI design, components (`ClayCard`, `ClayButton`, `ClayTable`, `ClayBadge`), and workspace layout in `apps/dfarm-collection-app` are well-structured and approved. They must be preserved.

---

## 12. What Needs Repair

1. **Face Biometric Configuration:**
   - Correct embedding dimension from 512 to **128** across `encryption.ts`, `model-service.ts`, and database seed data (`YuNet-v1.0 + SFace-INT8-v1.0`).
2. **Collection App Compilation Errors:**
   - Fix TypeScript prop mismatches in `apps/dfarm-collection-app` (`BadgeVariant`, `ClayModalProps`) so the frontend compiles cleanly.
3. **Workspace Package Dependencies:**
   - Install missing root devDependencies (`supertest`, `pg-mem`, etc.) to restore automated test capabilities.

---

## 13. What Needs a New Implementation

1. **Clean Architecture Backend Core (`services/backend`):**
   - Build a modular, layered backend adhering strictly to Clean Architecture:
     - **Domain Layer:** Entities, Value Objects, Business Invariants, Domain Errors.
     - **Application Layer:** Use Cases (Commands/Queries), DTOs, Repository Ports.
     - **Infrastructure Layer:** PostgreSQL Repositories, Encryption Adapters, Supabase Adapters.
     - **Presentation Layer:** Versioned Express API Controllers (`/api/v1/...`), Middlewares, Validators.
2. **Operator & Dairy Authentication Flow:**
   - Genuine mobile OTP request and verification for dairy staff/operators with JWT session issuance.
3. **Kiosk Shift Session Management Module:**
   - Use cases: `StartShiftSession`, `GetActiveShiftSession`, `CloseShiftSession`.
4. **Atomic Milk Intake Transaction Module:**
   - Use case: `ProcessMilkIntake` — atomic rate calculation, duplicate prevention, transaction recording, and double-entry ledger posting.
5. **Authoritative Rate Engine Port:**
   - Use case: `CalculateMilkRate` — supports both exact grid lookup and configurable two-axis formulas.
6. **Robust Offline Sync Gateway:**
   - Use case: `ProcessSyncBatch` — idempotent processing of offline intake records without dummy rate injection.

---

## 14. Priority Classification

| Priority | Issue / Task | Impact |
| :--- | :--- | :--- |
| **CRITICAL** | Remove JWT signature bypass in `jwt.ts` and hardcoded fallback accounts in `auth.service.ts` | Eliminates critical security vulnerabilities. |
| **CRITICAL** | Fix biometric embedding dimension (512 $\rightarrow$ 128) for OpenCV SFace INT8 | Unblocks real face recognition and template storage. |
| **CRITICAL** | Implement atomic backend milk intake endpoint (`ProcessMilkIntake`) | Ensures server-authoritative financial calculations and atomic ledger updates. |
| **HIGH** | Implement operator OTP authentication and session resolution | Enables genuine login for the Collection Web App. |
| **HIGH** | Implement Kiosk Shift Session management (`/sessions/active`, `/close`) | Fulfills frontend shift reconciliation requirements. |
| **HIGH** | Implement clean Clean Architecture layers (Domain, Application, Infrastructure, Presentation) | Eliminates code rot, raw SQL inside controllers, and service bloat. |
| **HIGH** | Fix Collection App frontend build errors (`BadgeVariant`, `ClayModal`) | Restores end-to-end frontend buildability. |
| **MEDIUM** | Align frontend-to-backend API contracts (naming, shapes, pagination) | Eliminates runtime communication mismatches. |
| **MEDIUM** | Clean up duplicate `dfarm-collection-app` directory in workspace root | Prevents developer confusion and stale code imports. |
| **LOW** | Hardware Web Serial / WebUSB browser driver contracts documentation | Documents client-side peripheral integration boundaries. |

---

*End of Phase 1 Deliverable — docs/backend/BACKEND_AUDIT_REPORT.md*
