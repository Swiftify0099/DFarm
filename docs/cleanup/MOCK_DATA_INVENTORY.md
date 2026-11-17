# DFarm Mock & Demo Data Inventory

**Document Version**: 1.0  
**Status**: Comprehensive Baseline Inventory  
**Auditor**: DFarm Production Readiness Engineering

---

## 1. Inventory Summary by Application

| Application / Layer | Mock Files Identified | Hardcoded Fallback Sites | Fake APIs / In-Memory Stores | Severity |
|---|---|---|---|---|
| **DFarm Customer App** | 0 dedicated files | 7 hooks + 3 screens | Catch-block fake objects | High |
| **DFarm Collection App** | `src/api/mock-backend.ts` | 5 components / contexts | In-memory customer/session store | High |
| **DFarm Dairy Admin** | `src/api/mock-server.ts` | 15 API bridge modules | `MockDairyBackend` in-memory singleton | Critical |
| **DFarm Super Admin** | `src/services/mockBackend.ts`, `src/services/seedData.ts` | 24 API client methods | Full mock CRUD simulator | Critical |
| **Backend Services** | 0 dedicated files | `PostgresPool.ts`, `dairies.routes.ts` | In-memory dummy seed, demo tokens | High |

---

## 2. Granular Inventory of Mock Artifacts

### 2.1 DFarm Customer App (`apps/dfarm-customer-app`)

| File | Type of Mock Data | Line Range / Identifier | Impact / Current Behavior |
|---|---|---|---|
| `src/features/dairy/useDairyDiscovery.ts` | Hardcoded array of 40+ mock dairies | L188–L384 | Returns dummy dairies when backend is down or returns empty list |
| `src/features/registration/useRegistration.ts` | Fabricated registration success | L46–L60 | Synthesizes fake UUID `a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d` and marks status `PENDING_APPROVAL` |
| `src/features/registration/useRegistration.ts` | Fake status poll fallback | L73–L79 | Returns hardcoded dairy name `Shree Krishna Sahakari Dudh Utpadak Sanstha` |
| `src/features/profile/useProfile.ts` | Fake profile fallback | L19–L35 | Injects fake farmer `Vitthal Dnyandeo Patil` on request failure |
| `src/features/collection/useCollection.ts` | Fake collection records | L23–L84 | Injects `COL-2026-11-15-M01` etc. on API error |
| `src/features/collection/useCollection.ts` | Fake monthly summary | L98–L118 | Injects `382.4 L`, `28 Collections` on API error |
| `src/features/ledger/useLedger.ts` | Fake ledger entries | L18–L50 | Injects `l1-01`, `l1-02`, `l1-03` on API error |
| `src/features/ledger/useLedger.ts` | Fake khata summary | L64–L71 | Injects `₹12,480.00` current balance on API error |
| `src/features/bills/useBills.ts` | Fake billing statements | L13–L46 | Injects `b1-01` and `b1-02` on API error |
| `src/app/(main)/index.tsx` | Hardcoded fallback values in JSX | L36, L39, L124, L131, L138, L149, L152, L160 | Renders fake strings/numbers if state is undefined |

### 2.2 DFarm Collection App (`apps/dfarm-collection-app`)

| File | Type of Mock Data | Line Range / Identifier | Impact / Current Behavior |
|---|---|---|---|
| `src/api/mock-backend.ts` | Complete mock backend module | Whole file (409 lines) | Contains dummy customers (`cust-101` Pandurang Patil, etc.), mock sessions, mock rate matrix |
| `src/api/client.ts` | Hardcoded Dairy & Operator fields | L159–L160 | Injects `Gokul Primary Cooperative` and `GOKUL-01` during OTP verification |
| `src/api/client.ts` | Hardcoded village fallbacks | L190, L216, L286 | Fallback `'Gokul Shirgaon'` |
| `src/api/client.ts` | Hardcoded biometric metadata | L198–L202, L223–L228, L293–L298 | Injects static quality score `97.5` |
| `src/components/workspace/CustomerLookupModal.tsx` | Import of `mock-backend` | Imports and uses `mock-backend` | Reads static customer list |
| `src/components/workspace/TransactionSummaryPanel.tsx` | Import of `mock-backend` | Imports and uses `mock-backend` | Computes summary from mock state |
| `src/pages/customers/CustomerLookup.tsx` | Import of `mock-backend` | Imports and uses `mock-backend` | Looks up customers in mock state |
| `src/context/AuthContext.tsx` | Import of `mock-backend` | Imports and uses `mock-backend` | Authenticates against mock operator list |
| `src/context/HardwareContext.tsx` | Simulated device telemetry | L15–L85 | Returns simulated scale/analyzer values when machine is disconnected |

### 2.3 DFarm Dairy Admin Web (`apps/dfarm-dairy-admin`)

