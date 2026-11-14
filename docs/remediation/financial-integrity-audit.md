# DFarm Financial Integrity & Double-Entry Ledger Audit

**Document Reference:** `DFARM-FIN-AUDIT-004`  
**Classification:** Financial Systems Audit & Accounting Parity  
**Auditor:** Financial Systems Auditor & Senior PostgreSQL Engineer  
**Date:** November 14, 2026  
**Scope:** Phase 12 (Customer Financial Ledger & Double-Entry Accounting), Subledger Stored Procedures, and Cross-Phase Financial Invariants.  
**Status:** COMPLIANT WITH ZERO DRIFT  

---

## 1. Accounting Formula & Sign Conventions

DFarm strictly implements authoritative double-entry bookkeeping across all customer subledgers:

$$\text{Closing Balance} = \text{Opening Balance} + \text{Total Credits} - \text{Total Debits}$$

### Sign Convention & Economic Interpretation
- **Positive Current Balance ($> 0$):**
  - Represents a **Dairy Liability** and a **Farmer Asset**.
  - Denotes net unpaid funds owed by the dairy cooperative to the dairy farmer for milk deliveries.
  - Farmer is eligible to receive payouts up to this balance.
- **Negative Current Balance ($< 0$):**
  - Represents a **Dairy Receivable** and a **Farmer Debt**.
  - Denotes an outstanding obligation owed by the farmer to the dairy (e.g., cattle feed credit purchases, unrecovered emergency advances, veterinary supplies).
  - No payouts may be disbursed without explicit `allowOverpaymentAdvance` supervisor override.
- **Zero Balance ($= 0$):**
  - Accounts are fully squared and settled.

### Journal Balancing Invariant
Every transaction entry in `ledger_transactions` and its child entries in `ledger_entries` must enforce exact mathematical equilibrium:
$$\sum \text{Debits} = \sum \text{Credits}$$
Any unbalanced journal entry is rejected at the database trigger level and rolls back the enclosing transaction.

---

## 2. Ledger Transaction Types & Balancing Rules

| Transaction Type | Debit Target | Credit Target | Triggering Business Event |
| :--- | :--- | :--- | :--- |
| `MILK_COLLECTION_CREDIT` | Raw Milk Inventory / Expense A/C | Farmer Subledger (Dairy Liability) | Verified milk delivery recorded at counter |
| `FEED_PURCHASE_DEBIT` | Farmer Subledger (Dairy Liability) | Cattle Feed Sales Revenue A/C | Credit sale of cattle feed at POS counter |
| `ADVANCE_DEBIT` | Farmer Subledger (Dairy Liability) | Cash / Bank Clearing A/C | Cash emergency loan disbursed to farmer |
| `ADVANCE_RECOVERY_CREDIT` | Farmer Subledger (Dairy Liability) | Advances Receivable A/C | Farmer repays advance at collection booth |
| `PAYMENT_PAYOUT_DEBIT` | Farmer Subledger (Dairy Liability) | Bank Payout Settlement A/C | Bank transfer / NEFT payout confirmed settled |
| `CUSTOMER_RECEIPT_CREDIT` | Cash / Bank Inflow Clearing A/C | Farmer Subledger (Debt Reduction) | Farmer pays cash to clear outstanding negative debt |
| `COLLECTION_REVERSAL_DEBIT` | Farmer Subledger (Compensating Debit) | Inventory / Milk Reversal A/C | Spoiled or incorrectly recorded collection reversed |
| `PAYOUT_REVERSAL_CREDIT` | Bank Bounced / Return Clearing A/C | Farmer Subledger (Reinstated Liability) | Bank bounces NEFT payout post-settlement |

---

## 3. Concurrency Safety & Row-Level Locking

Financial balance drift in high-throughput collection centers is mitigated through strict PostgreSQL row-level locks:
1. Whenever a transaction posts to `customer_ledger_accounts`, it executes:
   ```sql
   SELECT * FROM customer_ledger_accounts WHERE customer_id = p_customer_id FOR UPDATE;
   ```
2. The running balance is recalculated from the locked row, ensuring serialized execution even during simultaneous milk intake deliveries across multiple counter terminals.
3. Over-recovery prevention is strictly enforced:
   ```sql
   IF p_amount > v_advance.remaining_principal THEN
       RAISE EXCEPTION 'OVER_RECOVERY_PROHIBITED: Recovery amount % exceeds outstanding balance %',
           p_amount, v_advance.remaining_principal USING ERRCODE = '22003';
   END IF;
   ```

---

## 4. Immutability & Audit Trail

1. **Database-Level Immutability:** Historical entries in `ledger_transactions` and `ledger_entries` are append-only. Triggers block any `UPDATE` or `DELETE` operations on settled financial journals.
2. **Compensating Transactions:** Errors or corrections are resolved exclusively through auditable compensating transactions (e.g., `PAYOUT_REVERSAL_CREDIT`, `COLLECTION_REVERSAL_DEBIT`).
3. **Idempotency Protection:** Every financial creation API requires an `idempotencyKey`. Replaying the same key returns the existing journal row without creating duplicate entries or skewing balances.
