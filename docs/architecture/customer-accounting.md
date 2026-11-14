# DFarm: Customer Financial Accounting Architecture
**Phase 12 of 20: Comprehensive Double-Entry Customer Liability Accounting Specification**

---

## 1. Executive Summary & Core Philosophy

The DFarm Customer Accounting Engine implements an auditable, append-only, double-entry financial system tailored for modern dairy cooperatives and private milk procurement operations.

In the dairy domain, the farmer/customer is fundamentally a **creditor** to the enterprise: every liter of milk delivered increases the dairy's monetary obligation to the producer. All transactions are recorded from the perspective of the **Dairy Enterprise**, modeling customer accounts strictly as **Current Liabilities (Accounts Payable)**.

```mermaid
flowchart TD
    subgraph Procurement["Milk Procurement (Credits)"]
        MC["Cow & Buffalo Milk Intake"] -->|CREDIT (+)| CLA["Customer Liability Account"]
        INC["Producer Incentives & Bonuses"] -->|CREDIT (+)| CLA
        OBC["Opening Balance Credit"] -->|CREDIT (+)| CLA
    end

    subgraph Disbursements["Disbursements & Deductions (Debits)"]
        ADV["Customer Advances"] -->|DEBIT (-)| CLA
        FEED["Feed Purchases (Credit)"] -->|DEBIT (-)| CLA
        DED["Authorized Deductions (Vet/AI)"] -->|DEBIT (-)| CLA
        PAY["Farmer Settled Payouts"] -->|DEBIT (-)| CLA
        OBD["Opening Balance Debit"] -->|DEBIT (-)| CLA
    end

    CLA -->|"Closing Balance = Opening + Credits - Debits"| BAL["Farmer Ledger Balance (Payable/Receivable)"]
```

---

## 2. The Dairy Customer Liability Model

### 2.1 Sign Convention Standards

| Operation Direction | Impact on Dairy Obligation | Plain-Language Accounting Meaning | Examples |
| :---: | :---: | :--- | :--- |
| **CREDIT (+)** | **Increases Liability** | The dairy owes more money to the customer. | Morning milk intake, Evening milk intake, Quality incentives, Seasonal bonuses, Advance recoveries. |
| **DEBIT (-)** | **Decreases Liability** | The dairy's liability to the customer is reduced or customer obligation increases. | Cash advance disbursements, Cattle feed purchases, Veterinary medicine charges, AI services, Cycle payouts. |

### 2.2 Balance Mathematical Formulation

Authoritative running balances are computed deterministically using exact PostgreSQL arbitrary-precision arithmetic:

$$\text{Closing Balance} = \text{Opening Balance} + \sum \text{Credits} - \sum \text{Debits}$$

- **Positive Balance ($> 0.00$):** **Net Dairy Liability (Farmer Credit).** The cooperative owes money to the farmer for accumulated milk deliveries awaiting settlement.
- **Zero Balance ($= 0.00$):** **Fully Settled.** All milk credits have been settled via payouts or offset by advances and deductions.
- **Negative Balance ($< 0.00$):** **Customer Debt (Receivable).** The customer owes money to the dairy (e.g., cattle feed or emergency advances exceed current milk deliveries).

---

## 3. Double-Entry Financial Journal Integrity

Every financial transaction posted to the customer subledger produces an immutable `ledger_transactions` entry and at least two balanced `ledger_entries` satisfying the fundamental equation of double-entry bookkeeping:

$$\sum \text{Debit Entries} = \sum \text{Credit Entries}$$

### 3.1 Chart of Accounts

| Account Type | Category | Normal Balance | Role in Customer Ledger |
| :--- | :--- | :---: | :--- |
| `CUSTOMER_PAYABLE` | Liability | Credit | Farmer subledger liability account. |
| `MILK_PURCHASE_EXPENSE` | Expense | Debit | Cost of raw milk procured at centers. |
| `FEED_INVENTORY` | Asset | Debit | Stock of cattle feed sold to farmers. |
| `CASH_BANK` | Asset | Debit | Cash counter and cooperative bank disbursement accounts. |
| `ADVANCE_RECEIVABLE` | Asset | Debit | Principal advance receivables outstanding from farmers. |
| `DEDUCTION_INCOME` | Income / Clearing | Credit | Offsetting account for veterinary fees, AI services, insurance. |
| `INCENTIVE_EXPENSE` | Expense | Debit | Seasonal bonuses, volume incentives. |
| `OPENING_BALANCE_EQUITY`| Equity | Credit | Equity clearing account for historical balance migrations. |
| `RECONCILIATION_SUSPENSE`| Suspense | Either | Balancing suspense account for audit adjustments. |

### 3.2 Canonical Transaction Mapping

| Transaction Scenario | Debit Account | Credit Account | Ledger Direction |
| :--- | :--- | :--- | :---: |
| **Milk Delivery Credit** | `MILK_PURCHASE_EXPENSE` | `CUSTOMER_PAYABLE` | `CREDIT` |
| **Customer Cash Advance** | `CUSTOMER_PAYABLE` | `CASH_BANK` | `DEBIT` |
| **Advance Cash Recovery** | `CASH_BANK` | `CUSTOMER_PAYABLE` | `CREDIT` |
| **Feed Purchase on Credit**| `CUSTOMER_PAYABLE` | `FEED_INVENTORY` | `DEBIT` |
| **Authorized Deduction** | `CUSTOMER_PAYABLE` | `DEDUCTION_INCOME` | `DEBIT` |
| **Opening Balance (Credit)**| `OPENING_BALANCE_EQUITY`| `CUSTOMER_PAYABLE` | `CREDIT` |
| **Opening Balance (Debit)** | `CUSTOMER_PAYABLE` | `OPENING_BALANCE_EQUITY`| `DEBIT` |
| **Administrative Incentive**| `INCENTIVE_EXPENSE` | `CUSTOMER_PAYABLE` | `CREDIT` |
| **Intake Reversal** | `CUSTOMER_PAYABLE` | `MILK_PURCHASE_EXPENSE`| `DEBIT` |

---

## 4. Concurrency Control & Row-Level Locking

Financial balance updates and ledger entries are executed exclusively via stored PostgreSQL functions (`plpgsql`) wrapped in strict database transactions. Direct balance modifications via application queries are rejected by database triggers.

To prevent lost updates, race conditions, and phantom reads during concurrent counter intakes and advance disbursements:
1. `customer_ledger_accounts` rows are locked explicitly via `SELECT ... FOR UPDATE`.
2. `customer_advances` rows are locked via `SELECT ... FOR UPDATE` before applying recoveries.
3. Immutability trigger `trg_ledger_transactions_immutable` raises exceptions on direct `UPDATE` or `DELETE` statements on `ledger_transactions`.

---

## 5. Security & Isolation Boundaries

1. **Customer Ownership:** Farmers authenticated with `FARMER_CUSTOMER` role can strictly query their own ledger summaries, transactions, and statements. Cross-customer access attempts fail with `403 CUSTOMER_ISOLATION_VIOLATION`.
2. **Organization Multi-Tenancy:** All ledger queries enforce `organization_id` tenancy checks. Staff from Organization A attempting access to Organization B customers fail with `403 CROSS_ORGANIZATION_ACCESS_DENIED`.
3. **Role-Based Authorization:**
   - Collection Operators can record milk and recover cash advances.
   - Supervisors and Center Managers can disburse advances, post deductions, and reverse intake sessions.
   - Only Dairy Owners and Super Admins can initialize opening balances or adjust historical postings.
