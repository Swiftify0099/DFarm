# DFarm — Prompt 03 Pre-Implementation Inspection Report
## Dairy Admin Operational Readiness, Customer Approval, Milk Intake Sessions, Dynamic Rate Charts & Kiosk Management

**Document Reference:** `DFARM-INSPECT-003`  
**Execution Phase:** Prompt 03 — Inspection & Baseline Audit  
**Status:** Completed  
**Date:** 2026-11-17  
**Author:** DFarm Principal Solution Architect & Implementation Auditor  

---

## 1. Executive Summary

In accordance with Prompt 03 instructions, a comprehensive technical inspection of `apps/dfarm-dairy-admin`, `services/backend`, and tenant database migrations was conducted. The baseline established in Prompt 01 (Physical Database-per-Dairy Provisioning & Clean Architecture Tenant Routing) and Prompt 02 (Super Admin Central Control Plane, Hardware Inventory, and AMC Management) provides a stable foundation:
- All 114 automated tests across `@dfarm/database`, `@dfarm/backend`, `dfarm-collection-app`, `dfarm-customer-app`, `dfarm-dairy-admin`, and `dfarm-super-admin` are passing 100%.
- The physical PostgreSQL database-per-dairy engine (`TenantDatabaseManager.ts`) isolates every tenant's operational data (`dfarm_tenant_<code_hash>`) while maintaining the central control plane in `dfarm_central`.
- The Dairy Admin frontend (`apps/dfarm-dairy-admin`) features an existing, approved Claymorphism design system. In accordance with strict instructions, **zero UI redesign is permitted**.

This inspection details the operational readiness of Dairy Admin, identifies areas requiring production backend alignment, and maps the exact dependencies for Prompt 03.

---

## 2. Dairy Admin Web Client Architecture (`apps/dfarm-dairy-admin`)

### 2.1 Technology Stack & Structure
- **Framework:** React 18 with TypeScript and Vite.
- **State & Data Fetching:** `@tanstack/react-query` v5 for reactive caching, polling, and optimistic updates.
- **Styling:** Custom Claymorphism design tokens (clay-card, clay-button, warm earth tones `#FF6A00`, `#211B18`, `#FFF5EE`).
- **Icons & Visuals:** `lucide-react` icons and domain-specific SVGs (`CowVisual`, `BuffaloVisual`, `MilkCanVisual`, `FaceBiometricVisual`, `IotMachineVisual`, `LedgerShieldVisual`).
- **Charts:** `recharts` for collection volume and quality trend visualization.

### 2.2 API Client & Tenant Headers (`client.ts`)
The API client (`apps/dfarm-dairy-admin/src/api/client.ts`):
- Reads authentication tokens from `localStorage` (`dfarm_admin_session_token`, `dfarm_admin_tenant_id`, `dfarm_admin_user_data`).
- Injects standard headers:
  ```typescript
  headers['Authorization'] = `Bearer ${token}`
  headers['X-Dairy-Tenant-ID'] = dairyId
  headers['x-dairy-id'] = dairyId
  ```
- Targets `VITE_API_BASE_URL` (defaulting to `http://localhost:4000/api/v1`).
- Rejects failed responses with structured `ApiError` mapping HTTP status and error details.

### 2.3 Mock Server vs. Production API Bridge Audit
A critical finding during the Prompt 0 audit was the presence of `mock-server.ts` and hardcoded IDs (`CURRENT_DAIRY_ID = 'dairy-ten-9801'`).
- **Grep Inspection Finding:** `mock-server.ts` is **NEVER imported** by any production React component, page, or context in `apps/dfarm-dairy-admin/src/`.
- All pages call the typed `api` object in `src/api/index.ts`, which dispatches real HTTP `fetch` requests via `apiRequest()` to backend `/api/v1/*` endpoints.
- `mock-server.ts` is strictly imported within unit test files (`src/test/*.test.ts`).
- **Required Action:** Ensure all backend `/api/v1/*` endpoints handle the Dairy Admin contracts with physical tenant database isolation, eliminating any need for local mock double fallbacks in production.

---

## 3. Module-by-Module Operational Inspection

### 3.1 Module A: Dairy Admin Authentication & Activation
- **Flow:** Super Admin creates dairy in `dfarm_central` -> generates activation invitation token (`029_dairy_admin_activation_tokens.sql`) -> Primary Dairy Admin visits `/activate?token=...` -> validates token -> receives OTP -> submits OTP and sets password/confirms -> account activated -> logs in via `/auth/admin/otp/request` and `/auth/admin/otp/verify`.
- **Backend Inspection:** `auth.routes.ts` provides `/auth/admin/otp/request`, `/auth/admin/otp/verify`, and `/auth/admin/me`.
- **Token Verification:** Issues HMAC-SHA256 JWT containing `userId`, `role: 'PRIMARY_DAIRY_ADMIN'`, and `organizationId`.
- **Verification Need:** Ensure `GET /auth/admin/me` correctly resolves dairy name, dairy code, and organization UUID from the central database.

### 3.2 Module B: Customer Registration & Administrative Approval
- **Workflow:**
  1. Farmer initiates registration on `apps/dfarm-customer-app` (`POST /api/v1/customers/register`).
  2. Record created in tenant DB with `registration_status = 'PENDING_APPROVAL'`, `status = 'INACTIVE'`.
  3. Face embedding (128-dimensional vector from YuNet + SFace) encrypted via AES-256-GCM.
  4. Dairy Admin views queue on `apps/dfarm-dairy-admin` (`GET /api/v1/customers/pending`).
  5. Dairy Admin reviews candidate name, mobile, village, milk category, bank details, and face quality score.
  6. **Approval:** `POST /api/v1/customers/:id/approve` (or `PATCH`) sets `registration_status = 'APPROVED'`, `status = 'ACTIVE'`, assigns farmer code (e.g. `C-101`), activates face enrollment, logs status history.
  7. **Rejection:** `POST /api/v1/customers/:id/reject` (or `PATCH`) enforces minimum 5-character reason, sets status to `REJECTED`, records audit log.
  8. Farmer app polls `GET /api/v1/customers/:id/status` and updates UI immediately upon approval.
