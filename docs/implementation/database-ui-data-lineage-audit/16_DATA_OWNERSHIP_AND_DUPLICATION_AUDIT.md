# DFARM — DATA OWNERSHIP AND DUPLICATION AUDIT
## CANONICAL MASTERS, DENORMALIZED COPIES & FINANCIAL SINGLE SOURCE OF TRUTH

**Audit Reference:** `DFARM-AUDIT-OWNERSHIP-001`  
**Date:** 2026-11-18  

---

### 1. Canonical Masters vs Derived Replicas

| Domain Concept | Authoritative Single Source of Truth | Permitted Derived Copies | Synchronization Invariant |
|---|---|---|---|
| **Farmer Identity** | Tenant DB: `customers` | `milk_collections.customer_code`, `monthly_bills.customer_code` | Write-once denormalization for kiosk throughput |
| **Dairy Master** | Central DB: `organizations` | Tenant DB: `tenant_metadata.dairy_name` | Provisioning-time replica |
| **Milk Rate Price** | Tenant DB: `rate_chart_cells` | `milk_collections.rate_per_liter`, `financial_rate_snapshot` | Snapshot is immutable upon intake save |
| **Farmer Balance** | Tenant DB: `customer_ledger_accounts.current_balance` | Read-only UI aggregation | Direct sum of verified journal ledger lines |
| **Bill Amount** | Tenant DB: `monthly_bills.net_payable_amount` | `payment_batch_items.net_payable_amount` | Immutable lock upon bill finalization |
| **RFID Mapping** | Tenant DB: `rfid_card_assignments` | Kiosk local IndexedDB cache | Refresh on active shift session start |

---

### 2. Immutability Invariants & Elimination of Double-Spend Risks

1. **Pure Separation of Sensor vs Financial Adjustments:** Raw weight from weighing scales is recorded in `quantity_liters` and never altered post-intake.
2. **Double-Entry Financial Enforceability:** No financial balance may be altered without an associated `ledger_transactions` journal entry and balancing `ledger_entries` lines.
