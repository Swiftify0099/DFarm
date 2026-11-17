# DFARM PLATFORM — CROSS-APPLICATION ROOT CAUSE ANALYSIS REPORT

**Platform Status:** FUNCTIONALITY INTEGRATION AUDIT  
**Date:** 2026-11-16  
**Applications Audited:**
1. DFarm Customer App (React Native Android / Expo)
2. DFarm Dairy Admin Web (React 19 / Vite / Tailwind)
3. DFarm Collection App (React 19 / Vite / Kiosk UI)
4. DFarm Super Admin Web (React 19 / Vite)
5. DFarm Backend APIs & Database (Node.js Express / Clean Architecture / PostgreSQL & pg-mem)

---

## 1. EXECUTIVE SUMMARY

The DFarm platform was built with an advanced Clean Architecture backend and specialized frontend apps for Farmers (Customer App), Dairy Administrators (Dairy Admin), and Kiosk Operators (Collection App). However, end-to-end operational execution failed in practice due to a pervasive split:
1. **Mock Data Bridge in Dairy Admin:** An in-memory mock server (`apps/dfarm-dairy-admin/src/api/mock-server.ts`, ~2,683 lines) was created with hardcoded entities, fixed identifiers, and static state machines.
2. **Merging & Fallback to Fake Records:** The Dairy Admin API bridge (`apps/dfarm-dairy-admin/src/api/index.ts`) was systematically configured either to call `MockDairyBackend` directly or to merge mock arrays into actual backend HTTP responses, making real database state invisible or contaminated with fake data.
3. **Hardcoded Tenant Identity & Defaults:** The backend authentication use-cases (`AdminAuthUseCases.ts`) and mock seeds hardcoded `Gokul Primary Cooperative` (`GOKUL-01` / `00000000-0000-0000-0000-000000000001` / `dairy-ten-9801`) as fallback identity. Moreover, JWT tokens issued to admins failed to include `organizationId` in their claims, leading downstream handlers to default back to the Gokul tenant.
4. **Disconnected Modules:** Critical Dairy Admin modules—including Face Enrollment Lifecycle, RFID Card Registry, and Collection Sessions—had no dedicated live endpoints in the primary `cleanApiRouter`, forcing the frontend to read exclusively from `MockDairyBackend`.
5. **Cross-Application Desynchronization:** While Collection App opens real sessions and records real milk transactions into `kiosk_shift_sessions` and `milk_collections`, Dairy Admin was monitoring `MockDairyBackend.getCollectionSessions()`. Similarly, when a customer registered via Customer App, Dairy Admin merged fake pending records into the list, and approvals updated local mock state rather than linking to Collection App kiosks.

---

## 2. DETAILED ROOT CAUSE BREAKDOWN BY MODULE

### A. Incorrect Dairy Identity ("Gokul Primary Cooperative", "GOKUL-01", "Isolated Dairy Management Platform")

- **Symptoms:**
  Dairy Admin continuously displays `Gokul Primary Cooperative` and `GOKUL-01`, regardless of which dairy admin is logged in or what dairy tenant context should be active. The subtitle displays `Isolated Dairy Management Platform`.
