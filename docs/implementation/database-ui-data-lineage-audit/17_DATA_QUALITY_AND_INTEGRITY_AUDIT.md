# DFARM — DATA QUALITY AND INTEGRITY AUDIT
## CHECK CONSTRAINTS, ENUM INTEGRITY, BALANCES & AUDIT CHECKS

**Audit Reference:** `DFARM-AUDIT-DATA-QUALITY-001`  
**Date:** 2026-11-18  

---

### 1. Database Check Constraints & Invariant Enforcement

| Table Name | Column / Expression | Constraint Type | Business Invariant Enforced | Enforced in Schema |
|---|---|---|---|---|
| `milk_collections` | `quantity_liters > 0` | CHECK | Milk volume must be strictly positive | YES (008) |
| `milk_collections` | `fat_percentage BETWEEN 1.5 AND 15.0` | CHECK | Prevents impossible fat readings | YES (008) |
| `milk_collections` | `snf_percentage BETWEEN 4.0 AND 14.0` | CHECK | Prevents impossible SNF readings | YES (008) |
| `milk_collections` | `rate_per_liter >= 0` | CHECK | Milk rate cannot be negative | YES (008) |
| `monthly_bills` | `net_payable_amount >= 0` | Application Check | Negative payout blocked; carryover balance created | YES (020) |
| `payment_batches` | `status IN ('DRAFT','PENDING_APPROVAL','APPROVED','EXPORTED','RECONCILED')` | CHECK | Strict state machine lifecycle | YES (021) |
| `payment_approvals`| `maker_user_id != checker_user_id` | CHECK / Trigger | Mandatory Maker-Checker segregation of duties | YES (025) |
| `rate_chart_cells`| `rate > 0` | CHECK | Prevents zero-priced milk matrices | YES (018) |
| `ledger_entries` | `debit_amount >= 0 AND credit_amount >= 0` | CHECK | Non-negative line amounts | YES (019) |

---

### 2. High-Risk Data Anomaly Inspection

1. **Orphan Records Risk:**
   - Evaluated foreign key cascading rules. `customers` utilizes `ON DELETE RESTRICT` across `milk_collections`, `monthly_bills`, `customer_ledger_accounts`, and `payment_batch_items`.
   - Result: Impossible to delete an active farmer while financial or collection history exists.
2. **Double-Debit Prevention on Bank File Export:**
   - Audited `PaymentController.exportBatch`. The download endpoint generates standard RBI NEFT files with a SHA-256 integrity checksum and does **not** debit ledger accounts.
   - Payout settlement debit is strictly deferred until atomic reconciliation confirmation (`POST /api/v1/payments/reconciliation`).
