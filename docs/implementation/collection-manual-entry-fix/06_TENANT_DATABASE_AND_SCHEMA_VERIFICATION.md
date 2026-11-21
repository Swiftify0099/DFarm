# TENANT DATABASE AND SCHEMA VERIFICATION

**Reference:** DFARM-COLLECTION-MANUAL-ENTRY-409-FIX  
**Target:** Physical & Isolated Tenant Database Integrity  
**Execution Context:** Verification of multi-tenant database routing, schema migrations, and relational integrity

---

## 1. Database-Per-Dairy Architecture Overview

DFarm enforces strict physical database isolation per dairy organization:
- **Central Control Plane Database:** `dfarm_central` (manages `organizations`, `dairy_database_mappings`, global customer identities, and system policies).
- **Tenant Database:** `dfarm_tenant_<code_hash>` (one separate PostgreSQL database per cooperative dairy, hosting `customers`, `dairy_centers`, `kiosk_shift_sessions`, `collection_shifts`, `collection_sessions`, `milk_collections`, `rate_charts`, `customer_ledger_accounts`, `ledger_transactions`).

Tenant database connections are managed by `TenantDatabaseManager.ts` with AES-256-GCM encrypted connection strings.

---

## 2. Tenant Database Schema Audit

| Table Name | Critical Columns & Constraints | Purpose |
| :--- | :--- | :--- |
| `organizations` | `id UUID PK`, `code`, `name`, `status` | Local reference anchor for foreign keys |
| `dairy_centers` | `id UUID PK`, `organization_id FK`, `contact_phone NOT NULL` | Center branch records |
| `users` | `id UUID PK`, `organization_id FK`, `role`, `status` | Counter operators, center managers |
| `kiosk_shift_sessions` | `id UUID PK`, `session_code UNIQUE`, `organization_id FK`, `center_id FK`, `opening_operator_id FK` | Operational shift sessions |
| `collection_shifts` | `id UUID PK`, `center_id FK`, `shift_type`, `UNIQUE(center_id, shift_type)` | Center shift timing configurations |
| `collection_sessions` | `id UUID PK`, `center_id FK`, `customer_id FK`, `shift_id FK`, `operator_id FK` | Individual intake sessions |
| `milk_collections` | `id UUID PK`, `session_id UNIQUE FK`, `idempotency_key UNIQUE`, `net_weight > 0` | Master milk collection intake records |
| `rate_charts` & `rate_chart_versions` | `id UUID PK`, `milk_category`, `is_active`, `is_approved` | Rate matrices & formula configurations |
| `customer_ledger_accounts` | `id UUID PK`, `customer_id UNIQUE FK`, `current_balance` | Double-entry patron ledger balance |
| `ledger_transactions` | `id UUID PK`, `customer_id FK`, `amount`, `idempotency_key UNIQUE`, `created_by FK` | Journal entries for credits/debits |

---

## 3. Findings & Resolution

1. **Missing Foundational Seed in Memory Tenant Databases:**
   `TenantDatabaseManager.ts` runs migration files 002-027 in `createIsolatedMemoryDatabase`, but left `organizations`, `dairy_centers`, and `users` unpopulated. This led to FK violation errors during shift session upserts.
2. **Self-Healing Requirement:**
   Just as `PostgresCustomerRepository.save` guarantees that `organizations` and `dairy_centers` exist before writing customer records, `PostgresShiftSessionRepository.save` and `PostgresCollectionTransactionRepository.save` must include self-healing upserts for the tenant's organization, center, and operator records.
3. **Database Constraints Preserved:**
   All unique constraints (`idempotency_key`, `session_code`, `session_id`) and foreign keys are correct, essential for data integrity, and must remain strictly enforced.
