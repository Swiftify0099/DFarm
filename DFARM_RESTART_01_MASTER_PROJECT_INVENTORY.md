# DFarm — RESTART-01 Master Project Inventory

**Audit Sequence:** `RESTART-01` (Strictly Read-Only Baseline Audit)  
**Generated At:** `2026-11-26`  
**Repository:** `Swiftify0099/DFarm`  
**Active Worktree:** `c:\Users\panka\.gemini\antigravity\worktrees\DFarm\dfarm_customer_app_init`  
**Target Branch:** `fix/cloudflare-pages-production-deploy`

---

## 1. Phase 0 — Repository Identity, Safety & Git State Audit

### 1.1 Git Topology & Working Tree Status
| Check | Observed Baseline Value |
| :--- | :--- |
| Repository Root / Active Worktree | `c:\Users\panka\.gemini\antigravity\worktrees\DFarm\dfarm_customer_app_init` |
| Active Branch | `fix/cloudflare-pages-production-deploy` |
| `HEAD` SHA | `6fddf03cb35c343f38a7f4f1a46ac0cc9632c0c3` |
| `origin/fix/cloudflare-pages-production-deploy` SHA | `6fddf03cb35c343f38a7f4f1a46ac0cc9632c0c3` (matches `HEAD`) |
| `git rev-parse --is-shallow-repository` | `false` (full history clone) |
| Git Tags (`git tag -l`) | None (`0` tags) |
| Working Tree Status (`git status --short`) | Clean (`nothing to commit, working tree clean`) |
| Tracked `.temp/` Files (`git ls-files .temp`) | `0` files |
| Untracked `.temp/` Preserved Locally | `1,829` files (`1,827` files inside `.temp/chrome-cdp/`), ignored via `.gitignore` |

### 1.2 Critical Drift Between FIX-02.3 Report and Current Repository State
`DFARM_FIX02_3_LOCAL_RELEASE_CANDIDATE_REPORT.md` recorded an earlier snapshot at commit `c84ab21` with `1,807` staged `.temp/` deletions, `97` unstaged modified files, and `10` untracked files awaiting release gating. Subsequent repository activity committed and pushed two commits onto `origin/fix/cloudflare-pages-production-deploy`:
1. `45aa5ae` (`updat promt`, 2026-11-26 15:11:59 +0530) — committed the `1,807` `.temp/` deletions and FIX-02 config/documentation updates.
2. `6fddf03` (`updates codes`, 2026-11-26) — committed all `112` FIX-01, FIX-01.1, Prompt 6.2, FIX-02.1, and FIX-02.3 files directly onto `fix/cloudflare-pages-production-deploy`.