- **Root Causes:**
  1. **Backend Auth Use Case Fallback (`services/backend/src/application/use-cases/auth/AdminAuthUseCases.ts:64-67`):**
     ```typescript
     let adminName = isPankaj ? 'Pankaj Popat Yewale' : 'Dairy Administrator';
     let dairyId = '00000000-0000-0000-0000-000000000001';
     let dairyName = 'Gokul Primary Cooperative';
     let dairyCode = 'GOKUL-01';
     ```
     When an admin logs in, if user lookup does not resolve an explicit organization or errors out, it falls back to hardcoded Gokul credentials.
  2. **Missing `organizationId` in JWT Claims (`AdminAuthUseCases.ts:88-92`):**
     ```typescript
     const token = this.tokenService.signToken({
       userId: `admin:${phone.e164}`,
       role: isPankaj ? 'super_admin' : 'dairy_admin',
       actorType: 'STAFF',
     }, 24 * 3600);
     ```
     The signed JWT token payload omits `organizationId` and `centerId`. Consequently, `authenticate` middleware sets `req.user.organizationId = undefined`. Subsequent route handlers defaulted to the hardcoded Gokul UUID (`00000000-0000-0000-0000-000000000001`).
  3. **Database Seed (`services/backend/src/infrastructure/database/PostgresPool.ts:250-252`):**
     The database initialization specifically bound user `superadmin_7755995615` (Pankaj Popat Yewale) to `dairyAId` (`00000000-0000-0000-0000-000000000001` - Gokul Primary Cooperative).
  4. **Frontend Mock Server Constant (`apps/dfarm-dairy-admin/src/api/mock-server.ts:30-35`):**
     `CURRENT_DAIRY_ID = 'dairy-ten-9801'`, seeded with `SEED_DAIRY` named `Gokul Dairy Farmers Cooperative` (`DF-GOKUL-01`).
  5. **Frontend API Bridge Fallback (`apps/dfarm-dairy-admin/src/api/index.ts:39-41`):**
     `verifyOtp` defaults `dairyId: data.user?.dairyId || CURRENT_DAIRY_ID`.
  6. **Hardcoded Subtitle (`apps/dfarm-dairy-admin/src/components/layout/Header.tsx:57-59`):**
     ```tsx
     <p className="text-[11px] text-[#817A75] font-medium hidden sm:block">
       Isolated Dairy Management Platform
     </p>
     ```
     This static subtitle was rendered unconditionally instead of dynamic tenant/center branding or operational tier.

---

### B. Pending Customer Registrations — Not Working

- **Symptoms:**
  Registrations submitted via Customer App do not reliably appear in Dairy Admin, or appear alongside fabricated candidates ("Baburao Ganpat Patil", "Dattatray Yashwant Jadhav"). Approving an applicant does not update real database records or Customer App status.
- **Root Causes:**
  1. **Customer App Flow:**
     `apps/dfarm-customer-app/src/features/registration/useRegistration.ts:31-34` sends `POST /customers/register` with payload `{ fullName, mobileNumber, selectedDairyId, village, categories, faceTemplate, bankDetails }`.
  2. **Backend Intake Hardcoding (`services/backend/src/presentation/routes/customers.routes.ts:99-100`):**
     ```typescript
     organizationId: body.organizationId || body.dairyId || body.selectedDairyId || '00000000-0000-0000-0000-000000000001',
     centerId: body.centerId || '00000000-0000-0000-0000-000000000002',
     ```
     If `selectedDairyId` was passed under an unrecognized alias or missing center, it forced the customer into Gokul Center 2.
  3. **Frontend Merging of Mock Registrations (`apps/dfarm-dairy-admin/src/api/index.ts:69-96`):**
     ```typescript
     const backendList = Array.isArray(json.data) ? json.data : []
     const mockList = await MockDairyBackend.getPendingRegistrations()
     const merged = [...backendList]
     for (const m of mockList) {
       if (!seenIds.has(m.id)) merged.push(m)
     }
     return merged
     ```
     Even when the backend returned 0 pending registrations for a dairy, 3 mock registrations from `MockDairyBackend` were injected into the UI list.
  4. **Fake Approval Mutation (`apps/dfarm-dairy-admin/src/api/index.ts:113-136`):**
     On approving a customer, `MockDairyBackend.approveRegistration()` was called asynchronously and fallback logic returned a mocked customer record instead of strictly verifying database persistence.
  5. **Status Polling Hardcoded Dairy Name (`services/backend/src/presentation/routes/customers.routes.ts:155`):**
     `GET /customers/:id/status` hardcoded `assignedDairyName: 'Shree Krishna Sahakari Dudh Sanstha'`.

---

### C. Customer Directory — Fake Customers

- **Symptoms:**
  Dairy Admin Customer Directory displays fake farmers ("Pandurang Mahadev Patil", "Sunita Tukaram Shinde", etc.) regardless of tenant context.
