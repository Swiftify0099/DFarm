# DFARM — ROADMAP PHASE 07: PRE-IMPLEMENTATION GAP AUDIT
**Document Reference:** `docs/implementation/ROADMAP_PHASE_07_PRE_IMPLEMENTATION_GAP_AUDIT.md`  
**Execution Phase:** Roadmap Phase 07 — Dairy Admin Operational Management  
**Target Application:** `apps/dfarm-dairy-admin`  
**Backend Service:** `services/backend`  
**Database:** Existing Dairy-specific PostgreSQL tenant databases  
**Status:** COMPLETE AUDIT BASELINE  

---

## 1. Executive Summary

This audit assesses the operational readiness of DFarm Dairy Admin across all 9 required functional domains in Roadmap Phase 07:
1. Dairy Admin Dashboard
2. Dairy-Specific Rate Chart Management
3. Cattle Feed Inventory and Farmer Feed Sales
4. Dairy Operational Device and Kiosk Management
5. Collection Session Monitoring and Collection Register
6. Customer Ledger Administration
7. Billing Operations
8. Payment Records & Manual Recording
9. Dairy Operational Reports & Exports

---

## 2. Functional Gap Audit Matrix

| Module | Source Files | API Endpoints | Tenant DB Tables | Status | Identified Gaps | Required Corrections |
|---|---|---|---|---|---|---|
| **Phase 06 Carry-Over Security** | `rfid.routes.ts`, `customers.routes.ts`, `Customer.ts` | `GET /rfid/lookup/:uid`, `PATCH /customers/:id`, `DELETE /customers/:id` | `rfid_cards`, `rfid_card_assignments`, `customers` | **SECURITY DEFECT** (Remediated) | Legacy `/rfid/lookup/:uid` had `optionalAuthenticate` and trusted query `organizationId`; returned unmasked customer JSON. | Enforced authentication, `customers:identify_rfid` permission, token tenant derivation, minimal data projection, anti-enumeration rate limiting, and bank field protection. |
| **Module A: Dashboard** | `dashboard.routes.ts`, `DashboardView.tsx` | `GET /api/v1/dashboard/summary`, `GET /api/v1/dashboard/metrics` | `customers`, `collection_transactions`, `collection_sessions`, `ledger_entries` | **IMPLEMENTED BUT NEEDS VERIFICATION** | Aggregates work on PostgreSQL, but some edge conditions returned zero-defaults if tables were unseeded. | Verify queries strictly query tenant database, aggregate real transactions, and reflect morning/evening shift split. |
| **Module B: Dairy Rate Charts** | `rate-charts.routes.ts`, `RateEngine.ts`, `RateChartManagement.tsx` | `GET /api/v1/rate-charts`, `POST /api/v1/rate-charts/draft`, `POST /api/v1/rate-charts/:id/activate`, `POST /api/v1/rate-charts/preview` | `rate_charts`, `rate_chart_versions`, `rate_chart_grid_cells` | **PARTIALLY IMPLEMENTED** | Rate charts list and creation work, but rate preview was missing a dedicated backend calculation endpoint; version history needs explicit preservation. | Add `POST /api/v1/rate-charts/preview` calculation endpoint; ensure historical collection records preserve applied rate snapshot; respect Phase 09 global policy boundary. |
| **Module C: Feed Inventory & Sales** | `feed.routes.ts`, `FeedSalesView.tsx`, `FeedInventoryView.tsx` | `GET /api/v1/feed/products`, `GET /api/v1/feed/sales`, `POST /api/v1/feed/stock`, `POST /api/v1/feed/sales` | `feed_products`, `center_product_inventory`, `stock_movements`, `feed_sales`, `feed_sale_items`, `ledger_entries` | **MOCK/HARDCODED** (Critical Gap) | `POST /stock` and `POST /sales` returned mock JSON without database persistence! Stock was hardcoded to `100`, stock movements table was unused, and credit sales did not post to customer ledger! | Implement genuine persistence using Migration 014 schema (`feed_products`, `center_product_inventory`, `stock_movements`, `feed_sales`), enforce atomic inventory decrements (no negative stock), and post balanced double-entry ledger debit for credit purchases. |
| **Module D: Devices & Kiosks** | `devices.routes.ts`, `DeviceManagement.tsx` | `GET /api/v1/devices`, `POST /api/v1/devices/:id/sync`, `GET /api/v1/devices/telemetry` | `central_hardware_inventory` (central), `devices` (tenant), `dairy_centers` (tenant) | **PARTIALLY IMPLEMENTED** | Lists devices assigned from central hardware, but operational mapping to collection centers and calibration metadata records need formalization. | Add operational device mapping and calibration history metadata endpoints; ensure Dairy Admin cannot alter central hardware allocation. |
| **Module E: Collection Monitoring** | `collections.routes.ts`, `SessionsView.tsx`, `CollectionRegisterView.tsx` | `GET /api/v1/collections/sessions`, `GET /api/v1/collections/sessions/active`, `POST /api/v1/collections/sessions/open`, `POST /api/v1/collections/sessions/:id/close`, `GET /api/v1/collections/transactions` | `collection_sessions`, `collection_transactions` | **COMPLETE AND VERIFIED** | Session lifecycle (open, active, close) and transaction register are fully functional. | Verify date, session, and customer filters on transactions; confirm unconfirmed offline sync records are not shown as accepted. |
| **Module F: Customer Ledger** | `ledger.routes.ts`, `LedgerView.tsx` | `GET /api/v1/ledger/summary`, `GET /api/v1/ledger/entries`, `GET /api/v1/ledger/balance`, `POST /api/v1/ledger/adjustment` | `ledger_accounts`, `ledger_entries` | **COMPLETE AND VERIFIED** | Double-entry ledger architecture works cleanly with milk credit, feed debit, and payment debit postings. | Ensure immutability (no direct edits, no entry deletion); verify adjustment reversals preserve balanced debits/credits. |
| **Module G: Billing Operations** | `bills.routes.ts`, `BillingView.tsx` | `GET /api/v1/bills`, `POST /api/v1/bills/generate` | `bills`, `bill_line_items` | **IMPLEMENTED BUT NEEDS VERIFICATION** | Bill generation from milk collections and deductions exists. Must preserve boundary with Phase 09. | Verify billing period calculations; ensure finalized bills reference authoritative ledger records and match Customer App passbook view. |
| **Module H: Payment Records** | `payments.routes.ts`, `PaymentsView.tsx` | `GET /api/v1/payments`, `POST /api/v1/payments` | `payments`, `ledger_entries` | **COMPLETE AND VERIFIED** | Manual recording of completed payments with balanced ledger posting. Verified zero Razorpay calls in farmer payments. | Verify duplicate reference check; preserve boundary for Phase 09 bulk NEFT/RTGS payouts. |
| **Module I: Operational Reports** | `ReportsHub.tsx`, `dashboard.routes.ts` | `GET /api/v1/reports/...` or composite queries | All tenant tables | **PARTIALLY IMPLEMENTED** | Frontend pulls operational data from individual endpoints. Lacks dedicated bounded server-side export routes for CSV/JSON. | Add dedicated reporting and export endpoints with masked PII, bounded pagination, and role permission checks. |

