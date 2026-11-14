# DFarm Automated Subledger & Accounting Integration

## 1. Accounting Principles & Design Invariants
Milk collection directly alters financial obligations between the dairy cooperative/organization and registered dairy farmers. DFarm enforces real-time automated subledger posting using GAAP double-entry principles:

1. **Server-Authoritative Calculation:** Payout amounts are strictly calculated on the database server based on approved rate charts. Client-side numbers are never trusted.
2. **Immediate Balance Update:** Every completed collection immediately credits the farmer's balance in `customer_ledger_accounts`.
3. **Balanced Double-Entry Entries:** Every collection produces matching Credit and Debit entries in `ledger_entries` satisfying $\sum \text{Debits} = \sum \text{Credits}$.
4. **Immutable Audit Trail:** Financial records (`ledger_transactions`, `ledger_entries`) are append-only. Adjustments or reversals generate offsetting debit transactions without deleting original records.
5. **Atomic Commit:** Milk intake and ledger entries are executed in the same PostgreSQL transaction (`complete_milk_collection_session`).

---

## 2. Double-Entry Accounting Matrix

### 2.1 Standard Milk Delivery (Credit to Farmer)
When a farmer delivers 10.0 KG of Cow milk at ₹36.50/KG:
- **Total Amount:** ₹365.00
- **Journal Entries:**
  | Account Type | Entry Type | Amount (INR) | Description |
  | :--- | :--- | :--- | :--- |
  | `CUSTOMER_PAYABLE` (Farmer Subledger) | **CREDIT** | ₹365.00 | Increases dairy's payable liability to farmer |
  | `MILK_PURCHASE_EXPENSE` (Dairy General Ledger) | **DEBIT** | ₹365.00 | Milk purchase expense incurred by dairy |

### 2.2 Supervisor Collection Reversal (Debit from Farmer)
When an incorrect collection of ₹365.00 is reversed:
- **Adjustment Debit Amount:** ₹365.00
- **Journal Entries:**
  | Account Type | Entry Type | Amount (INR) | Description |
  | :--- | :--- | :--- | :--- |
  | `CUSTOMER_PAYABLE` (Farmer Subledger) | **DEBIT** | ₹365.00 | Decreases dairy's payable liability to farmer |
  | `MILK_PURCHASE_EXPENSE` (Dairy General Ledger) | **CREDIT** | ₹365.00 | Reversal of milk purchase expense |

---

## 3. Database Schema Mapping

### `customer_ledger_accounts`
Maintains the real-time financial balance for each customer:
- `id` (UUID PK): Ledger account ID.
- `customer_id` (UUID UNIQUE FK -> `customers.id`).
- `organization_id` (UUID FK -> `organizations.id`).
- `currency` (VARCHAR(3)): Fixed to `'INR'`.
- `current_balance` (NUMERIC(12,2)): Running balance payable to the customer.
- `last_transaction_at` (TIMESTAMPTZ): Timestamp of last ledger activity.
- `updated_at` (TIMESTAMPTZ).

### `ledger_transactions`
The header record for each financial event:
- `id` (UUID PK): Transaction ID.
- `organization_id` (UUID FK -> `organizations.id`).
- `center_id` (UUID FK -> `dairy_centers.id`).
- `customer_id` (UUID FK -> `customers.id`).
- `transaction_type` (VARCHAR): `'MILK_COLLECTION_CREDIT'`, `'COLLECTION_REVERSAL'`, `'PAYOUT_DISBURSEMENT'`.
- `direction` (VARCHAR): `'CREDIT'` or `'DEBIT'`.
- `amount` (NUMERIC(10,2)): Net amount of the transaction.
- `balance_after` (NUMERIC(12,2)): Farmer's subledger balance immediately following this transaction.
- `reference_entity` (VARCHAR): `'MILK_COLLECTION'`.
- `reference_id` (UUID): ID of the corresponding row in `milk_collections`.
- `description` (TEXT): Audit explanation.
- `idempotency_key` (VARCHAR(100)): Ensures one-time financial execution.
- `created_by` (UUID FK -> `users.id`): Operator or supervisor.
- `created_at` (TIMESTAMPTZ).

### `ledger_entries`
The balancing debit and credit line items:
- `id` (UUID PK): Line item ID.
- `transaction_id` (UUID FK -> `ledger_transactions.id` ON DELETE CASCADE).
- `account_id` (UUID FK -> `customer_ledger_accounts.id`).
- `account_type` (VARCHAR): `'CUSTOMER_PAYABLE'` or `'MILK_PURCHASE_EXPENSE'`.
- `entry_type` (VARCHAR): `'CREDIT'` or `'DEBIT'`.
- `amount` (NUMERIC(10,2)): Line amount.
- `created_at` (TIMESTAMPTZ).

---

## 4. Concurrency & Integrity Controls
- **Pessimistic Locking:** `customer_ledger_accounts` is updated within the stored procedure `complete_milk_collection_session` which executes under `FOR UPDATE` semantics when fetching existing customer balance, preventing race conditions during concurrent deliveries or payouts.
- **Idempotency Guarantee:** Replay of the same `idempotency_key` short-circuits execution before reaching ledger insertion, preventing duplicate financial credits.
