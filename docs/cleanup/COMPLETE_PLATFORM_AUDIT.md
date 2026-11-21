# DFarm Complete Platform Audit Report

**Date**: November 16, 2026  
**Auditor**: Antigravity Platform Engineering & Clean Architecture Audit Team  
**Scope**: All 4 Applications (Customer App, Collection App, Dairy Admin Web, Super Admin Web), Monorepo Packages, Backend Services, Database Migrations, APIs, Integrations, and Security Controls.

---

## 1. Complete Project Structure

DFarm is structured as an npm workspaces monorepo:

```text
dfarm-monorepo/
├── apps/
│   ├── dfarm-customer-app/     # Mobile customer self-service app (React Native / Expo SDK 58 / Expo Router)
│   ├── dfarm-collection-app/   # Dairy kiosk & operator milk intake app (Vite / React 19 / OpenCV YuNet + SFace)
│   ├── dfarm-dairy-admin/      # Dairy Society Administrator Web Portal (Vite / React 19 / Claymorphism UI)
│   └── dfarm-super-admin/      # Platform Owner / Super Admin Web Portal (Vite / React 19)
├── packages/
│   ├── shared-types/           # Common TypeScript types, Enums, and domain interfaces
│   ├── shared-validation/      # Zod validation schemas across HTTP contracts
│   └── database/               # Database migration definitions, schema validation, and runtime integration tests
├── services/
│   └── backend/                # Express 5 / Node 22 Clean Architecture API with Postgres & Supabase connectors
├── supabase/
│   └── migrations/             # 31 SQL migration files establishing schemas, RLS, functions, and triggers
├── docs/                       # Technical architecture, workflows, API contracts, and audits
└── scripts/                    # Automation and administrative maintenance scripts
```

---

## 2. All Four Application Entry Points

| Application | Entry Point & Shell | Router / Navigation | Build Tool | Port |
|---|---|---|---|---|
| **DFarm Customer App** | `apps/dfarm-customer-app/src/app/_layout.tsx` | Expo Router (File-based) | Metro / Expo SDK 58 | 8081 (Android/Web) |
| **DFarm Collection App** | `apps/dfarm-collection-app/src/main.tsx` -> `App.tsx` | Component Tabs / Modals | Vite 8.3.8 | 5175 |
| **DFarm Dairy Admin** | `apps/dfarm-dairy-admin/src/main.tsx` -> `App.tsx` | React Router DOM v7 | Vite 8.3.8 | 5173 |
| **DFarm Super Admin** | `apps/dfarm-super-admin/src/main.tsx` -> `App.tsx` | React Router DOM v7 | Vite 8.3.8 | 5174 |
| **Backend Service** | `services/backend/src/server.ts` -> `app.ts` | Express 5 Route Routers | Node 22 / tsc | 4000 |

---

## 3. Backend Architecture

The backend implements a Clean Architecture layered model:

1. **Presentation Layer (`services/backend/src/presentation/` & `services/backend/src/modules/`)**:
   - HTTP routes and controllers
   - Input sanitization via Zod middleware
   - Standardized envelope responses (`ApiResponse.success`, `ApiResponse.error`)
   - Bearer JWT authentication & role-based authorization middlewares
   - Rate limiting via `express-rate-limit`

2. **Application Layer (`services/backend/src/application/`)**:
   - Primary Ports: `IAuthenticationService`, `ICustomerRepository`, `ICollectionTransactionRepository`, `IShiftSessionRepository`, `ILedgerRepository`, `IRateChartRepository`, `IOtpService`, `IEmailService`, `ISmsService`.
   - Use Cases:
     - Auth: `CustomerAuthUseCases`, `OperatorAuthUseCases`, `AdminAuthUseCases`
     - Collections: `MilkIntakeUseCases`
     - Customers: `CustomerDirectoryUseCases`, `BiometricUseCases`
     - Dairies: `GetNearbyDairiesUseCase`
     - Ledger: `CustomerLedgerUseCases`
     - Sessions: `ShiftSessionUseCases`
     - Telemetry & Sync: `TelemetryAndSyncUseCases`

3. **Domain Layer (`services/backend/src/domain/`)**:
   - Pure business logic, entities, value objects, and domain errors:
     - Entities: `Customer`, `CustomerLedgerAccount`, `KioskShiftSession`, `MilkCollectionTransaction`, `RateChart`
     - Value Objects: `MilkQuality`, `Money`, `GeoCoordinate`, `FarmerCode`, `PhoneNumber`
     - Domain Errors: `DomainError`, `EntityNotFoundError`, `InvariantViolationError`, `UnauthorizedTenantAccessError`