- **Root Causes:**
  1. **Frontend Merging of Mock Customers (`apps/dfarm-dairy-admin/src/api/index.ts:163-210`):**
     ```typescript
     const mockCustomers = await MockDairyBackend.getCustomers(includeSoftDeleted)
     const merged = [...backendCustomers]
     for (const m of mockCustomers) {
       if (!seenIds.has(m.id)) merged.push(m)
     }
     return merged
     ```
     Every time `getAll()` is invoked, mock records from `mock-server.ts` were stitched together with backend records. If backend failed or returned empty, 100% of the displayed customers were fake.
  2. **Unscoped Query Keys (`apps/dfarm-dairy-admin/src/pages/customers/CustomerDirectory.tsx:46`):**
     The React Query key was `['customers', showDeleted]`. Changing dairy admin login did not invalidate query cache because the active `dairyId` was omitted from the key.

---

### D. Face Enrollment Lifecycle — Fake Data

- **Symptoms:**
  The Face Enrollment Lifecycle module shows fake template entries with mock scores (96.8%, 94.2%) and fabricated audit logs.
- **Root Causes:**
  1. **Frontend Disconnection (`apps/dfarm-dairy-admin/src/api/index.ts:223-233`):**
     ```typescript
     faceEnrollment: {
       getAll: async () => MockDairyBackend.getFaceEnrollments(),
       requestReEnrollment: async (...) => MockDairyBackend.requestFaceReEnrollment(...),
       revoke: async (...) => MockDairyBackend.revokeFaceEnrollment(...),
     }
     ```
     The frontend made ZERO HTTP requests to the backend for face enrollment lifecycle.
  2. **Missing Dairy Admin Lifecycle Endpoint in Backend:**
     The backend had `GET /api/v1/identity/face/templates` (for Collection Kiosk local cache) and `POST /api/v1/customers/:id/face-enroll`, but lacked an administrative lifecycle endpoint `GET /api/v1/identity/face/enrollments` returning enrollment metadata (customer, model version, template version, quality score, status, timestamps) without exposing raw decrypted vectors.

---

### E. RFID Card Registry — Fake Data

- **Symptoms:**
  The RFID Card Registry displays static card UIDs ("04:A1:B2:C3:D4:E5:F6", "04:55:66:77:88:99:AA") and fake customer bindings.
- **Root Causes:**
  1. **Frontend Disconnection (`apps/dfarm-dairy-admin/src/api/index.ts:236-246`):**
     ```typescript
     rfid: {
       getAll: async () => MockDairyBackend.getRfidCards(),
       assign: async (...) => MockDairyBackend.assignRfidCard(...),
       markLost: async (...) => MockDairyBackend.markRfidCardLost(...),
     }
     ```
     No backend HTTP request was made.
  2. **Backend Route Gap:**
     `services/backend/src/presentation/routes/rfid.routes.ts` only exposed `GET /lookup` and `GET /lookup/:uid`. There was no `GET /api/v1/rfid` list endpoint to retrieve real assigned/unassigned RFID cards for the active dairy.

---

### F. Collection Sessions — Fake Data

- **Symptoms:**
  Collection Sessions module displays hardcoded sessions ("SES-2026-11-15-M", "SES-2026-11-15-E") with mock totals and fake transaction counts.
- **Root Causes:**
  1. **Frontend Disconnection (`apps/dfarm-dairy-admin/src/api/index.ts:249-262`):**
     ```typescript
     collections: {
       getSessions: async () => MockDairyBackend.getCollectionSessions(),
       closeSession: async (...) => MockDairyBackend.closeCollectionSession(...),
       getTransactions: async (...) => MockDairyBackend.getCollectionTransactions(...),
       adjustTransaction: async (...) => MockDairyBackend.adjustCollectionRecord(...),
     }
     ```
     No backend HTTP request was made.
  2. **Backend Route Gap:**
     `services/backend/src/presentation/routes/collections.routes.ts` exposed `/sessions/active`, `/sessions/open`, and `/sessions/close`, but had no administrative `GET /sessions` route to list sessions filtered by date, shift, and dairy, nor `GET /transactions` to query real collection transaction registers for Dairy Admin.

---

### G. Remaining Dairy Admin Operational Modules Disconnection

