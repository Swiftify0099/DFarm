# IDEMPOTENCY AND DUPLICATE TRANSACTION AUDIT

**Reference:** DFARM-COLLECTION-MANUAL-ENTRY-409-FIX  
**Target:** Idempotency Key Handling & Unique Constraints on Milk Collections  
**Execution Context:** Verification that HTTP 409 is not improperly removing duplicate checks

---

## 1. Idempotency Architecture Overview

Idempotency in the DFarm milk collection pipeline is governed by two complementary mechanisms:

1. **Application-Level Idempotency Contract:**
   - In `MilkIntakeUseCases.ts`:
     ```ts
     const idempotencyKey =
       dto.idempotencyKey ||
       `IDEM-${dto.customerId}-${dto.sessionId || dto.sessionCode}-${dto.weightLiters}-${dto.fatPercentage}`;

     const existingTxn = await this.transactionRepo.findByIdempotencyKey(idempotencyKey);
     if (existingTxn) {
       const ledger = await this.ledgerRepo.findByCustomer(existingTxn.customerId);
       return {
         transaction: existingTxn,
         receiptNumber: `RCP-${existingTxn.id.substring(0, 8).toUpperCase()}`,
         customerBalanceAfter: ledger?.currentBalance || 0.0,
         isIdempotentReplay: true,
       };
     }
     ```
   - When a transaction with the same `idempotencyKey` is retried, the backend does **NOT** throw an error and does **NOT** post duplicate financial credits. Instead, it returns `isIdempotentReplay: true` with the original committed transaction and current ledger balance.

2. **Database-Level Unique Constraint:**
   - In PostgreSQL migration `008_collection_sessions_and_transactions.sql`:
     ```sql
     CREATE TABLE IF NOT EXISTS milk_collections (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         ...
         idempotency_key VARCHAR(128) NOT NULL UNIQUE,
         ...
     );
     ```
   - In `PostgresCollectionTransactionRepository.ts`:
     ```sql
     INSERT INTO milk_collections (..., idempotency_key, ...)
     VALUES (...)
     ON CONFLICT (idempotency_key) DO NOTHING;
     ```
   - In `services/backend/src/middleware/error-handler.ts`:
     ```ts
     if (pgErr.code === '23505') {
       return ApiResponse.error(res, 'DUPLICATE_RECORD', 'A record with these unique details already exists in the system', 409);
     }
     ```

---

## 2. Verification of Idempotency Behavior

### Automated Test Execution
In `test-full-intake.mjs`, the same transaction payload with idempotency key `'TXN-TEST-12345'` was submitted twice consecutively:

1. **First Submission Result:**
   - Transaction ID: `7f610279-ab93-4294-ac87-659fee3116fe`
   - Total Amount: `₹516.13`
   - Customer Balance After: `₹516.13`
   - `isIdempotentReplay`: `false`

2. **Second Submission Result (Replay):**
   - Transaction ID: `7f610279-ab93-4294-ac87-659fee3116fe` (identical)
   - Total Amount: `₹516.13`
   - Customer Balance After: `₹516.13` (ledger balance remained unchanged; NO double credit)
   - `isIdempotentReplay`: `true`

---

## 3. Idempotency Key Generation in Frontend

In `apps/dfarm-collection-app/src/api/client.ts`:
```ts
body: JSON.stringify({
  ...
  idempotencyKey: `TXN-${crypto.randomUUID()}`,
})
```
- Each distinct submission action receives a unique UUID-based key.
- If a network retry occurs or the operator submits multiple times, the backend safely deduplicates without data corruption.
- Disabling or removing idempotency checks was verified to be unnecessary and strictly avoided.