**Security & Mirror Consequences:**
- **Live Remote History Still Exposed:** `git ls-remote origin` confirms `fix/cloudflare-pages-production-deploy` was advanced without rewriting history; live `origin` history still contains the 3 `.temp/` commits (`e638850`, `5cca96c`, `d3d2189`) and the 2 commits containing an earlier Google Maps key (`c3b1a24`, `110b899`).
- **Stale Rewritten Mirror:** The offline artifacts in `C:\Users\panka\.gemini\antigravity\brain\e6c389d6-c511-4413-9bab-098685347c70\scratch\` (`dfarm-pre-rewrite-backup.bundle`, `dfarm-orig-mirror.git`, and `dfarm-audit-mirror.git`) are intact on disk, but `dfarm-audit-mirror.git` was built at `c84ab21` and does **not** include commits `45aa5ae` or `6fddf03`.

### 1.3 Live Remote Branches & Sibling Worktrees
- **Origin Branches:**
  - `main` (`d62ba16`)
  - `fix/cloudflare-pages-production-deploy` (`6fddf03`)
  - `feature/cloudflare-pages-deployment` (`9cd42bc`)
  - `dfarm_customer_app_init` (`e638850`)
  - Open/historical PR heads: `refs/pull/1/head` .. `refs/pull/8/head`
- **Sibling Worktrees (Preserved Untouched):**
  - `C:/Users/panka/OneDrive/Desktop/DFarm` — branch `stabilization/dfarm-two-app-stability` (`6a3b890`), `1,734` unstaged `D` files including `.gitignore`, `README.md`, and `apps/admin-web/...`.
  - `C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_mobile_app` — branch `dfarm_customer_mobile_app` (`6a3b890`), clean (`0` changes).

---

## 2. Monorepo Workspaces & Shared Packages

Configured in [package.json](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/package.json):

| Workspace Path | Package Role | Verification Status | Implementation Reality |
| :--- | :--- | :--- | :--- |
| `packages/shared-types` | Shared TypeScript DTOs & domain contracts | `tsc` passes cleanly (`npm run build:backend`) | Active (`Prompt 4/5/6/7` DTOs used by backend and web apps) |
| `packages/shared-validation` | Shared request/input validation schemas | `tsc` passes cleanly | Active |
| `packages/database` | Database schema verification & SQL loader ([index.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/index.ts)) | `22/22` non-PG unit tests pass; `real-postgres-verification.test.js` skipped | **Drift:** `index.ts` only lists migrations `001`–`037` (missing `038`–`043`); `schema-validation.test.js` only validates `001`–`010`. |
| `services/backend` | Node.js / Express + TypeScript modular/clean-architecture API server | `tsc` passes (`npm run build:backend`); mixed offline test pass/fail | **Dual-Stack Technical Debt:** Mixes hardened routes (`dairy-admin.routes.ts`, `super-admin.routes.ts`), partially hardened routes (`optionalAuthenticate` across 14+ route files), and unmounted/duplicated legacy `src/modules/*` routers. |

---

## 3. Applications Inventory

### 3.1 `apps/dfarm-dairy-admin` (Vite 8 / React 19 Web Console)
- **Entry & Router:** [App.tsx](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-dairy-admin/src/App.tsx), API client [client.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-dairy-admin/src/api/client.ts).
- **Implemented Pages (`apps/dfarm-dairy-admin/src/pages/`):**
  - Auth: `auth/Login.tsx`, `auth/ActivationPage.tsx` (`/login`, `/activate`)
  - Dashboard & Operations: `dashboard/Dashboard.tsx` (`/dashboard`)
  - Customers & Biometrics: `customers/PendingApprovals.tsx`, `customers/CustomerDirectory.tsx`, `customers/CustomerDetail.tsx`, `biometrics/FaceEnrollmentList.tsx`, `rfid/RfidManagement.tsx`
  - Milk Collection & Rates: `collection/CollectionSessions.tsx`, `collection/MilkCollectionRegister.tsx`, `quality/QualityAnalytics.tsx`, `rate-charts/RateChartManagement.tsx`
  - Accounting, Billing & Bank Payouts: `ledger/CustomerLedgerView.tsx`, `billing/BillingManagement.tsx`, `payments/PaymentRegister.tsx`, `feed/FeedInventory.tsx`
  - Hardware & Governance: `devices/DeviceManagement.tsx`, `reports/ReportsHub.tsx`, `staff/StaffManagement.tsx`, `audit/AuditLogViewer.tsx`, `profile/DairyProfile.tsx`
- **Tests & Build:** `5/5` frontend test files pass (`14/14` tests).
- **Audit Gaps:** Shares backend routes that rely on `optionalAuthenticate` (ledger adjustments, billing, rate charts, RFID, devices, audit logs, reports, payments). Static headers allow `'unsafe-inline'` scripts and `http:` `connect-src`.

### 3.2 `apps/dfarm-collection-app` (Vite 8 / React 19 Kiosk Web App)
- **Entry & Router:** [App.tsx](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-collection-app/src/App.tsx), API client [client.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-collection-app/src/api/client.ts).
- **Implemented Pages (`apps/dfarm-collection-app/src/pages/`):**
  - `auth/Login.tsx`, `collection/CollectionWorkspace.tsx`, `customers/CustomerLookup.tsx`, `customers/CustomerDetailModal.tsx`, `sessions/SessionManagement.tsx`, `sessions/OpenSessionModal.tsx`, `sessions/CloseSessionModal.tsx`, `sessions/SessionSummaryModal.tsx`, `devices/DeviceDiagnostics.tsx`, `devices/CameraConfigModal.tsx`, `devices/ReconnectWizard.tsx`, `sync/OfflineQueueView.tsx`, `settings/SettingsView.tsx`
- **Hardware Drivers (`src/drivers/`):** `MilkAnalyzerDriver.ts`, `ScaleDriver.ts`, `RfidReaderDriver.ts` (Web Serial / BLE / WebHID / mock adapters).
- **Tests & Build:** `17/17` frontend test files pass (`162/162` tests).
- **Audit Gaps:** Backend `collections.routes.ts` falls back to default UUIDs (`00000000-0000-0000-0000-000000000001/2/3`) via `optionalAuthenticate`, `sync.routes.ts` route-shadows `authenticateDevice`, and `collection-kiosk-production.test.js` fails `10/24` tests offline.

### 3.3 `apps/dfarm-super-admin` (Vite 8 / React 19 Platform Console)
- **Entry & Router:** [App.tsx](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/src/App.tsx), API client [client.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/src/api/client.ts).
- **Implemented Feature Views (`src/features/`):**
  - Auth & Profile: `auth/LoginPage.tsx`, `auth/ActivationPage.tsx`, `platform-access/PlatformAccessPage.tsx`
  - Dairies & Tenant DBs: `dairies/DairyListPage.tsx`, `dairies/CreateDairyModal.tsx`, `dairies/DairyActivationModal.tsx`, `dairies/DairyDetailPage.tsx`, `databases/TenantDatabaseManagerPage.tsx`, `locations/DairyLocationsPage.tsx`
  - Governance & Policies: `admins/AdminListPage.tsx`, `admins/CreateOperatorModal.tsx`, `admins/TransferAdminModal.tsx`, `rate-policies/GlobalRatePoliciesPage.tsx`, `fat-snf-policies/GlobalFatSnfPoliciesPage.tsx`, `settings/PlatformSettingsPage.tsx`, `support/SupportAccessPage.tsx`
  - Observability & Hardware: `monitoring/MonitoringPage.tsx`, `alerts/AlertsPage.tsx`, `audit/AuditLogsPage.tsx`, `reports/ReportsPage.tsx`, `hardware/HardwareInventoryPage.tsx`, `amc/AmcManagementPage.tsx`
- **Tests & Build:** `10/10` test files pass (`48/48` tests), backed largely by `src/services/mockBackend.ts`.
- **Audit Gaps:** `client.ts` silently falls back to `mockBackend` on API failures; `wrangler.json` uses `"name": "dfarmsuperadmin"` instead of `"dfarm-super-admin"`; `apps/dfarm-super-admin/.env` still holds `VITE_GOOGLE_MAPS_API_KEY` on disk; backend `/api/v1/dairies` CRUD/suspend/reactivate/location endpoints lack auth middleware.

### 3.4 `apps/dfarm-customer-app` (Expo 58 / React Native 0.88.1 Mobile App)
- **Entry & Routes (`src/app/`):**
  - Auth: `(auth)/login.tsx`, `(auth)/verify-otp.tsx`, `(auth)/select-dairy.tsx`
  - Onboarding: `(onboarding)/dairy-discovery.tsx`, `(onboarding)/register.tsx`, `(onboarding)/face-enroll.tsx`, `(onboarding)/pending-approval.tsx`
  - Main Tabs & Profile: `(main)/index.tsx`, `(main)/collection.tsx`, `(main)/ledger.tsx`, `(main)/bills.tsx`, `profile/index.tsx`, `profile/update-face.tsx`, `profile/diagnostics.tsx`
- **On-Device Face AI & Services:** `src/face-ai/{yunet-detector.ts,sface-embedder.ts,preprocessor.ts,manifest.ts,diagnostics.ts}`, `src/services/{api-client.ts,location-service.ts,secure-storage.ts,smsService.ts}`, `src/features/*`.
- **Tests:** `8/8` test suites pass (`31/31` tests).
- **Audit Gaps:** `src/services/smsService.ts` embeds Dove SMS client config (`EXPO_PUBLIC_DOVE_SMS_KEY || 'ba9dcdcdfcXX'`) in client bundle; backend `customers.routes.ts` exposes registration/approval/biometric endpoints under `optionalAuthenticate` + no-op `authorizePermission` callbacks, and queries control-plane `db` for `dairy_centers` during registration.

---

## 4. Backend Architecture (`services/backend/src`) Inventory

| Layer / Directory | Key Files Inspected | Operational Reality |
| :--- | :--- | :--- |
| **Entrypoint & Config** | `app.ts`, `config/env.ts`, `config/cors.ts`, `jwt.ts`, `security.ts`, `encryption.ts` | Mounts `cleanApiRouter` at `/api/v1` **and** mounts unhardened `modules/auth/auth.routes.ts` at `/api/v1/auth`, `/api/users/auth`, `/api/auth`. Hardcoded webhook/SMS/encryption fallbacks exist outside JWT validation. |
| **Middleware** | `middleware/authenticate.ts`, `presentation/middleware/{authenticate.ts,authorize.ts}` | `middleware/authenticate.ts:124-150` falls back to trusting unverified JWT claims (`role`, `organizationId`) when DB staff lookup returns null or errors. |
| **Presentation Routes (`src/presentation/routes/`)** | `index.ts` plus `20` sub-routers (`auth`, `dairies`, `customers`, `collections`, `devices`, `identity`, `sync`, `ledger`, `payments`, `bills`, `feed`, `staff`, `rate-charts`, `rfid`, `reports`, `notifications`, `audit`, `dashboard`, `dairy-admin`, `super-admin`, `tenant-database`) | Only `auth`, `dairy-admin`, `super-admin` underwent partial/major hardening. `14+` routers rely on `optionalAuthenticate`, missing auth, or broken `authorizePermission(...)(req, res, () => {})` calls (`customers`, `identity`, `rate-charts`, `rfid`). |
| **Legacy Modules (`src/modules/`)** | `auth`, `billing`, `biometrics`, `collections`, `customers`, `dashboard`, `employees`, `feed`, `health`, `identification`, `ledger`, `notifications`, `payments`, `rates`, `reports`, `rfid`, `sync` | Fragmented overlap: `modules/auth/auth.routes.ts` is live and passwordless; `modules/biometrics/biometric.routes.ts` and `modules/sync/sync.routes.ts` (`deviceRouter`) are **unmounted**; `payout.service.ts` still hits control-plane `config/db.js`. |
| **Application Use Cases (`src/application/use-cases/`)** | `auth/{CustomerAuthUseCases,OperatorAuthUseCases}`, `collections/{MilkIntakeUseCases,BulkCollectionSyncUseCase}`, `sessions/ShiftSessionUseCases`, `customers/{SelectDairyMembershipUseCase,CustomerDirectoryUseCases}` | Domain logic is well-structured in clean use cases, but `RefreshTokenUseCase` lacks revocation/type checks and several routes call use cases omitting `organizationId` (`CloseShiftSessionUseCase`, `BulkCollectionSyncUseCase`). |
| **Infrastructure & Security (`src/infrastructure/`)** | `PostgresPool.ts`, `TenantDatabaseManager.ts`, `MigrationRunner.ts`, `PostgresShiftSessionRepository.ts`, `PostgresCollectionTransactionRepository.ts`, `PostgresCustomerRepository.ts`, `PostgresSuperAdminRepository.ts`, `RealtimeEventPublisher.ts`, `Aes256GcmBiometricEncryptor.ts` | `PostgresShiftSessionRepository` scans all tenant DBs when `organizationId` is missing and fabricates dummy orgs/centers/users on save; `RealtimeEventPublisher` polls control-plane DB only while collection outbox writes to `tenantDb`; biometric encryptor falls back to a hardcoded 64-hex key. |
| **Banking Integrations (`src/integrations/banking/union-bank/`)** | `UnionBankValidator.ts`, `UnionBankFileGenerator.ts`, `UnionBankResponseParser.ts`, `UnionBankApiClient.ts`, `UnionBankSubmissionService.ts`, `UnionBankStatusInquiryService.ts`, `UnionBankReconciliationService.ts` | CSV/CAPS generation & Reverse MIS parsing implemented, but defaults debit account to `'00000000000000'`, throws unconditional `502` in production (`UnionBankApiClient`), and `UnionBankReconciliationService` opens control-plane `pool.connect()` transactions against `payoutService`. |

---

## 5. Database & Migration Inventory

- **SQL Migration Files (`supabase/migrations/`):** `44` SQL files numbered `001` through `043`.
  - **Collision:** Prefix `031` is duplicated across `031_dairy_database_mappings.sql` and `031_remove_dairy_admin_7507495615.sql`.
  - **Runtime Runner Drift:**
    - `scripts/migrate.js` executes against configured DB, whereas:
    - `services/backend/src/infrastructure/database/MigrationRunner.ts` stops at migration `040` (omitting `041`, `042`, `043` during dynamic tenant database provisioning).
    - `packages/database/src/index.ts` stops at migration `037` (omitting `038`–`043`).
    - `PostgresPool.ts` / `TenantDatabaseManager.ts` `testMigrationFiles` include `040`–`043` for `pg-mem`, creating divergence between in-memory tests and provisioned tenant databases.
- **Physical PG Connectivity (Offline Audit):** Local PostgreSQL ports `5432` and `54322` are closed (`False`). All live Supabase/PostgreSQL schema state, triggers, RLS policies, and migration parity require verification once a local/isolated PostgreSQL instance is booted in `RESTART-05` / `RESTART-11`.

---

## 6. Infrastructure, CI/CD, Secrets & Environment Inventory

| Component / Artifact | Location | Audit Observation |
| :--- | :--- | :--- |
| Render Blueprint | `render.yaml` | Configures backend service, health check, CORS, JWT secret rules; **omits** `DATA_ENCRYPTION_KEY_HEX` and production SMS/WhatsApp/Union Bank secret requirements. |
| Cloudflare Pages Headers & Config | `apps/{dfarm-collection-app,dfarm-dairy-admin,dfarm-super-admin}/public/_headers`, `apps/dfarm-super-admin/wrangler.json` | `_headers` CSP allows `'unsafe-inline'` in `script-src` and `http:` in `connect-src`; super-admin `wrangler.json` project name mismatch (`"dfarmsuperadmin"`). |
| GitHub Actions Secret Scan | `.github/workflows/secret-scan.yml` | Runs Gitleaks `v8.21.2` + `.temp/` / Chrome profile guard on push/PR (`main`, `fix/cloudflare-pages-production-deploy`, `feature/**`). Not executed locally (`gitleaks` execution unverified offline). |
| Environment Files (`.env`) | `11` `.env` / `.env.*` files across root, `services/backend`, and all `4` apps | Ignored by `.gitignore`, but masked inspection detected `VITE_GOOGLE_MAPS_API_KEY` (`len=39`) in root `.env` & `apps/dfarm-super-admin/.env`, and `EXPO_PUBLIC_DOVE_SMS_KEY` (`len=12`) in root `.env` & `apps/dfarm-customer-app/.env`. |
| Deployment Docs | `DFARM_CLOUDFLARE_DEPLOYMENT.md`, `DFARM_SECURITY_GUIDE.md` | Deployment guide exists; live Render / Cloudflare dashboard runtime configs remain **NOT VERIFIED**. |
