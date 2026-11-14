# DFarm Financial Accounting Test Suite & Precision Verification
**Phase 12 of 20: 22 Critical Accounting Verification Scenarios**

---

## 1. Test Architecture & Execution

The financial accounting test suite verifies double-entry integrity, mathematical precision, immutability, customer ownership isolation, and reconciliation across PostgreSQL and Node.js.

### Execution Command
```bash
cd services/backend
node --test tests/customer-ledger-accounting.test.js
```

---

## 2. Test Scenarios & Pass Criteria

| # | Scenario Name | Test Verification Details | Status |
| :-: | :--- | :--- | :---: |
| 1 | **Milk Credit** | Milk intake session completion atomically increases running liability balance and generates balanced `MILK_PURCHASE_EXPENSE` (Debit) and `CUSTOMER_PAYABLE` (Credit) journal entries. | **PASS** |
| 2 | **Advance Debit** | Disbursing an advance reduces customer liability (`CUSTOMER_PAYABLE` Debit, `CASH_BANK` Credit) and establishes an `ACTIVE` loan record. | **PASS** |
| 3 | **Partial Advance Recovery** | Partial cash recovery increases customer liability back by recovered amount, updates `recovered_amount`, and preserves `ACTIVE` loan status. | **PASS** |
| 4 | **Full Advance Recovery** | Full settlement clears remaining loan principal and transitions loan status to `FULLY_RECOVERED`. Over-recovery exceeding remaining principal is rejected with `400 OVER_RECOVERY_PROHIBITED`. | **PASS** |
| 5 | **Deduction Posting** | Authorized charges (Veterinary, AI, Insurance) debit customer payable and credit deduction income without altering historical transactions. | **PASS** |
| 6 | **Duplicate Financial Event** | Repeating a request with an existing idempotency key returns the cached receipt and strictly prevents double-posting or duplicate balance decrement. | **PASS** |
| 7 | **Balanced Journal** | Verification query confirms that every transaction in `ledger_transactions` has $\sum \text{Debit Entries} = \sum \text{Credit Entries} = \text{Transaction Amount}$. | **PASS** |
| 8 | **Unbalanced Journal Rejection** | Database constraints reject direct insertion of unbalanced entries or negative amounts into `ledger_entries`. | **PASS** |
| 9 | **Running Balance Accuracy** | Verification confirms that `current_balance` strictly matches $\text{Opening Balance} + \sum \text{Credits} - \sum \text{Debits}$. | **PASS** |
| 10 | **Opening Balance Initialization** | Authorized Admin imports initial credit or debit. Duplicate opening balance requests for the same customer are rejected with `409 Conflict`. | **PASS** |
| 11 | **Intake Reversal** | Supervisor reversal of an erroneous collection creates a `COLLECTION_REVERSAL_DEBIT` transaction and exactly restores the customer's prior balance. | **PASS** |
| 12 | **Adjustment Approval** | Supervisor/Admin adjustment with mandatory reason succeeds and updates balance with replacement ledger transaction. | **PASS** |
| 13 | **Unauthorized Adjustment** | Operators and customers attempting to post ledger adjustments are rejected with `403 Forbidden`. | **PASS** |
| 14 | **Immutable Historical Transactions** | Direct SQL `UPDATE` or `DELETE` on `ledger_transactions` triggers database exception (`CANNOT_MUTATE_LEDGER` / `CANNOT_DELETE_LEDGER`). | **PASS** |
| 15 | **Customer Ownership Isolation** | Farmers can view only their own ledger summary and statement. Inquiring on another customer returns `403 CUSTOMER_ISOLATION_VIOLATION`. | **PASS** |
| 16 | **Cross-Organization Isolation** | Staff from Organization B are prevented from accessing or modifying customer accounts in Organization A (`403 CROSS_ORGANIZATION_ACCESS_DENIED`). | **PASS** |
| 17 | **Reconciliation Success** | Clean customer ledger returns `isReconciled: true` with 0 discrepancies and exact account balance agreement. | **PASS** |
| 18 | **Reconciliation Mismatch Detection** | Artificial running balance tampering is detected immediately as `RUNNING_BALANCE_MISMATCH` without silent auto-correction. | **PASS** |
| 19 | **Decimal Precision** | Demonstrates that financial calculations avoid floating-point errors (e.g., $0.10 + 0.20 = 0.30$) by using PostgreSQL arbitrary-precision `NUMERIC(10,2)`. | **PASS** |
| 20 | **Database Rollback** | Transactional failure during posting (e.g. invalid negative amount) triggers automatic rollback leaving zero partial entries in tables. | **PASS** |
| 21 | **Feed Debit Integration Contract** | Verifies defined interface contract (`FeedDebitIntegrationContract`) for P14 feed integration without creating fake feed tables. | **PASS** |
| 22 | **Historical P10 Collection Regression** | Verifies that milk collection intake and historical collections operate identically without regressions. | **PASS** |

---

## 3. Test Suite Run Output

```
TAP version 13
# Subtest: DFarm Phase 12: Customer Financial Accounting & Double-Entry Ledger Suite (22 Scenarios)
    ok 1 - 0. Setup Test Organizations, Centers, Staff Users, and Customers
    ok 2 - 1. Milk credit: synchronous credit increases running liability balance & creates balanced journal
    ok 3 - 2. Advance debit: emergency cash advance reduces dairy liability balance & creates active advance
    ok 4 - 3. Partial advance recovery: partially recovers advance & credits customer liability ledger
    ok 5 - 4. Full advance recovery: settles remaining principal & rejects over-recovery
    ok 6 - 5. Deduction posting: authorized charges (veterinary, AI service, insurance) reduce liability balance
    ok 7 - 6. Duplicate financial event: duplicate idempotency key returns cached receipt without double-posting
    ok 8 - 7. Balanced journal: every transaction in ledger has SUM(Debits) = SUM(Credits)
    ok 9 - 8. Unbalanced journal rejection: direct insertion of unbalanced entries is rejected by constraints
    ok 10 - 9. Running balance: current_balance strictly equals Opening + Credits - Debits
    ok 11 - 10. Opening balance: Authorized Admin initializes opening balance & prevents duplicates
    ok 12 - 11. Reversal: supervisor collection reversal creates debit reversal transaction and restores prior balance
    ok 13 - 12. Adjustment approval: Supervisor adjustment with mandatory reason succeeds and updates balance
    ok 14 - 13. Unauthorized adjustment: Operator and Farmer cannot perform ledger adjustments (403 Forbidden)
    ok 15 - 14. Immutable historical transactions: direct UPDATE or DELETE on ledger_transactions triggers database exception
    ok 16 - 15. Customer ownership: customer reads only own ledger; cross-customer access is forbidden
    ok 17 - 16. Cross-organization isolation: Staff from Org 2 cannot read or post to Org 1 customer ledger
    ok 18 - 17. Reconciliation success: clean customer ledger returns isReconciled: true and 0 discrepancies
    ok 19 - 18. Reconciliation mismatch detection: detects running balance drift without auto-correcting
    ok 20 - 19. Decimal precision: financial calculations use exact PostgreSQL NUMERIC arithmetic without floating-point error
    ok 21 - 20. Database rollback: transactional failure leaves zero partial entries in ledger or accounts
    ok 22 - 21. Feed debit integration contract: verifies defined interface contract for P14 feed integration
    ok 23 - 22. Historical P10 collection regression: verified milk collection posting functions identically without regression
    1..23
ok 1 - DFarm Phase 12: Customer Financial Accounting & Double-Entry Ledger Suite (22 Scenarios)
1..1
# tests 24
# suites 0
# pass 24
# fail 0
```
