# DFARM — DATABASE AND API PERFORMANCE AUDIT
## INDEX EFFICIENCY, QUERY OPTIMIZATION & CONNECTION POOLING

**Audit Reference:** `DFARM-AUDIT-PERF-001`  
**Date:** 2026-11-18  

---

### 1. Indexing Strategy & High-Volume Query Optimization

Across the 93 tenant tables, **175 indexes** have been defined to cover primary collection and financial query paths:

| Query Use Case | Target Table | Columns Indexed | Index Identifier | Type |
|---|---|---|---|---|
| **Intake History Search** | `milk_collections` | `customer_id, created_at DESC` | `idx_milk_collections_cust_date` | B-Tree Composite |
| **Shift Session Aggregation** | `milk_collections` | `session_id` | `idx_milk_collections_session` | B-Tree |
| **Farmer RFID Lookup** | `rfid_cards` | `card_uid` | `uidx_rfid_cards_card_uid` | Unique B-Tree |
| **Customer Code Lookup** | `customers` | `customer_code` | `uidx_customers_code` | Unique B-Tree |
| **Active Rate Matrix Lookup** | `rate_chart_cells` | `rate_chart_version_id, fat_percentage, snf_percentage` | `idx_rate_cells_version_fat_snf` | B-Tree Composite |
| **Ledger Statement Extraction** | `ledger_entries` | `ledger_account_id, created_at DESC` | `idx_ledger_entries_account_date` | B-Tree Composite |
| **Unreconciled Payout Items** | `payment_batch_items` | `batch_id, status` | `idx_payment_items_batch_status` | B-Tree Composite |

---

### 2. Tenant Connection Pool Allocation & Lifecycle

- **Pool Management:** Handled by `TenantDatabaseManager.ts`.
- **Max Connections per Tenant:** 5 connections (`TENANT_POOL_MAX`).
- **Connection Idle Timeout:** 30,000 ms (`TENANT_POOL_IDLE_TIMEOUT_MS`).
- **Connection Timeout:** 5,000 ms (`TENANT_POOL_CONNECTION_TIMEOUT_MS`).
- **Connection Re-use:** Active pools are cached in `tenantPools` Map keyed by `dairyId`. Unused pools time out cleanly without exhausting cluster resources.