4. **Infrastructure Layer (`services/backend/src/infrastructure/`)**:
   - Database: `PostgresPool.ts` (PostgreSQL Connection Pool with pg-mem in-memory fallback)
   - Repositories: `PostgresCustomerRepository`, `PostgresCollectionTransactionRepository`, `PostgresShiftSessionRepository`, `PostgresLedgerRepository`, `PostgresRateChartRepository`
   - Security: `Aes256GcmBiometricEncryptor` (128-dim SFace embedding encryption with AES-256-GCM), `HmacJwtTokenService`
   - External Services:
     - SMS: `DoveSmsService` (Mobicomm API gateway)
     - OTP: `DoveOtpService` (Real SMS dispatch)
     - Email: `EmailService` (Nodemailer with SMTP - Gmail configured)

---

## 4. Database Configuration & Schemas

The system defines 43 PostgreSQL tables spanning 31 migrations in `supabase/migrations/`:
- Multi-tenancy: Every business entity references `organization_id` (UUID).
- RLS Policies: Defined across all 43 tables enforcing tenant boundaries (`organization_id = auth.jwt()->>'organization_id'`).
- Precision Types: Exact `NUMERIC(10,2)` and `NUMERIC(6,3)` for liters, currency, FAT, and SNF. Zero floating-point types in financial tables.
- Biometric Protection: `face_enrollments` stores 128-dimensional float arrays encrypted via AES-256-GCM (`embedding_encrypted`, `embedding_iv`, `embedding_auth_tag`).
- Idempotency: `idempotency_key` columns on `milk_collections` and `customer_subledger_entries`.

---

## 5. API Inventory

The backend registers 130+ distinct REST endpoints:
- Core Presentation Routes (`/api/v1`):
  - `/auth`: OTP dispatch, OTP verification, token refresh for Operators, Customers, Admins
  - `/dairies`: Dairy onboarding, nearby dairy geolocation queries, location coordinate patch, invitation dispatch/validation/activation
  - `/customers`: Customer registration, pending approvals, approval/rejection, profile retrieval, biometric enrollment update
  - `/collections`: Active session queries, session opening/closing, collection transactions, history, monthly summaries
  - `/identity`: Face templates download, biometric facial embedding 1:N matching
  - `/ledger`: Subledger running balance summary, historical transaction entries
  - `/bills`: Fortnightly bill statements
  - `/devices`: Hardware telemetry status
  - `/rfid`: Card UID lookup
  - `/sync`: Offline collection queue push and reconciliation
- Legacy & Module Routes (`/api/v1/*`):
  - Billing engine: `/api/v1/billing/*` (PDF generation, cycle progress, settlement)
  - Feed management: `/api/v1/feed/*`, `/api/v1/inventory/*`
  - Employee & Payroll: `/api/v1/employees/*`, `/api/v1/attendance/*`, `/api/v1/payroll/*`
  - Reports: `/api/v1/reports/*` (daily, monthly, farmer-wise, fat-snf, payouts)
  - Notifications: `/api/v1/notifications/*`, `/api/v1/webhooks/whatsapp`

---

## 6. Mock-Data Inventory (Discovered Runtime Artifacts)

### A. DFarm Super Admin Web
1. `apps/dfarm-super-admin/src/services/mockBackend.ts` (65 KB, 1,500+ lines):
   - Simulated Super Admin state: mock tenant list, mock admins, mock alerts, fake audit entries, mock support sessions.
2. `apps/dfarm-super-admin/src/services/seedData.ts` (21 KB):
   - Hardcoded mock dairies (`Gokul Primary Cooperative`, `Warna Sahakari Dudh`, etc.), fake admins, fake metric calculations.
3. `apps/dfarm-super-admin/src/api/client.ts`:
   - Methods fall back to `mockBackend` or directly call `mockBackend` instead of failing with an honest error.

### B. DFarm Dairy Admin Web
1. `apps/dfarm-dairy-admin/src/api/mock-server.ts` (800+ lines):
   - `MockDairyBackend` class holding static in-memory lists for customers, bills, ledger entries, feed products, payment receipts, audit logs.
2. `apps/dfarm-dairy-admin/src/api/index.ts`:
   - Lines 63, 82-95, 113, 136, 161, 195-209, 225-414: Direct delegation to `MockDairyBackend` for dashboard metrics, customer listings, collections, rate charts, ledger, billing, feed sales, staff, and audit logs.
   - Merging real backend responses with `MockDairyBackend` items if backend returns data.

