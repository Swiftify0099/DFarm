# DFarm Dairy Admin Web — Billing & Customer Ledger Documentation

## 1. Server-Authoritative Double-Entry Ledger

Each customer account maintains an immutable financial ledger where:

$$\text{Closing Balance} = \text{Opening Balance} + \sum \text{Milk Credits} - \sum \text{Feed Debits} - \sum \text{Payment Adjustments}$$

### Ledger Entry Taxonomy
- `MILK_CREDIT`: Automatically credited whenever an intake transaction is recorded at a collection kiosk.
- `FEED_DEBIT`: Automatically debited when a farmer purchases cattle feed or mineral supplements on credit.
- `PAYMENT_RECEIVED`: Credited when a fortnightly payout settlement is disbursed via bank transfer/cash.
- `AUTHORIZED_ADJUSTMENT`: Posted when an administrative correction or incentive bonus is applied.

Direct balance editing is strictly prohibited. The backend remains the sole authority for balance computations.

---

## 2. Fortnightly Billing Cycle & Settlements

DFarm supports configurable billing cycles (typically 15-day fortnightly cycles: 1st–15th and 16th–end of month).

### Bill Generation Formula
$$\text{Net Payable Amount} = \text{Total Milk Earnings} - \text{Total Feed Deductions} \pm \text{Authorized Adjustments}$$

### Duplicate Bill Prevention
The backend database enforces uniqueness on `(dairy_id, customer_id, period_start, period_end)`. If a bill is already generated or settled for that window, duplicate generation attempts fail with HTTP 409 Conflict.