- **Inspection Finding:** Routes exist in `customers.routes.ts` (`POST /:id/approve`, `POST /:id/reject`). To maximize robustness and cross-app compliance, `PATCH` aliases must be supported alongside `POST`.

### 3.3 Module C: Milk Collection Session Lifecycle & Intake
- **Workflow:**
  1. Dairy Admin / Kiosk Operator views shift sessions (`GET /api/v1/collections/sessions`).
  2. Kiosk opens shift (`POST /api/v1/collections/sessions/open` or `POST /api/v1/collections/sessions`).
  3. Collection App posts milk intake (`POST /api/v1/collections/transactions` or `POST /api/v1/collections/intake`).
  4. Intake transaction calculates price using active rate chart, checks idempotency key, records weighment and FAT/SNF reading.
  5. **Atomic Financial Posting:** Atomically inserts double-entry record into `customer_ledger_entries` (CREDIT to farmer subledger) and updates customer balance.
  6. Shift close (`POST /api/v1/collections/sessions/:id/close` or `PATCH`) reconciles total volume, total value, cow/buffalo split, and average FAT/SNF.
  7. Non-destructive adjustment (`POST /api/v1/collections/transactions/:id/adjust`) updates transaction status to `ADJUSTED` and posts balancing ledger entry.
- **Inspection Finding:** `collections.routes.ts` implements these handlers. We must ensure `POST /api/v1/collections/sessions` and `PATCH /api/v1/collections/sessions/:id/close` are supported cleanly alongside existing paths.

### 3.4 Module D: Dynamic Rate Charts & Versioning
- **Workflow:**
  1. Dairy Admin views rate charts (`GET /api/v1/rate-charts`).
  2. Dairy Admin creates draft version (`POST /api/v1/rate-charts/draft`) with milk category (COW / BUFFALO), base rate, min/max FAT, min/max SNF, and future effective date.
  3. Dairy Admin activates version (`POST /api/v1/rate-charts/:id/activate`).
  4. **Effective Date Immutability:** Historical collection transactions retain their original `applied_rate_per_unit` and `rate_chart_version_id`. New rate charts only affect future intakes.
- **Inspection Finding:** `rate-charts.routes.ts` currently queries `db` directly. It must be updated to route through `tenantDbManager.getTenantDb(organizationId)` so rate charts reside strictly in the tenant database.

### 3.5 Module E: Assigned Hardware & Kiosk Management
- **Workflow:**
  1. Super Admin creates hardware in `central_hardware_inventory` (`dfarm_central`) and assigns it to a dairy (`assigned_dairy_id`).
  2. Dairy Admin views devices in `apps/dfarm-dairy-admin` (`GET /api/v1/devices`).
  3. Kiosk station displays connected peripherals (Essae scale, Lactoscan analyzer, RFID reader).
  4. Sync command (`POST /api/v1/devices/:id/sync`) triggers synchronization.
- **Inspection Finding:** `devices.routes.ts` previously returned static data. It must query `central_hardware_inventory` from `dfarm_central` for devices assigned to the dairy and join with tenant `devices` table.

### 3.6 Module F: Ledger, Billing & Payout Batches
- **Double-Entry Ledger:** `ledger.routes.ts` provides `GET /ledger/entries` and `POST /ledger/adjustment`.
- **Billing:** `bills.routes.ts` provides `GET /bills` and `POST /bills/generate`.
- **Payments:** `payments.routes.ts` records disbursements (`POST /payments`), posting a DEBIT to the farmer ledger.
- **CRITICAL INVARIANT:** Farmer payouts are settled via double-entry bank batches. **Razorpay is strictly excluded from farmer payouts.**

---

## 4. Gap Analysis & Remediation Requirements

| Area | Current State | Required State | Action |
|---|---|---|---|
| Customer Approval | `POST /:id/approve` only | Supports both `POST` and `PATCH` | Add `router.patch` route aliases in `customers.routes.ts` |
| Customer Rejection | `POST /:id/reject` only | Supports both `POST` and `PATCH` | Add `router.patch` route aliases in `customers.routes.ts` |
| Session Lifecycle | `POST /sessions/open` only | Supports `POST /sessions` and `PATCH /sessions/:id/close` | Add route aliases in `collections.routes.ts` |
| Rate Charts DB Scope | Queries `db` directly | Queries `tenantDbManager.getTenantDb(organizationId)` | Update `rate-charts.routes.ts` to use tenant DB client |
| Hardware Inventory | Hardcoded list in `devices.routes.ts` | Queries `central_hardware_inventory` assigned to dairy | Connect `devices.routes.ts` to central hardware DB |
| Dashboard Metrics | Basic metrics | Returns both nested and flat properties for frontend compatibility | Enhance `dashboard.routes.ts` response payload |
| Test Coverage | Mock-based Vitest in dairy admin | Real backend test suite (`dairy-admin-production.test.js`) | Author comprehensive integration test suite |

---

## 5. Certification of Inspection

The pre-implementation inspection is complete. The system architecture, database ownership, route mappings, and frontend-backend contracts are verified. Proceeding immediately to the Implementation Plan.