### C. DFarm Collection App
1. `apps/dfarm-collection-app/src/api/mock-backend.ts` (409 lines):
   - Mock customer identities: `cust-101` (Pandurang Mahadev Patil), `cust-102` (Sunita Tukaram Shinde), `cust-103` (Aniket Ganpatrao Jadhav), `cust-104` (Namdev Baburao Gaikwad).
   - Mock collection sessions, mock rate matrix, mock hardware devices.
2. `apps/dfarm-collection-app/src/api/client.ts`:
   - Hardcoded defaults: `dairyName: 'Gokul Primary Cooperative'`, `dairyCode: 'GOKUL-01'`, `village: 'Gokul Shirgaon'`, static biometric quality scores `97.5`.
3. `apps/dfarm-collection-app/src/components/workspace/CustomerLookupModal.tsx`, `TransactionSummaryPanel.tsx`, `pages/customers/CustomerLookup.tsx`, `context/AuthContext.tsx`, `context/HardwareContext.tsx`:
   - Direct imports and fallback reads from `mock-backend`.

### D. DFarm Customer App
1. `apps/dfarm-customer-app/src/features/dairy/useDairyDiscovery.ts`:
   - Lines 188-384: Hardcoded `fallbackList` containing 40+ mock dairies across Maharashtra returned on network error.
2. `apps/dfarm-customer-app/src/features/registration/useRegistration.ts`:
   - Lines 46-60: On API failure, synthesizes fake success with customer UUID `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d` and status `PENDING_APPROVAL`.
3. `apps/dfarm-customer-app/src/features/profile/useProfile.ts`:
   - Lines 19-35: Returns mock profile for `'Vitthal Dnyandeo Patil'` on API failure.
4. `apps/dfarm-customer-app/src/features/collection/useCollection.ts`:
   - Lines 23-84, 98-118: Returns mock collection transactions (`COL-2026-11-15-M01`, etc.) and fake monthly totals (382.4 L) on API failure.
5. `apps/dfarm-customer-app/src/features/ledger/useLedger.ts`:
   - Lines 18-50, 64-71: Returns mock ledger items (`l1-01`, `l1-02`, `l1-03`) and fake khata balance (₹12,480.00) on API failure.
6. `apps/dfarm-customer-app/src/features/bills/useBills.ts`:
   - Lines 13-46: Returns mock bills `b1-01` and `b1-02` on API failure.
7. `apps/dfarm-customer-app/src/app/(main)/index.tsx`:
   - Hardcoded strings in JSX fallbacks: `'Vitthal Dnyandeo Patil'`, `'12,480.00'`, `'28,530.00'`, `'16,050.00'`, `382.4 L`.

### E. Backend Services
1. `services/backend/src/infrastructure/database/PostgresPool.ts`:
   - In-memory `pg-mem` fallback pre-populates dummy customers (Pandurang Patil, Sunita Shinde, etc.) and pre-fabricated shift sessions with hardcoded milk volumes.
2. `services/backend/src/presentation/routes/dairies.routes.ts`:
   - Lines 1366-1385: Pre-seeded in-memory `demoInvitation` with token `demo-activation-token`.

---

## 7. Hardcoded-Data Inventory

- Default customer names in UI fallbacks (`Vitthal Dnyandeo Patil`, `Pandurang Mahadev Patil`).
- Hardcoded test dairy name (`Shree Krishna Sahakari Dudh Sanstha`, `Gokul Primary Cooperative`).
- Hardcoded financial figures (`₹12,480.00`, `₹28,530.00`, `₹16,050.00`).
- Hardcoded mock collections volume (`382.4 L`, `28 Collections`).
- Hardcoded default coordinates (`16.6644, 74.2588`) used in place of honest location error states.

---

## 8. Fake API Inventory

- `apps/dfarm-dairy-admin/src/api/mock-server.ts`: Implements fake REST endpoints in JavaScript.
- `apps/dfarm-super-admin/src/services/mockBackend.ts`: In-memory CRUD simulator.
- `apps/dfarm-collection-app/src/api/mock-backend.ts`: Simulated transaction journal and simulated hardware reader.

---

## 9. Database Test-Data Inventory

- In `PostgresPool.ts`:
  - Organizations: `Gokul Primary Cooperative` (`00000000-0000-0000-0000-000000000001`), `Warna Sahakari Dudh` (`00000000-0000-0000-0000-000000000004`).
  - Centers: `00000000-0000-0000-0000-000000000002`, `00000000-0000-0000-0000-000000000005`.
  - Shift Sessions: `SH-20261115-M-GOKUL` with 245.00L, `SH-20261115-M-WARNA` with 120.00L.
  - Test Customers: `C-101` through `C-104`, `W-201`, `W-202`.

