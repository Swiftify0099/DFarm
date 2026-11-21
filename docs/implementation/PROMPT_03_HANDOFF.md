# DFARM — PROMPT 03 HANDOFF SPECIFICATION
## Dairy Admin Operational Readiness, Milk Intake Sessions, Dynamic Rate Charts & Kiosk Management

**Document Reference:** `DFARM-HANDOFF-003`  
**Previous Phase:** Prompt 02 — Super Admin Production Readiness  
**Target Phase:** Prompt 03 — Dairy Admin Operational Readiness  
**Target Primary Projects:** `apps/dfarm-dairy-admin`, `services/backend`, & Tenant Database Schema  
**Status:** Ready for Execution  
**Date:** 2026-11-17  

---

## 1. Context & Starting Point

Prompt 02 has established a hardened, production-ready Central Control Plane. The platform now possesses:
1. One central PostgreSQL database (`dfarm_central`) with migration `032` managing hardware inventory, AMC subscriptions, encrypted dairy bank details, and immutable audit logs.
2. Separate, automatically provisioned operational databases (`dfarm_tenant_<code_hash>`) for every registered Dairy cooperative.
3. Clean architecture tenant resolution middleware (`tenantResolver`) that decrypts tenant credentials and binds every operational request to that dairy's isolated database.
4. Working Super Admin web client (`apps/dfarm-super-admin`) wired directly to backend REST APIs.

Prompt 03 focuses on **`apps/dfarm-dairy-admin`** and tenant operational workflows.

---

## 2. Responsibilities of Prompt 03

The engineer or agent executing Prompt 03 is responsible for:

### 2.1 Dairy Admin Production Readiness & Activation
- Connecting `apps/dfarm-dairy-admin` to real backend APIs instead of browser mock storage.
- Ensuring that after primary dairy admin activation (via SMS/email OTP invitation generated in Prompt 02), the Dairy Admin can log in, view their cooperative's operational dashboard, and manage their collection centers.

### 2.2 Milk Intake Session Lifecycle & Collection Kiosks
- Managing morning and evening milk intake sessions.
- Assigning collection operators and kiosk devices (milk analyzers, digital scales, RFID readers registered in Prompt 02's central hardware inventory).
- Handling real-time shift start, pause, resume, and shift close reconciliation.

### 2.3 Dynamic Rate Charts & Calculation Formulas
- Implementing Cow, Buffalo, and Mixed milk rate matrices (FAT% vs SNF% grids and TS - Total Solids formula calculations).
- Effective date versioning: ensuring rate chart updates apply to future sessions without mutating historical collection settlements.
- Rate chart approval and publishing workflows within the tenant database.

### 2.4 Farmer Ledger & Payout Settlement Batches
- Viewing double-entry farmer ledgers (`CustomerLedgerAccount`) populated by milk collection intake transactions.
- Generating direct-to-bank settlement batch files (NEFT/RTGS format) using the farmer's registered bank details and the cooperative's bank account (encrypted in Prompt 02 via AES-256-GCM).
- **CRITICAL CONSTRAINT:** Payouts to farmers MUST remain on the double-entry tenant ledger and direct bank settlement batches. **DO NOT USE RAZORPAY FOR FARMER PAYOUTS.**

---

## 3. Database Ownership & Target Tables for Prompt 03

All operational tables created and managed in Prompt 03 belong **strictly to the tenant database (`dfarm_tenant_<code_hash>`)**, NEVER to `dfarm_central`:

| Table Name | Database Scope | Responsibility |
|---|---|---|
| `collection_sessions` | Tenant DB | Morning/Evening operational shifts |
| `milk_collection_transactions` | Tenant DB | Shift-level milk intake weighments and FAT/SNF tests |
| `rate_charts` | Tenant DB | Milk rate matrices and pricing versions |
| `rate_chart_rules` | Tenant DB | FAT/SNF deduction and premium increments |
| `ledger_entries` | Tenant DB | Double-entry credits for milk intake and debits for feed purchases |
| `payout_batches` | Tenant DB | Periodic milk payment settlement runs |
| `payout_batch_items` | Tenant DB | Individual farmer payout records and UTR references |

---

## 4. Crucial Guidelines & Non-Negotiables for Prompt 03

1. **UI Redesign Strictly Prohibited:** Keep all approved layouts, components, typography, and styling in `apps/dfarm-dairy-admin`.
2. **Strict Multi-Database Isolation:** Every operational query MUST pass through `tenantDbManager.getTenantPool(tenantId)` or use the scoped `req.tenantPool`. Never query tenant tables from `dfarm_central`.
3. **Double-Entry Financial Accounting:** Every milk intake transaction must create balanced debit and credit entries in the customer ledger. Zero balance discrepancy.
4. **Offline Sync Resilience:** Ensure milk intake transactions created on the kiosk (`apps/dfarm-collection-app`) sync reliably into the tenant database with cryptographic deduplication.

---

## 5. Artifacts & Hand-Off Checklist

Before starting Prompt 03, review:
- [PROMPT_01_IMPLEMENTATION_REPORT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docs/implementation/PROMPT_01_IMPLEMENTATION_REPORT.md)
- [PROMPT_02_IMPLEMENTATION_REPORT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docs/implementation/PROMPT_02_IMPLEMENTATION_REPORT.md)
- [PROMPT_02_TEST_REPORT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docs/implementation/PROMPT_02_TEST_REPORT.md)
- [PROMPT_02_SECURITY_VERIFICATION.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docs/implementation/PROMPT_02_SECURITY_VERIFICATION.md)
- [CENTRAL_CONTROL_PLANE_SCHEMA.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docs/architecture/CENTRAL_CONTROL_PLANE_SCHEMA.md)
- [TENANT_DATABASE_SCHEMA.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docs/architecture/TENANT_DATABASE_SCHEMA.md)

Prompt 02 is hereby certified complete and ready for Prompt 03 initiation.
