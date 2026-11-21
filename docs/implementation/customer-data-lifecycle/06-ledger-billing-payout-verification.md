# Customer Financial Ledger, Monthly Billing & Payout Verification

**Document:** `06-ledger-billing-payout-verification.md`  
**Monorepo Track:** DFarm Multi-Tenant Enterprise Architecture  
**Scope:** Verification of immutable double-entry ledger, bill generation, and payout operations.

---

## 1. Accounting Principles & Rules

Each Dairy operates an independent accounting ledger stored exclusively in that Dairy's physical PostgreSQL tenant database:

1. **Double-Entry Immutability:** Ledger transactions are append-only. No records in `customer_ledger_entries` or `ledger_transactions` are updated or deleted in place. Reversals are made via compensating debit/credit journal entries.
2. **Tenant Isolation:** A customer's ledger at Dairy A is mathematically independent of their ledger at Dairy B. Credits earned at Dairy A cannot offset feed purchases at Dairy B.
3. **Auditability:** Every ledger entry links to a source transaction (`milk_collections.id`, `feed_sales.id`, or `monthly_bills.id`).

---

## 2. Ledger Transaction Types

| Transaction Type | Debit / Credit | Ledger Account | Description |
|---|---|---|---|
| `MILK_COLLECTION_CREDIT` | Credit | Customer Payable | Created upon milk intake at collection counter |
| `FEED_PURCHASE_DEBIT` | Debit | Customer Receivable | Cattle feed purchase on credit from dairy inventory |
| `ADJUSTMENT_DEBIT` / `CREDIT` | Either | Adjustments | Manual correction authorized by Dairy Admin |
| `BILL_SETTLEMENT` | Debit | Customer Payable | Net balance billed for a cycle |
| `PAYOUT_DISBURSEMENT` | Debit | Bank / Cash Account | Payment transferred to farmer bank account |

---

## 3. Monthly Bill Generation Process

1. **Billing Period Discovery:**
   The billing engine first queries tenant table `billing_periods` for the active center and cycle dates (`start_date`, `end_date`). If none exists, it provisions a `CALENDAR_MONTH` or `CUSTOM_PERIOD` record in status `GENERATED`.
2. **Collection Aggregation:**
   Sums all approved milk collections for the customer in the date window:
   ```sql
   SELECT COALESCE(SUM(net_weight), 0) AS total_weight, COALESCE(SUM(total_amount), 0) AS total_amount
   FROM milk_collections
   WHERE (customer_id = $1 OR customer_id = $2) AND business_date BETWEEN $3 AND $4;
   ```
3. **Feed & Advance Deductions:**
   Calculates unsettled cattle feed sales and cash advances.
4. **Bill Persistence:**
   Inserts into tenant `monthly_bills`:
   - `total_milk_weight`
   - `gross_milk_amount`
   - `feed_purchases_debit`
   - `net_payable_amount = gross_milk_amount - feed_purchases_debit`
   - `bill_status = 'GENERATED'`
5. **Customer App Visibility:**
   Customer queries `GET /api/v1/bills`. The bills endpoint queries `monthly_bills` joined with `customers` using the physical tenant database client.

---

## 4. Test Verification Results

In `customer-data-lifecycle-e2e.test.js` Step 7:
- **Intake:** 20.5 Liters of milk at ₹42.00/L = ₹861.00 gross amount.
- **Bill Generated:** `BILL-154399` generated with `totalMilkWeight: 20.5` and `netPayableAmount: 861.00`.
- **API Response:** `GET /api/v1/bills` returned HTTP 200 with 1 bill record matching `totalLiters = 20.5` and `netPayableAmount = 861.00`.
- **Isolation Check:** The bill is visible exclusively to the customer when authenticated with Dairy A context.