- **Rate Charts:** `api.rateCharts.getAll()` calls `MockDairyBackend.getRateCharts()`.
- **Customer Ledger:** `api.ledger.getEntries()` calls `MockDairyBackend.getCustomerLedger()`.
- **Monthly Bills:** `api.billing.getBills()` calls `MockDairyBackend.getDairyBills()`.
- **Feed Inventory & Sales:** `api.feed.getProducts()` & `getSales()` calls `MockDairyBackend`.
- **Payment Register:** `api.payments.getAll()` calls `MockDairyBackend.getPaymentRecords()`.
- **Device Management:** `api.devices.getAll()` calls `MockDairyBackend.getCollectionDevices()`.
- **Staff Management:** `api.staff.getAll()` calls `MockDairyBackend.getStaffMembers()`.
- **Dashboard Summary:** `api.dashboard.getSummary()` calls `MockDairyBackend.getDashboardSummary()`.

---

## 3. COMMUNICATION TRACE (INTAKE TO LEDGER)

```
[Customer App]
   │
   ▼ POST /api/v1/customers/register
[Backend: customer.routes.ts]
   │ Validates body, resolves organizationId from selectedDairyId
   ▼
[RegisterCustomerUseCase]
   │ Invariants: Phone uniqueness per dairy, status = 'INACTIVE', registrationStatus = 'PENDING_APPROVAL'
   ▼
[PostgresCustomerRepository.save()]
   │ Writes to 'customers', 'customer_addresses', 'customer_milk_categories', 'customer_ledger_accounts'
   ▼
[Database: PostgreSQL / pg-mem]
   │ Persisted with status = 'PENDING_APPROVAL'
   ▼
[Dairy Admin: PendingApprovals.tsx]
   │ GET /api/v1/customers/pending?organizationId={dairyId}
   ▼
[ApproveCustomerRegistrationUseCase]
   │ POST /api/v1/customers/{id}/approve
   │ Sets registrationStatus = 'APPROVED', status = 'ACTIVE', assigns customerCode
   ▼
[Collection App]
   │ GET /api/v1/customers -> Customer now eligible in directory
   │ GET /api/v1/identity/face/templates -> SFace 128D template cached for offline/online matching
   │ POST /api/v1/collections/transactions -> Records intake
   ▼
[Atomic Intake: ProcessMilkIntakeUseCase]
   │ Writes to 'milk_collections' + posts double-entry transaction to 'customer_ledger_accounts'
   ▼
[Customer App / Dairy Admin]
   │ Customer App GET /api/v1/collections/history -> displays real delivery
   │ Dairy Admin GET /api/v1/collections/transactions -> displays audited collection record
```

---

## 4. REPAIR OBJECTIVES & PLAN

1. **Eliminate All Fake Fallbacks in Dairy Admin:** Replace every call to `MockDairyBackend` in `apps/dfarm-dairy-admin/src/api/index.ts` with real typed HTTP calls to the backend.
2. **Resolve Authenticated Dairy Context Dynamically:**
   - Modify `AdminAuthUseCases.ts` to query the user's actual assigned dairy from the database.
   - Include `organizationId`, `centerId`, and `role` in the JWT token payload.
   - Prohibit fallback to Gokul or any default dairy.
   - Remove hardcoded "Isolated Dairy Management Platform" subtitle in `Header.tsx` and dynamically render authenticated dairy metadata.
3. **Build Missing Clean Architecture Endpoints in Backend:**
   - `GET /api/v1/identity/face/enrollments` (Dairy Admin Face Lifecycle).
   - `POST /api/v1/identity/face/enrollments/:id/re-enroll` & `revoke`.
   - `GET /api/v1/rfid` (Dairy Admin RFID Card Registry list).
   - `POST /api/v1/rfid/assign`, `replace`, `mark-lost`.
   - `GET /api/v1/collections/sessions` (Dairy Admin Session List).
   - `GET /api/v1/collections/transactions` (Dairy Admin Collection Records).
   - `POST /api/v1/collections/transactions/:id/adjust` (Non-destructive ledger adjustment).
   - `GET /api/v1/dashboard/summary` (Dynamic live counts from real database tables).
   - `GET /api/v1/rate-charts`, `/ledger`, `/bills`, `/feed`, `/payments`, `/devices`.
4. **Scope All Queries by Authenticated Dairy:** Add `dairyId` to React Query keys across all Dairy Admin pages and enforce multi-tenant isolation on the server.
5. **Verify End-to-End Workflows with Automated Tests:** Execute registration -> approval -> face/RFID -> session -> collection -> ledger updates.
