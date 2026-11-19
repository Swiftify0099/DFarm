# COMPLETE PLATFORM AUDIT

**Audit Document Reference:** `DFARM-AUDIT-001`  
**Version:** `1.0.0-PROMPT0-AUDIT`  
**Status:** `READ-ONLY TECHNICAL BASELINE`  
**Classification:** `Master Platform Audit & Consolidated Findings Register`  
**Evaluator:** DFarm Principal Solution Architect & Engineering Audit Team  

---

## 1. Executive Baseline & Platform Health Assessment

A comprehensive, read-only technical audit of the entire DFarm multi-dairy platform was conducted across all workspaces, backend services, client applications, database migrations, and external integrations.

### Key Audit Conclusions

1. **Physical Database Isolation Status: UNIMPLEMENTED.**  
   While DDL migrations exist and the target multi-database architecture is conceptualized in `TenantDatabaseManager.ts`, **no active PostgreSQL cluster is connected**. The backend runs on an in-memory `pg-mem` emulator with static seed tenants.
2. **Super Admin Web Reality: CLIENT-SIDE SIMULATION.**  
   `apps/dfarm-super-admin` contains a fully styled Claymorphic interface, but **90% of its data (telemetry, alerts, audit logs, reports, support portal, and admin lists) is served from a 70 KB client-side `mockBackend.ts` file**.
3. **Dairy Admin Web Reality: MOCK SERVER & HARDCODED GOKUL IDENTITY.**  
   `apps/dfarm-dairy-admin` contains a 2,683-line `mock-server.ts`. When connected to the backend, the owner's phone number (`+917755995615`) is hardcoded to Gokul Primary Cooperative in `PostgresPool.ts`, blinding the admin to customers registered under any other dairy.
4. **Customer Mobile App Reality: OPERATIONAL GREENFIELD WITH RUNTIME SHIMS.**  
   `apps/dfarm-customer-app` is built on Expo 58 with Expo Router. Real mobile OTP dispatch via Dove SMS works. However, OpenCV YuNet and SFace ONNX models lack native hardware acceleration and fall back to calibrated fixtures on standard device runtimes.
5. **Collection App Reality: CLIENT-SIDE MOCKS & VIRTUAL HARDWARE.**  
   `apps/dfarm-collection-app` runs a React 19 interface with ONNX Web. Milk analyzers, digital scales, and RFID readers run on software simulation shims without verified serial/USB protocols.
6. **Backend Monolith Reality: ROUTE DUPLICATION & SPLIT ARCHITECTURE.**  
   `services/backend` mounts two competing routing architectures simultaneously: `cleanApiRouter` (Presentation Layer) and `modules/*` (Legacy Modular Layer), creating severe route shadowing and ambiguous request handling.

---

## 2. Consolidated Platform Findings Register

| Finding ID | Application | Module | Source File Path | Severity | Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **DF-FIND-001** | Backend | Database Core | `services/backend/src/infrastructure/database/PostgresPool.ts` | **P0** | Confirmed |
| **DF-FIND-002** | Backend | Tenant Manager | `services/backend/src/infrastructure/database/TenantDatabaseManager.ts` | **P0** | Confirmed |
| **DF-FIND-003** | Backend | Express Gateway | `services/backend/src/app.ts` | **P0** | Confirmed |
| **DF-FIND-004** | Super Admin | Dashboard & Reports| `apps/dfarm-super-admin/src/api/client.ts` | **P0** | Confirmed |
| **DF-FIND-005** | Super Admin | Access Control | `apps/dfarm-super-admin/src/api/client.ts` | **P0** | Confirmed |
| **DF-FIND-006** | Super Admin | Support Portal | `apps/dfarm-super-admin/src/services/mockBackend.ts` | **P1** | Confirmed |
| **DF-FIND-007** | Dairy Admin | Identity & Auth | `services/backend/src/infrastructure/database/PostgresPool.ts` | **P1** | Confirmed |
| **DF-FIND-008** | Dairy Admin | Approvals Queue | `apps/dfarm-dairy-admin/src/pages/customers/PendingApprovals.tsx`| **P1** | Confirmed |
| **DF-FIND-009** | Dairy Admin | Local Mock Server | `apps/dfarm-dairy-admin/src/api/mock-server.ts` | **P1** | Confirmed |
| **DF-FIND-010** | Customer App | Biometrics | `apps/dfarm-customer-app/src/face-ai/sface-embedder.ts` | **P1** | Confirmed |
| **DF-FIND-011** | Customer App | Discovery | `apps/dfarm-customer-app/src/features/dairy/useDairyDiscovery.ts`| **P1** | Confirmed |
| **DF-FIND-012** | Collection App | Biometric Match | `services/backend/src/presentation/routes/identity.routes.ts` | **P1** | Confirmed |
| **DF-FIND-013** | Collection App | Hardware Drivers | `apps/dfarm-collection-app/src/drivers/VoiceGuidanceDriver.ts` | **P2** | Confirmed |
| **DF-FIND-014** | Backend | Customer Repo | `services/backend/src/infrastructure/repositories/PostgresCustomerRepository.ts` | **P0** | Confirmed |
| **DF-FIND-015** | Backend | OTP Service | `services/backend/src/infrastructure/otp/DoveOtpService.ts` | **P2** | Confirmed |
| **DF-FIND-016** | Backend | Email Service | `services/backend/src/infrastructure/email/EmailService.ts` | **P2** | Confirmed |