---

## 10. Broken & Inconsistent Integrations

1. **Super Admin API Client**:
   - `apps/dfarm-super-admin/src/api/client.ts` calls `mockBackend` directly for dashboard statistics, admins, and tenants instead of forwarding HTTP requests to `http://localhost:4000/api/v1/dairies`.
2. **Dairy Admin API Bridge**:
   - `apps/dfarm-dairy-admin/src/api/index.ts` merges backend data with `MockDairyBackend` or ignores the real backend entirely for billing, ledger, feed, and collections.
3. **Customer App Registration Catch-Block**:
   - Returns a fabricated success object with a fake customer ID if the server returns 4xx/5xx or is unreachable.
4. **Collection App Hardware Context**:
   - Reads from `mock-backend.ts` for weighing scale and fat analyzer telemetry if real devices are not attached, rather than reporting an honest device offline state.

---

## 11. Security Issues & Remediation Needs

1. **Fake Fallback Security Risk**: If an unauthorized request fails with 401/403, returning mock data leaks fake identity state and prevents users from authenticating correctly.
2. **Silent Catch Blocks**: Errors swallowed without surfacing network or server failures to the user.
3. **Hardcoded Demo Tokens**: `demo-activation-token` pre-seeded in `dairies.routes.ts` bypasses OTP verification in development.
4. **Tenant Isolation**: Frontends must not hardcode `dairyId` (e.g. `'dairy-ten-9801'` or `'00000000-0000-0000-0000-000000000001'`); `dairyId` must strictly originate from the authenticated user's session token and backend response.

---

## 12. Missing Functionality to Wire

1. Super Admin Dashboard Metrics: Connect to real backend aggregates (`/api/v1/dairies`, `/api/v1/dashboard/metrics`).
2. Dairy Admin Dashboard Metrics: Connect to real backend aggregates (`/api/v1/dashboard/overview`, `/api/v1/collections/shift-summary`).
3. Dairy Admin Customer Approvals & Ledger: Connect directly to `/api/v1/customers/pending`, `/api/v1/customers/:id/approve`, `/api/v1/customers/:id/reject`, `/api/v1/ledger`.
4. Customer App Ledger & Bills: Connect to real `/api/v1/ledger/entries`, `/api/v1/ledger/summary`, `/api/v1/bills`.

---

## 13. Existing Functionality Already Genuinely Connected

1. **Dove SMS Gateway**: Live integration in `DoveSmsService` tested and verified; real OTPs are delivered via SMS to mobile numbers (+91...).
2. **SMTP Email Transporter**: Live integration in `EmailService` tested and verified via `smtp.gmail.com` with genuine activation link emails.
3. **Clean Architecture Repositories**: `PostgresCustomerRepository`, `PostgresCollectionTransactionRepository`, `PostgresShiftSessionRepository`, `PostgresLedgerRepository` correctly execute parameterized SQL queries against PostgreSQL.
4. **Face AI Engine**: OpenCV YuNet + SFace INT8 preprocessor, tensor normalization, and cosine distance matcher are fully implemented.
5. **Customer App Token & Interceptor**: `api-client.ts` in Customer App injects Bearer JWT and `X-Dairy-Id` and handles 401 refresh token rotations.
6. **Collection App Tenant Headers**: `client.ts` in Collection App attaches `X-Dairy-Id` and `Authorization` headers.

---

## 14. Critical Cleanup Priorities

1. **Priority 1 (Phase C - Frontends)**:
   - Remove fake catch fallbacks from all 4 apps.
   - Eliminate `mockBackend.ts`, `mock-server.ts`, `mock-backend.ts` from runtime execution.
   - Replace hardcoded component labels/numbers with real data properties, loading states, and genuine empty/error states.
2. **Priority 2 (Phase C/D - API Bridge)**:
   - Wire all UI operations in Dairy Admin and Super Admin to real backend endpoints.
   - Ensure errors propagate properly so UI displays honest status.
3. **Priority 3 (Phase D - Backend)**:
   - Remove `demo-activation-token` from `dairies.routes.ts`.
   - Prevent `PostgresPool.ts` from injecting fake operational transactions and demo customers in fallback mode.
4. **Priority 4 (Phase G/H - Verification)**:
   - Run full unit, contract, and end-to-end regression suites ensuring zero mock data remains in production application pathways.
