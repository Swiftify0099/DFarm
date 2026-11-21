# DFARM — CUSTOMER PASSBOOK & DOUBLE-ENTRY LEDGER POSTING AUDIT

**Execution Reference:** `DFARM-FACE-1N-RECOGNITION-CUSTOMER-LEDGER-FIX`  
**Document ID:** `09_CUSTOMER_PASSBOOK_LEDGER_POSTING_AUDIT`  
**Status:** AUDITED & VERIFIED  

---

## 1. Accounting Mandate: Double-Entry Financial Immutability

In DFARM, milk collection is not merely an inventory record; it is an irrevocable financial transaction that creates an immediate payable obligation to the dairy farmer.

### Double-Entry Accounting Invariant:
Every completed milk intake transaction must:
1. Credit the farmer's payable ledger account (`customer_ledger_accounts` & `ledger_transactions`):
   - `direction`: `'CREDIT'`
   - `amount`: `totalAmount`
   - `source_module`: `'MILK_INTAKE'`
   - `reference_id`: `milk_collections.id`
2. Update the farmer's `customer_ledger_accounts.current_balance`:
   $$\text{balance}_{\text{new}} = \text{balance}_{\text{prev}} + \text{amount}$$
3. Be immediately visible in:
   - Customer App Passbook (`/api/v1/ledger/entries` & `/api/v1/ledger/summary`)
   - Customer App Delivery History (`/api/v1/collections/history`)
   - Customer App Monthly Summary (`/api/v1/collections/summary/monthly`)

---

## 2. Audit of Remediation

### 2.1 Dual Identifier Resolution in Ledger Repository
In `services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts`:
- **Auto-Initialization of Ledger Account:**
  If a customer profile exists in the tenant database but has not yet conducted transactions, `findByCustomer` auto-initializes their ledger account with balance `0.00`.
- **Dual ID Filter:**
  ```sql
  SELECT cla.*, c.global_customer_id, c.farmer_code, c.full_name
  FROM customer_ledger_accounts cla
  JOIN customers c ON c.id = cla.customer_id
  WHERE (cla.customer_id = $1 OR c.global_customer_id = $1);
  ```
  ```sql
  SELECT lt.*
  FROM ledger_transactions lt
  JOIN customers c ON c.id = lt.customer_id
  WHERE (lt.customer_id = $1 OR c.global_customer_id = $1)
  ORDER BY lt.created_at DESC;
  ```

### 2.2 Date Range Monthly Aggregation
In `services/backend/src/infrastructure/repositories/PostgresCollectionTransactionRepository.ts`:
Rather than fragile `TO_CHAR` strings or unsafe casts, `getMonthlySummary` computes exact ISO month boundaries:
```sql
SELECT 
  COALESCE(SUM(mc.net_weight), 0.00) AS total_liters,
  COALESCE(SUM(CASE WHEN mc.milk_category = 'COW' THEN mc.net_weight ELSE 0 END), 0.00) AS cow_liters,
  COALESCE(SUM(CASE WHEN mc.milk_category = 'BUFFALO' THEN mc.net_weight ELSE 0 END), 0.00) AS buffalo_liters,
  COALESCE(AVG(mc.fat_percentage), 0.00) AS avg_fat,
  COALESCE(AVG(mc.snf_percentage), 0.00) AS avg_snf,
  COALESCE(SUM(mc.total_amount), 0.00) AS total_amount,
  COUNT(mc.id) AS transaction_count
FROM milk_collections mc
JOIN customers c ON c.id = mc.customer_id
WHERE (mc.customer_id = $1 OR c.global_customer_id = $1) 
  AND mc.business_date >= $2
  AND mc.business_date <= $3
  AND mc.transaction_status = 'COMPLETED';
```
Parameters `$2` and `$3` represent `'YYYY-MM-01'` and `'YYYY-MM-LD'`.

---

## 3. End-to-End Verification Check

Subtest 7 of `face-1n-recognition-customer-ledger-e2e.test.js` executed queries using the authenticated Customer App JWT token (`req.user.userId = global_customer_id`):
1. `GET /api/v1/ledger/entries`: Returned 1 ledger entry, `direction: 'CREDIT'`, `amount: 475.00`, `runningBalance: 475.00`.
2. `GET /api/v1/ledger/summary`: Returned `currentBalance: 475.00`, `totalCredit: 475.00`.
3. `GET /api/v1/collections/history`: Returned 1 delivery record, `customerName: 'Prakash Patil'`, `weightLiters: 12.5`.
4. `GET /api/v1/collections/summary/monthly?monthYear=2026-11`: Returned `totalLiters: 12.5`, `transactionCount: 1`.

---
*Signed & Verified by DFARM Architectural Engineering Team*