| File | Type of Mock Data | Line Range / Identifier | Impact / Current Behavior |
|---|---|---|---|
| `src/api/mock-server.ts` | Complete mock Dairy Admin backend | Whole file (800+ lines) | In-memory store for customers, sessions, rate charts, ledger, billing, feed, payments |
| `src/api/index.ts` | Dashboard summary fallback | L61–L65 | Directly calls `MockDairyBackend.getDashboardSummary()` |
| `src/api/index.ts` | Pending registrations merge/fallback | L68–L96 | Merges real backend list with `MockDairyBackend.getPendingRegistrations()` |
| `src/api/index.ts` | Customer directory merge/fallback | L163–L210 | Merges real backend list with `MockDairyBackend.getCustomers()` |
| `src/api/index.ts` | Approvals & Rejections fallback | L97–L162 | Calls `MockDairyBackend` on error |
| `src/api/index.ts` | Customer CRUD fallback | L211–L220 | Calls `MockDairyBackend.getCustomerById`, `softDeleteCustomer`, `restoreCustomer` |
| `src/api/index.ts` | Face enrollments | L223–L233 | Calls `MockDairyBackend.getFaceEnrollments` |
| `src/api/index.ts` | RFID assignments | L236–L246 | Calls `MockDairyBackend.getRfidCards` |
| `src/api/index.ts` | Collection sessions & records | L248–L262 | Calls `MockDairyBackend.getCollectionSessions`, `getCollectionTransactions` |
| `src/api/index.ts` | Quality readings | L265–L269 | Calls `MockDairyBackend.getQualityReadings` |
| `src/api/index.ts` | Rate charts | L272–L297 | Calls `MockDairyBackend.getRateCharts`, `createRateChartVersion` |
| `src/api/index.ts` | Customer ledger | L300–L316 | Calls `MockDairyBackend.getCustomerLedger`, `performLedgerAdjustment` |
| `src/api/index.ts` | Billing management | L319–L332 | Calls `MockDairyBackend.getDairyBills`, `generateFortnightlyBill` |
| `src/api/index.ts` | Feed & inventory | L335–L360 | Calls `MockDairyBackend.getFeedProducts`, `recordFeedSale` |
| `src/api/index.ts` | Payment register | L363–L380 | Calls `MockDairyBackend.getPaymentRecords`, `recordCustomerPayment` |
| `src/api/index.ts` | Device sync | L383–L390 | Calls `MockDairyBackend.getCollectionDevices`, `triggerDeviceSync` |
| `src/api/index.ts` | Staff members | L393–L397 | Calls `MockDairyBackend.getStaffMembers` |
| `src/api/index.ts` | Audit logs | L400–L404 | Calls `MockDairyBackend.getAuditLogs` |
| `src/api/index.ts` | Notifications | L407–L414 | Calls `MockDairyBackend.getNotifications` |
| `src/api/index.ts` | Primary Admin Activation fallback | L417–L481 | Falls back to `MockDairyBackend.validateActivationToken` and `activatePrimaryAdmin` |

### 2.4 DFarm Super Admin Web (`apps/dfarm-super-admin`)

| File | Type of Mock Data | Line Range / Identifier | Impact / Current Behavior |
|---|---|---|---|
| `src/services/mockBackend.ts` | Complete Super Admin mock engine | Whole file (65 KB, 1,500+ lines) | Simulates tenants, admins, audit logs, health, reports, alerts |
| `src/services/seedData.ts` | Initial mock tenants & admins | Whole file (21 KB) | Pre-populates mock data in `mockBackend` |
| `src/api/client.ts` | Simulated network delay | L30–L33 | `simulateNetworkDelay(120)` artificially slowing calls |
| `src/api/client.ts` | Platform Users | L115–L118 | Directly delegates to `mockBackend.getPlatformUsers()` |
| `src/api/client.ts` | Dashboard Metrics | L121–L124 | Directly delegates to `mockBackend.getDashboardMetrics()` |
| `src/api/client.ts` | Global Analytics | L126–L129 | Directly delegates to `mockBackend.getGlobalAnalytics()` |
| `src/api/client.ts` | Dairies list fallback | L132–L159 | Syncs backend into `mockBackend` then returns `mockBackend.getDairies()` |
| `src/api/client.ts` | Dairy details | L161–L166 | Directly returns `mockBackend.getDairyById(id)` |
| `src/api/client.ts` | Suspend / Reactivate / Config | L238–L251 | Delegates directly to `mockBackend` |
| `src/api/client.ts` | Admins list | L254–L257 | Delegates directly to `mockBackend.getAdmins()` |
| `src/api/client.ts` | Activation links & validation | L276–L299 | Falls back to `mockBackend` |

### 2.5 Backend Services (`services/backend`)

| File | Type of Mock Data | Line Range / Identifier | Impact / Current Behavior |
|---|---|---|---|
| `src/infrastructure/database/PostgresPool.ts` | In-memory dummy seed records | L236–L398 | Inserts dummy organizations (Gokul, Warna), dummy users, dummy customers (Pandurang Patil, etc.), and pre-fabricated shift sessions |
| `src/presentation/routes/dairies.routes.ts` | Pre-seeded demo invitation | L1366–L1385 | Pre-populates `demo-activation-token` into in-memory invitation maps |

---

## 3. Mock Data Removal Plan

1. **Delete & Decouple**:
   - In frontends, replace all mock backend calls with clean, direct fetch/axios HTTP calls to the authoritative backend APIs.
   - For tests, keep isolated test fixtures in `src/test/` directories and never import them into application runtime screens.
2. **Remove Fallback Swallowing**:
   - Catch blocks must throw or return honest error states (`{ error: string, isError: true }`).
   - UI components must display dedicated `LoadingState`, `EmptyState`, or `ErrorState` views with retry triggers.
3. **Backend Sanitization**:
   - Purge `demo-activation-token` from `dairies.routes.ts`.
   - Ensure `PostgresPool.ts` only sets up schema definitions without inserting fake business records.