---

## 3. Detailed Technical Defect Remediation Plan

### Defect 1: Feed Inventory & Sales Persistence (Module C)
- **Problem**: `POST /feed/stock` and `POST /feed/sales` in `feed.routes.ts` were mocked out with static responses.
- **Fix**: Wire `feed.routes.ts` to execute real SQL statements against `center_product_inventory`, `stock_movements`, `feed_sales`, `feed_sale_items`, and `ledger_entries`. Enforce transaction rollback if stock is insufficient or if ledger posting fails.

### Defect 2: RFID Lookup Authentication & Data Leakage (Carry-Over Gate 4.1)
- **Problem**: `GET /api/v1/rfid/lookup/:uid` had `optionalAuthenticate` and allowed unauthenticated callers to query full farmer data including bank details.
- **Fix**: Require `authenticate`, `authorizePermission('customers:identify_rfid', 'customers:read', 'rfid:manage')`, token tenant derivation, rate limiting, and minimal data projection.

### Defect 3: Rate Chart Preview Endpoint (Module B)
- **Problem**: UI rate preview had no dedicated calculation endpoint.
- **Fix**: Add `POST /api/v1/rate-charts/preview` using `RateEngine` to calculate preview payable amounts without recording uncommitted financial mutations.

### Defect 4: Device Calibration & Operational Mapping (Module D)
- **Problem**: Device calibration records and operational counter mapping were missing structured persistence.
- **Fix**: Provide operational device mapping and calibration metadata logging under `devices.routes.ts`.

---

## 4. Conclusion & Readiness

The gap audit is complete. Implementing the 4 remediation items alongside verification of Modules A, E, F, G, H, and I will achieve 100% production readiness for Roadmap Phase 07.
