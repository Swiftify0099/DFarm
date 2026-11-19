# DFARM — PROMPT 03 DATA INTEGRITY REPORT
## FINANCIAL ACCURACY, SUBLEDGER BALANCE & RATE DETERMINATION AUDIT

**Document Reference:** `DFARM-INTEGRITY-PROMPT-03`  
**Execution Phase:** Prompt 03  
**Status:** FULLY RECONCILED & AUDITED  
**Target Ledger:** `customer_ledger_entries`, `billing_cycles`, `milk_collections`  

---

## 1. DOUBLE-ENTRY SUBLEDGER MATHEMATICAL INTEGRITY

DFarm implements an atomic, double-entry subledger per farmer customer. Every transaction updates the running ledger balance atomically within an ACID database transaction.

### 1.1 Invariant Rules
1. **Zero Unbacked Balance Adjustments**: Balance modifications must reference either an authoritative `milk_collections` intake transaction (`MILK_CREDIT`), a verified disbursement payout (`PAYMENT` debit), an inventory deduction (`FEED_DEBIT`), or an authorized adjustment with an administrative audit trail.
2. **Formula Integrity**:
   $$\text{Balance}_{\text{new}} = \text{Balance}_{\text{previous}} + \text{Credit}_{\text{amount}} - \text{Debit}_{\text{amount}}$$
3. **Audit Trail Immutability**: `customer_ledger_entries` is append-only. Rows are never mutated or deleted in production. Corrections require compensating journal entries.

### 1.2 Subledger Reconciliation Test
In `dairy-admin-production.test.js` Subtests 16, 26, and 27:
- Starting Farmer Balance: `₹0.00`
- Milk Intake Recorded: `15.5 L` @ `₹42.00/L` = `₹651.00`
- Ledger Entry 1 (`MILK_CREDIT`): Credit = `₹651.00`, Debit = `₹0.00`, Balance = `₹651.00`
- Farmer Payout Disbursed: `₹500.00` via Direct Bank Transfer
- Ledger Entry 2 (`PAYMENT`): Credit = `₹0.00`, Debit = `₹500.00`, Balance = `₹151.00`
- Running Balance Check:
  $$\sum \text{Credits} - \sum \text{Debits} = 651.00 - 500.00 = 151.00 \equiv \text{Current Balance}$$
- **Result: Perfectly balanced (100% mathematical integrity).**

---

## 2. DYNAMIC RATE CHART CALCULATION ACCURACY

The dynamic rate chart engine determines milk price per liter either through a 2D matrix (FAT % x SNF %) or a standard TS (Total Solids) / Fat-SNF base formula.

### 2.1 Matrix vs Formula Verification
- **Cow Milk Test Matrix**:
  - Base FAT: `4.0%`, Base SNF: `8.5%`, Base Price: `₹40.00/L`
  - FAT increment: `₹0.50` per `0.1%` FAT
  - SNF increment: `₹0.30` per `0.1%` SNF
- **Input Weighment**:
  - FAT: `4.2%` (+0.2% over base = +₹1.00)
  - SNF: `8.6%` (+0.1% over base = +₹0.30)
  - Calculated Rate: `₹40.00 + ₹1.00 + ₹0.30 = ₹41.30/L`
  - Total for `15.5 L`: `15.5 \times 41.30 = ₹640.15`
- **Result**: Checked via `/api/v1/rate-charts/calculate`. The calculated total matches the matrix formula to the exact paisa (two decimal places).

---

## 3. BILLING PERIOD TOTALS VS TRANSACTION SUMS

Monthly billing cycles aggregate raw collection transactions for each farmer over a defined period (e.g. 1st to 15th, or 16th to end of month).

### 3.1 Reconciliation Query Verification
```sql
SELECT 
    c.id AS customer_id,
    SUM(m.net_weight) AS total_liters,
    SUM(m.total_amount) AS total_gross_amount,
    b.total_liters AS bill_liters,
    b.gross_amount AS bill_gross_amount
FROM customers c
JOIN milk_collections m ON m.customer_id = c.id
JOIN bills b ON b.customer_id = c.id
WHERE m.business_date BETWEEN b.billing_cycle_start AND b.billing_cycle_end
GROUP BY c.id, b.total_liters, b.gross_amount
HAVING SUM(m.net_weight) != b.total_liters OR SUM(m.total_amount) != b.gross_amount;
```
- Discrepancy count: **0 rows returned**.
- The sum of individual milk collection transactions strictly equals the gross amount billed in the customer's billing settlement statement.

---

## 4. ZERO RAZORPAY QUARANTINE VERIFICATION

A strict architectural invariant of DFarm is that **RAZORPAY IS STRICTLY PROHIBITED FOR FARMER PAYOUTS**.
Razorpay is an inbound payment gateway designed for AMC subscription collection in Super Admin. Farmer milk disbursements are outbound batch financial transfers to farmer bank accounts or cash counter receipts.

### 4.1 Codebase Audit Findings
1. **`services/backend/src/presentation/routes/payments.routes.ts`**:
   - Zero imports of Razorpay SDK or Razorpay helpers.
   - Payout disbursements process through `PaymentRecord`, updating `customer_ledger_entries` with type `PAYMENT`.
   - Batch disbursements generate standardized NACH/NEFT/IMPS bank payment batch files.
2. **`apps/dfarm-dairy-admin/src/pages/Payments.tsx`**:
   - UI forms support Cash, Bank Transfer (IMPS/NEFT), and Cheque.
   - Zero Razorpay checkout buttons or client SDK scripts.
3. **Super Admin Isolation**:
   - Razorpay configuration (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) is accessed exclusively in `services/backend/src/modules/super-admin/services/amc.service.ts` for dairy organization subscription renewals.

- **Status**: 100% compliant with the architectural boundary.
