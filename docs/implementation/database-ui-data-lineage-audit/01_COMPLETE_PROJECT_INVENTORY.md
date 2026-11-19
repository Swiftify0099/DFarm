# DFARM — COMPLETE PROJECT INVENTORY
## APPLICATION, SERVICE, DATABASE & WORKSPACE ARCHITECTURE

**Audit Reference:** `DFARM-AUDIT-INV-001`  
**Target:** Monorepo System Tree & Runtime Configuration  
**Date:** 2026-11-18  

---

### 1. Workspace Inventory Matrix

The DFarm platform is structured as an npm workspaces monorepo containing 4 frontend client applications, 1 core backend service, 3 shared TypeScript packages, and unified database migrations.

| Application / Package | Path | Runtime / Framework | Primary Port | Main Entry Point | Routing Mechanism | State Management / Data Fetching |
|---|---|---|---|---|---|---|
| **Customer App** | `apps/dfarm-customer-app` | React Native (Expo SDK 51) / React 18 | 8081 | `src/app/_layout.tsx` | Expo Router (File-based file system routing) | React Query / Axios (`api-client.ts`) |
| **Dairy Admin Web** | `apps/dfarm-dairy-admin` | React 18 / Vite / TypeScript | 5174 | `src/main.tsx` -> `src/App.tsx` | React Router DOM v6 | React Query / Fetch (`api/client.ts`) |
| **Milk Collection App** | `apps/dfarm-collection-app` | React 18 / Vite / Web Serial | 5175 | `src/main.tsx` -> `src/App.tsx` | React Router DOM v6 | React Context + IndexedDB (`localDB`) |
| **Super Admin Web** | `apps/dfarm-super-admin` | React 18 / Vite / TypeScript | 5173 | `src/main.tsx` -> `src/App.tsx` | React Router DOM v6 | React Query / Fetch (`api/client.ts`) |
| **Backend API Service** | `services/backend` | Node.js (v22 ESM) / Express | 4000 | `src/server.ts` -> `src/app.ts` | Express Router (`cleanApiRouter`) | Layered Clean Architecture / Repository |
| **Database Package** | `packages/database` | TypeScript / Node-pg | N/A | `src/index.ts` | Migration Runner & Manifest | Node-pg / pg-mem (in tests) |
| **Shared Types** | `packages/shared-types` | TypeScript | N/A | `src/index.ts` | Pure domain TypeScript interfaces | Shared type declarations |
| **Shared Validation** | `packages/shared-validation`| TypeScript / Zod | N/A | `src/index.ts` | Zod validation schemas | Shared runtime validation schemas |
| **Platform Dev Hub** | `scripts/dev-server.js` | Node.js native HTTP Proxy | 3000 | `scripts/dev-server.js` | Path-prefix reverse proxy & static file server | Native Node.js stream piping |

---

### 2. Frontend Application Profiles

#### 2.1 Customer App (`apps/dfarm-customer-app`)
- **Purpose:** Farmer self-service mobile application for nearby dairy discovery, farmer self-registration, biometric selfie capture, milk collection receipt tracking, digital passbook inspection, billing history, and notifications.
- **Entry Points:** `src/app/index.tsx`, `src/app/(auth)/login.tsx`, `src/app/(onboarding)/dairy-discovery.tsx`, `src/app/(main)/index.tsx`.
- **Authentication:** Mobile OTP via Dove SMS Gateway -> HMAC-SHA256 JWT stored in Expo SecureStore.
- **API Client:** `src/services/api-client.ts` configured with dynamic host IP resolution (LAN Wi-Fi / Metro / Emulator 10.0.2.2).
- **Test Framework:** Jest / React Native Testing Library (`__tests__/`).
- **Build Scripts:** `npm run start`, `npm run android`, `npm run web`.

#### 2.2 Dairy Admin Portal (`apps/dfarm-dairy-admin`)
- **Purpose:** Comprehensive desktop portal for cooperative dairy union owners, plant managers, and accountants.
- **Modules:** Customer approvals, farmer directory, biometric status, RFID card assignment, collection sessions monitoring, milk rate chart configuration, cattle feed inventory & credit sales, customer double-entry ledger, automated billing & settlement finalization, maker-checker payment approvals, and bank export.
- **Entry Points:** `src/main.tsx`, `src/App.tsx`.
- **Authentication:** Admin mobile OTP -> JWT stored in browser `localStorage`.
- **API Client:** `src/api/client.ts` and `src/api/index.ts`.
- **Build Scripts:** `npm run build` (Vite), `npm run dev`.

#### 2.3 Milk Collection Kiosk Terminal (`apps/dfarm-collection-app`)
- **Purpose:** Offline-capable, high-throughput milk intake kiosk operating at rural chilling centers.
- **Hardware Integrations:** Web Serial API drivers for RS-232 weighing scale, ultrasonic/optical milk analyzers, ESC/POS thermal receipt printers, and USB RFID card readers. Local camera face recognition using SFace 128D cosine distance matching.
- **Entry Points:** `src/main.tsx`, `src/App.tsx`, `src/pages/collection/CollectionWorkspace.tsx`.
- **Authentication:** Operator login with assigned center binding.
- **Offline Storage:** IndexedDB (`dfarm_collection_local_db`) with `offline_queue`, `active_session`, `customers_cache`, and `completed_transactions`.
- **Build Scripts:** `npm run build` (Vite), `npm run dev`.

#### 2.4 Super Admin Portal (`apps/dfarm-super-admin`)
- **Purpose:** Multi-tenant platform orchestrator for DFarm operations team.
- **Modules:** Cooperative union onboarding, separate PostgreSQL database provisioning monitoring, central admin account management, global rate policies, central hardware inventory & allocation, AMC subscription tracking, and support diagnostic sessions.
- **Entry Points:** `src/main.tsx`, `src/App.tsx`.
- **Authentication:** Root super admin credentials / OTP.
- **API Client:** `src/api/client.ts`.
- **Build Scripts:** `npm run build` (Vite), `npm run dev`.

---

### 3. Backend Service Profile (`services/backend`)

- **Architecture:** Express.js ESM application implementing Hexagonal / Clean Architecture.
- **Directory Layout:**
  - `src/domain/`: Entities (`Customer`, `RateChart`, `MilkCollectionIntake`), Value Objects, Domain Errors, Domain Services (`FinancialPolicyResolutionService`, `BillingEngineService`).
  - `src/application/`: Use cases (`RecordMilkIntakeUseCase`, `ApproveCustomerRegistrationUseCase`, `FinalizeBillingCycleUseCase`, `AuthorizePaymentBatchUseCase`).
  - `src/infrastructure/`: Database pools (`PostgresPool`, `TenantDatabaseManager`, `MigrationRunner`), Repositories, Security (`HmacJwtTokenService`, `CredentialEncryption`), Hardware Serial Drivers, External SMS/Email services.
  - `src/presentation/`: Express Routes (`cleanApiRouter`), Controllers, Middleware (`request-context`, `rate-limit`, `tenant-resolver`, `error-handler`).
- **Dependencies:** `pg`, `express`, `cors`, `helmet`, `pino`, `zod`, `bcrypt`, `pg-mem` (dev/test).
- **Test Framework:** Node.js native test runner (`node --test`) with Supertest.
