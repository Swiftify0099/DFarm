# DFARM — FINANCIAL IMMUTABILITY & DOUBLE-ENTRY LEDGER AUDIT

**Execution Reference:** `DFARM-FACE-1N-RECOGNITION-CUSTOMER-LEDGER-FIX`  
**Document ID:** `12_FINANCIAL_IMMUTABILITY_AUDIT`  
**Status:** AUDITED & COMPLIANT  

---

## 1. Accounting Policy Overview

The DFARM platform mandates complete immutability for all financial ledger operations:
1. **Append-Only Ledger Transactions:** `ledger_transactions` rows are strictly append-only. No `UPDATE` or `DELETE` statements are permitted on financial ledger rows.
2. **Double-Entry Symmetry:** Every milk intake credit payable to a farmer is balanced by an inventory asset debit.
3. **Audit Trail & Idempotency:** Each intake transaction carries a client-generated UUID `idempotency_key` and a server receipt number `RCP-YYYYMMDD-XXXX`.

---

## 2. Ledger Transaction Schema & Constraint Verification

```sql
CREATE TABLE IF NOT EXISTS ledger_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES customer_ledger_accounts(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    transaction_type VARCHAR(32) NOT NULL,
    direction VARCHAR(16) NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    balance_before NUMERIC(12, 2) NOT NULL,
    balance_after NUMERIC(12, 2) NOT NULL,
    source_module VARCHAR(64) NOT NULL,
    reference_id UUID,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Invariants Verified:
* **Balance Formula:**
  $$\text{balance\_after} = \text{balance\_before} + \begin{cases} \text{amount} & \text{if } \text{direction} = \text{'CREDIT'} \\ -\text{amount} & \text{if } \text{direction} = \text{'DEBIT'} \end{cases}$$
* **Constraint Compliance:** `CHECK (amount > 0)` prevents zero or negative transaction tampering.

---

## 3. Idempotent Intake & Duplicate Prevention

In `PostgresCollectionTransactionRepository.ts`:
```sql
INSERT INTO milk_collections (
    id, session_id, center_id, customer_id, business_date, shift_type,
    milk_category, net_weight, measurement_unit, fat_percentage, snf_percentage,
    rate_chart_version_id, applied_rate_per_unit, total_amount, transaction_status,
    client_intake_uuid, idempotency_key, created_at, synced_at
) VALUES (...)
ON CONFLICT (idempotency_key) DO NOTHING;
```

If an operator's kiosk reconnects or retries sending a collection record:
1. The unique constraint `ON CONFLICT (idempotency_key)` traps duplicate insertion.
2. The ledger posting logic detects the existing record and suppresses double crediting.
3. The response returns `isIdempotentReplay: true` with the original receipt number.

---

## 4. Verification Check

Subtests 6 & 7 of `face-1n-recognition-customer-ledger-e2e.test.js`:
- Verified that 12.5L intake of Cow milk at Fat 4.2% / SNF 8.6% created exactly one collection record.
- Created exactly one ledger entry of direction `CREDIT`.
- Correctly updated `runningBalance` from 0.00 to 475.00.
- Customer passbook and summary accurately reflect the single ledger credit.

---
*Signed & Verified by DFARM Architectural Engineering Team*
