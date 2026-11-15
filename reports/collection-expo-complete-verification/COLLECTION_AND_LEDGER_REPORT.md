# Milk Collection & Financial Ledger Posting Report
## Atomic Session Lifecycle, Double-Entry Accounting, Idempotency & Offline Outbox

**Document Version**: 1.0.0  
**Verification Date**: 2026-11-15  
**Target Module**: `apps/collection-expo/src/domain/repository/CollectionRepository.ts`  
**Reference Kotlin Module**: `apps/collection-app/.../data/repository/CollectionRepository.kt`  
**Backend Route & Stored Proc**: `POST /api/v1/collections/sessions/{sessionId}/complete` & `public.complete_milk_collection_session`  
**Verification Status**: **FIXED AND VERIFIED**

---

### 1. End-to-End Collection Intake Pipeline

```
  [ Farmer Identified ] ──▶ [ Milk Category Selected ] ──▶ [ Hardware Measurements ]
                                                                       │
                                                                       ▼
                                                          [ Matrix Rate Evaluated ]
                                                                       │
                                                                       ▼
                                                       [ Banker Rounded Total Amount ]
                                                                       │
                                                                       ▼
                                                        [ Operator & Farmer Review ]
                                                                       │
                                                                       ▼
                                                           [ Transaction Commit ]
                                                                       │
                                      ┌────────────────────────────────┴────────────────────────────────┐
                                      ▼                                                                 ▼
                              ( Network Online )                                               ( Network Offline )
                                      │                                                                 │
                                      ▼                                                                 ▼
                         [ Backend Atomic API Call ]                                       [ SQLite Atomic Outbox ]
                                      │                                                     - Save `local_collection_sessions`
                                      ▼                                                     - Save `local_milk_collections`
                         `complete_milk_collection_session`                                 - Save `pending_receipts`
                         1. Verify session state & locks                                    - Insert `sync_journal` (PENDING_SYNC)
                         2. Check idempotency key replay                                                │
                         3. Insert into `milk_collections`                                              ▼
                         4. Create Double-Entry Ledger Posting                             [ Background Daemon Sync ]
                         5. Generate Receipt Number                                         Flushes when network restored
                                      │
                                      ▼
                               ( Ledger Active )
```

---

### 2. Double-Entry Accounting Invariant

Every collection event automatically and immutably posts balancing double-entry transactions in PostgreSQL:

$$\text{Debit: Milk Inventory Asset Account} = \text{Credit: Farmer Payable Liability Account} = \text{Total Amount}$$

- **Debit Entry**: Increases Raw Milk Inventory (`ASSET`).
- **Credit Entry**: Increases the farmer's accrued balance (`LIABILITY`).
- **Zero Imbalance Rule**: A collection commit is rolled back atomically if total debits do not strictly equal total credits.

---

### 3. Idempotency Key & Replay Attack Defense

Network drops in rural dairy collection centers frequently cause client HTTP retries.
- Every collection session generates a client UUIDv4: `clientIntakeUuid`.
- Passed in the request payload and indexed in PostgreSQL:
  ```sql
  CONSTRAINT uq_collection_idempotency UNIQUE (idempotency_key)
  ```
- **Replay Behavior**: If the client retries an already committed transaction, the stored procedure detects `isIdempotentReplay === true`, returns the existing receipt details, and skips duplicate ledger postings.

---

### 4. Offline Outbox Pattern (`sync_journal`)

When the counter loses Internet connectivity:
1. `saveMilkCollectionAndEnqueueSync` commits to SQLite inside a single atomic transaction:
   - `local_milk_collections` receives the transaction record with `sync_status = 'PENDING_SYNC'`.
   - `sync_journal` receives an outbox event containing the serialized JSON payload.
   - `pending_receipts` queues the thermal slip data.
2. The UI displays `COLLECTION SAVED OFFLINE (PENDING SYNC)`.
3. Background sync worker (`DFarmSyncWorker` / `BackgroundSyncTask`) automatically flushes the queue once network is restored.

---

### 5. Automated Verification Evidence

- `collection-repository.test.ts`:
  - `Test 10`: Commit milk collection online atomic: verifies successful session creation, measurement posting, and complete session response.
  - `Test 11`: Commit milk collection offline fallback: verifies offline database persistence and `sync_journal` outbox enqueuing.
- `state-machine.test.ts`:
  - `Test 5`: Complete successful collection lifecycle through all 11 state transitions (`WAITING_FOR_CUSTOMER` $\to$ `COMPLETED`).
  - `Test 7`: Cannot cancel an already completed session (idempotency and financial immutability).
- `end-to-end-collection-lifecycle.test.ts`:
  - Full end-to-end lifecycle verified with zero discrepancy between calculated rate, receipt, and ledger record.

**Conclusion**: Collection save and financial ledger postings are fully verified, crash-resilient, and mathematically sound.
