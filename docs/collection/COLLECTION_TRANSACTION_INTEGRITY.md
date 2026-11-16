# DFarm Milk Collection Transaction Integrity & Financial Consistency

**Module:** `PostgresCollectionTransactionRepository` & `TransactionSummaryPanel`  
**Database Tables:** `milk_collections`, `collection_sessions`, `kiosk_shift_sessions`, `customer_ledger_accounts`  

---

## 1. Resolution of the Critical Unique Constraint Violation

### The Defect:
In initial testing, the first transaction in a shift succeeded, but the **second transaction failed with fatal error**:
```
duplicate key value violates unique constraint "milk_collections_session_id_key"
Key (session_id)=(...) already exists.
```

### Analysis:
PostgreSQL migration `008_create_collections.sql` declared:
```sql
CREATE TABLE milk_collections (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL UNIQUE REFERENCES collection_sessions(id),
    ...
);
```
Migration 008 was originally designed with a 1-to-1 relationship between an intake event and a `collection_sessions` record. Later, migration `027_kiosk_shift_sessions.sql` added counter shifts. The repository attempted to reuse the counter shift session ID directly as `milk_collections.session_id`.

### The Fix:
In `PostgresCollectionTransactionRepository.save()`, we execute an atomic composite write:
1. Generate an atomic UUID `collection_session_id = crypto.randomUUID()`.
2. Insert a dedicated row into `collection_sessions` referencing the customer and transaction.
3. Insert the intake record into `milk_collections` with this unique `session_id`.
4. Atomically update `kiosk_shift_sessions` totals:
   ```sql
   UPDATE kiosk_shift_sessions
   SET total_liters = total_liters + $1,
       total_amount = total_amount + $2,
       transaction_count = transaction_count + 1
   WHERE id = $3
   ```
5. Insert a double-entry credit ledger entry into `customer_ledger_accounts`.

---

## 2. Intake Validation Gate

Before any transaction can be submitted:
- **Biometric / Identity Gate:** Customer must be matched via Face Camera, RFID, or approved Manual Search.
- **Physical Scale Stability:** Milk weight must be > 0.00 L and `scaleStable === true`.
- **Biological Bounds:** Fat must be between 2.0% and 15.0%; SNF must be between 6.0% and 12.0%.
- **Idempotency Guarantee:** Client generates a unique UUID `TXN-{uuid}` sent in `idempotencyKey` preventing accidental duplicate billing.
