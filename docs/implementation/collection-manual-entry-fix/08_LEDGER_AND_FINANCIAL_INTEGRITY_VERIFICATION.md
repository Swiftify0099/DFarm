# LEDGER AND FINANCIAL INTEGRITY VERIFICATION

**Reference:** DFARM-COLLECTION-MANUAL-ENTRY-409-FIX  
**Target:** Double-Entry Ledger, Financial Policy & Idempotent Credit Recording  
**Execution Context:** Verification of ledger integrity and pricing calculations

---

## 1. Financial Calculation Verification

- **Rate Formula / Matrix:** Evaluated authoritative rate calculation via `financialPolicyResolutionService.calculateAuthoritativePrice`:
  - Input: Milk Category = `COW`, Fat = `4.5%`, SNF = `8.8%`, Quantity = `15.00 L`
  - Resolved Rate: `₹43.25 / L`
  - Expected Net Value: `15.00 * 43.25 = ₹648.75`
  - Computed Total: `₹648.75` (Exact match)

---

## 2. Double-Entry Subledger Posting Audit

When the transaction commits in `PostgresCollectionTransactionRepository`:
1. `milk_collections` records the transaction row with `total_amount = 648.75`.
2. `kiosk_shift_sessions` atomically increments:
   - `total_liters = total_liters + 15.00`
   - `cow_liters = cow_liters + 15.00`
   - `transaction_count = transaction_count + 1`
   - `total_amount = total_amount + 648.75`
3. `customer_ledger_accounts` posts credit:
   - Initial balance: `₹0.00`
   - Credit amount: `₹648.75`
   - Updated balance: `₹648.75`
4. `ledger_transactions` records the journal line:
   - `direction`: `'CREDIT'`
   - `transaction_type`: `'MILK_COLLECTION_CREDIT'`
   - `amount`: `₹648.75`
   - `balance_after`: `₹648.75`
   - `reference_entity`: `'MILK_COLLECTION'`
   - `reference_id`: Transaction ID

---

## 3. Idempotent Deduplication Audit

When an identical transaction submission occurs:
1. `transactionRepo.findByIdempotencyKey` locates the existing collection record.
2. The use case reads the patron's current ledger balance.
3. The response returns:
   - `isIdempotentReplay`: `true`
   - `customerBalanceAfter`: `₹648.75`
4. No new `ledger_transactions` row is inserted.
5. `customer_ledger_accounts.current_balance` remains strictly `₹648.75`.
6. Zero payment gateway / external API interactions occur in milk collection or farmer accounting.