---

## 3. Deep Technical Analysis of Top Critical Findings

### Finding DF-FIND-001: Physical PostgreSQL Offline & Virtual In-Memory Fallback
- **Application:** Backend
- **Module:** Database Connection Pool
- **Source File:** `services/backend/src/infrastructure/database/PostgresPool.ts` (lines 10-35, 343-365)
- **API Route:** All database-backed endpoints
- **Database Resource:** In-memory `pg-mem` mock database
- **Root Cause & Evidence:**  
  `new Pool({ connectionString: config.DATABASE_URL })` targets `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Port check confirms port 54322 is closed (`ECONNREFUSED`). The pool catches this error and delegates all SQL queries to `newDb()` from `pg-mem`.
- **Severity:** `P0 - Critical`
- **Dependency:** Prompt 1
- **Recommended Repair:** Provision a real PostgreSQL cluster, update `DATABASE_URL`, and eliminate the `pg-mem` silent fallback in production runtimes.
- **Verification Criteria:** `SELECT 1` executes against physical PostgreSQL without falling back to `getOrCreateMemDb()`.
- **Status:** `Confirmed`

---

### Finding DF-FIND-002: Tenant Database Manager Re-Provisioning Blank Databases on Cache Miss
- **Application:** Backend
- **Module:** Multi-Tenant Database Manager
- **Source File:** `services/backend/src/infrastructure/database/TenantDatabaseManager.ts` (lines 196-203)
- **API Route:** All tenant-scoped operational endpoints
- **Database Resource:** Dynamic `pg-mem` instances
- **Root Cause & Evidence:**  
  In `getTenantDb(dairyId)`, if the in-memory client map lacks an entry, it reads the mapping from the central DB and then invokes:
  ```typescript
  const client = this.createIsolatedMemoryDatabase(dairyId);
  await this.applyTenantMigrations(client, dairyId);
  this.tenantClients.set(dairyId, client);
  return client;
  ```
  Instead of connecting to the stored physical database connection URI, it instantiates an empty virtual database every time the server starts.
- **Severity:** `P0 - Critical`
- **Dependency:** Prompt 1
- **Recommended Repair:** Store encrypted PostgreSQL connection URIs in `dairy_database_mappings.connection_uri_encrypted`. On lookup, decrypt the URI and initialize a persistent `pg.Pool` targeting that physical database.
- **Verification Criteria:** Records inserted into a tenant database remain intact after stopping and restarting the backend server.
- **Status:** `Confirmed`

---

### Finding DF-FIND-003: Double-Mounted Competing Express Route Handlers
- **Application:** Backend
- **Module:** Express HTTP Gateway
- **Source File:** `services/backend/src/app.ts` (lines 75, 80-106)
- **API Route:** `/api/v1/customers`, `/api/v1/collections`, `/api/v1/auth`, etc.
- **Root Cause & Evidence:**  
  Line 75 mounts `cleanApiRouter` at `/api/v1`. Line 82 mounts `customerRoutes` at `/api/v1/customers`. Because `cleanApiRouter` already defines `/customers` handlers, incoming requests for customer operations match `presentation/routes/customers.routes.ts` first, while `modules/customers/customer.routes.ts` handlers are partially eclipsed or behave inconsistently depending on URL trailing slashes and HTTP verbs.
- **Severity:** `P0 - Critical`
- **Dependency:** Prompt 2
- **Recommended Repair:** Consolidate backend routing into a single, unambiguous Clean Architecture routing hierarchy under `presentation/routes`. Deprecate and remove redundant route trees in `src/modules/*`.
- **Verification Criteria:** Every API endpoint resolves to exactly one controller and use case without overlapping express route registrations.
- **Status:** `Confirmed`

---

### Finding DF-FIND-004: Super Admin Mock Backend Shadowing Platform Operations
- **Application:** Super Admin Web
- **Module:** API Client & Dashboard Analytics
- **Source File:** `apps/dfarm-super-admin/src/api/client.ts` (lines 1, 115-130, 393-445)
- **API Route:** Missing `/api/v1/super-admin/metrics`, `/api/v1/super-admin/health`, etc.
- **Root Cause & Evidence:**  
  `apiClient` in Super Admin imports `mockBackend` from `@/services/mockBackend` and returns client-side synthetic data for `getDashboardMetrics()`, `getGlobalAnalytics()`, `getPlatformHealth()`, `getAlerts()`, `getAuditLogs()`, `requestSupportSession()`, and `generateReport()`.
- **Severity:** `P0 - Critical`
- **Dependency:** Prompt 3 & Prompt 4
- **Recommended Repair:** Build authoritative backend endpoints for platform metrics, health telemetry, alerts, and audit ledgers in `services/backend`. Refactor `apiClient` to remove `mockBackend` imports and execute genuine HTTP requests.
- **Verification Criteria:** Disabling local storage or running network inspector demonstrates 100% of Super Admin metrics originate from backend HTTP responses backed by PostgreSQL.
- **Status:** `Confirmed`

---

### Finding DF-FIND-007: Static Gokul Dairy Admin Identity Hardcoding
- **Application:** Dairy Admin & Backend
- **Module:** Identity & Session Scoping
- **Source File:** `services/backend/src/infrastructure/database/PostgresPool.ts` (lines 238-249), `apps/dfarm-dairy-admin/src/api/mock-server.ts` (lines 30-36)
- **API Route:** `POST /api/v1/auth/admin/otp/verify`
- **Database Resource:** `users`, `organizations`
- **Root Cause & Evidence:**  
  Mobile number `+917755995615` is explicitly bound to Gokul Primary Cooperative (`00000000-0000-0000-0000-000000000001`) in the database seed. The Dairy Admin frontend defaults to `CURRENT_DAIRY_ID = 'dairy-ten-9801'` (Gokul).
- **Severity:** `P1 - High`
- **Dependency:** Prompt 2 & Prompt 6
- **Recommended Repair:** Bind administrators dynamically to their respective Dairy during Super Admin onboarding. During login, resolve the administrator's authentic Dairy membership from `users.organization_id`.
- **Verification Criteria:** An admin provisioned for Dairy B logs in and accesses Dairy B's isolated database without any references to Gokul.
- **Status:** `Confirmed`

---

### Finding DF-FIND-014: Cross-Dairy Multi-Database Query Leakage in Repository
- **Application:** Backend
- **Module:** Customer Repository
- **Source File:** `services/backend/src/infrastructure/repositories/PostgresCustomerRepository.ts` (lines 135-144, 191-197, 233-239)
- **API Route:** `GET /api/v1/customers/:id`, `GET /api/v1/customers/rfid/:uid`
- **Database Resource:** All tenant databases
- **Root Cause & Evidence:**  
  When querying a customer without an explicit `organizationId`, the repository loops through `tenantDbManager.getAllMappings()` and queries **every tenant database in sequence** until a row is returned.
- **Severity:** `P0 - Critical`
- **Dependency:** Prompt 1 & Prompt 2
- **Recommended Repair:** Require mandatory `organizationId` for all customer lookups. Reject any lookup that does not provide verified tenant context with HTTP 400 / 403.
- **Verification Criteria:** A query without tenant context fails with `Dairy context (organizationId) is required`; repository never iterates across unrelated tenant databases.
- **Status:** `Confirmed`
