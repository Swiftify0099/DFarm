# Cattle Feed Inventory & Sales Testing Report

## 1. Test Suite Architecture & Verification Environment

The Cattle Feed Inventory, Procurement, Customer Sales & Stock Accounting suite is implemented in `services/backend/tests/feed-inventory-phase14.test.js`. It runs directly against real PostgreSQL 17 on `127.0.0.1:54322`, executing live transactions, foreign key constraints, RLS policies, PostgreSQL triggers, and stored procedures.

- **Test Runner**: Node.js Native Test Runner (`node:test`, `node:assert/strict`)
- **HTTP Engine**: `supertest` executing against the Express backend application
- **Database Engine**: Live PostgreSQL 17 (PostGIS / Supabase compatible)
- **Isolation Strategy**: Every test run generates synthetic tenant organizations, dairy centers, staff users, and customers with unique timestamps and randomized suffix strings (`runSuffix`). No cross-test state leakage occurs.

---

## 2. 26 Business Verification Scenarios Matrix

| Scenario # | Test Description | Subsystem Verified | Result | Execution Notes |
| :---: | :--- | :--- | :---: | :--- |
| **0** | **Setup Test Environment** | Security & Orgs | **PASS** | Creates Org 1, Org 2, Center 1, Center 2, staff tokens, and customer accounts. |
| **1** | **Product Creation** | Product Catalog | **PASS** | Validates `code`, `name`, `packSize`, `packUnit`, `baseUnit`, `sellingPrice`, `taxRatePercent`. |
| **2** | **Duplicate Product Code Rejection** | Schema Constraints | **PASS** | Rejects identical SKU in the same organization with `409 Conflict`. |
| **3** | **Supplier Registration** | Supplier Module | **PASS** | Creates supplier with GST, phone number, and zero initial outstanding balance. |
| **4** | **Purchase Order Recording** | Procurement | **PASS** | Records itemized purchase order in `ORDERED` status; verifies stock does NOT increase. |
| **5** | **Authorized Stock Receipt** | Receiving & Costing | **PASS** | Authorizes receipt, increments center stock (100 bags × 50kg = 5,000kg), updates WAC. |
| **6** | **Duplicate Receipt Prevention** | Idempotency & Safety | **PASS** | Rejects second attempt to receive the same purchase order with `409 Conflict`. |
| **7** | **Current Stock Calculation** | Stock Accounting | **PASS** | `GET /api/v1/inventory` confirms exact center warehouse balance in base units. |
| **8** | **Customer Feed Sale (Credit)** | POS Retail Engine | **PASS** | Sells 5 bags (250 kg) to farmer on credit; deducts stock to 4,750 kg, posts ledger debit. |
| **9** | **Multi-Product Invoice** | Sales Invoicing | **PASS** | Processes multi-line invoice (Compound feed + Mineral mixture); deducts each stock atomically. |
| **10** | **Stock Shortage Rejection** | Negative Stock Guard | **PASS** | Rejects sale when requested quantity exceeds available warehouse stock with `400 Bad Request`. |
| **11** | **Customer Ledger Debit** | Ledger Integration | **PASS** | Verifies `ledger_transactions` has `FEED_PURCHASE_DEBIT` entry with matching sale amount. |
| **12** | **Balanced Double-Entry Journal** | Financial Accounting | **PASS** | Verifies `ledger_entries` has DEBIT `CUSTOMER_PAYABLE` and CREDIT `FEED_INVENTORY`. |
| **13** | **Atomic Rollback on Failure** | Transaction Purity | **PASS** | In multi-item sale, if item 2 has insufficient stock, item 1 deduction rolls back completely. |
| **14** | **Return of Saleable Item** | Returns Engine | **PASS** | Restores 1 bag (50kg) to sellable stock; credits farmer subledger (`LEDGER_ADJUSTMENT_CREDIT`). |
| **15** | **Return of Damaged Item** | Quarantine Control | **PASS** | Credits farmer subledger but quarantines stock via `DAMAGED_WRITE_OFF` without adding to sellable stock. |
| **16** | **Unauthorized Return Rejection** | Role-Based Security | **PASS** | Rejects return attempt by center operator with `403 Forbidden` (only supervisors can approve). |
| **17** | **Stock Correction Approval** | Adjustments | **PASS** | Records authorized cycle count surplus adjustment and updates center balance. |
| **18** | **Inter-Center Stock Transfer** | Transfers Engine | **PASS** | Atomically moves 10 bags from Center 1 to Center 2 sharing one linked `transferId`. |
| **19** | **Negative Stock Rejection** | Negative Stock Guard | **PASS** | Rejects transfer driving warehouse stock negative with `400 Bad Request`. |
| **20** | **Duplicate Sale Idempotency Retry** | Idempotency Safety | **PASS** | Replaying identical sale idempotency key returns existing sale without duplicate debit. |
| **21** | **Offline Pending Feed Sale** | Offline Sync | **PASS** | Ingests offline sale with client event UUID; creates valid invoice and sync event. |
| **22** | **Inventory Sync Conflict Guard** | Sync Protection | **PASS** | Rejects offline sync attempt requesting stock exceeding warehouse balance. |
| **23** | **Cross-Center Access Rejection** | Center Isolation | **PASS** | Rejects operator assigned to Center 1 attempting to view Center 2 inventory (`403 Forbidden`). |
| **24** | **Customer Ownership Protection** | Tenant Isolation | **PASS** | Rejects credit sale attempting to debit a customer belonging to another organization. |
| **25** | **Billing Settlement Integration** | P13 Settlement | **PASS** | Confirms feed debits are queryable by period for automatic milk settlement deductions. |
| **26** | **Historical Transaction Immutability** | Audit Preservation | **PASS** | Verifies chronological ordering, positive quantities, and trigger immutability. |

---

## 3. How to Run the Tests

### Backend Feed Inventory Test Suite:
```bash
# Run against live PostgreSQL 17
node --test services/backend/tests/feed-inventory-phase14.test.js
```

### Full Database Regression Suite:
```bash
npm --workspace=packages/database test
```

### Verification Output:
```text
TAP version 13
# Subtest: DFARM Phase 14: Cattle Feed Inventory, Procurement, Sales & Stock Accounting Suite (26 Scenarios)
    ok 1 - 0. Setup Test Organizations, Centers, Staff Users, and Customers
    ok 2 - 1. Product creation: should create product with unit, pack size, pricing
    ok 3 - 2. Duplicate product code: should reject creation with duplicate code in same org
    ok 4 - 3. Supplier creation: should register feed supplier with contact and GST
    ok 5 - 4. Purchase recording: should record feed purchase order in SUBMITTED status
    ok 6 - 5. Stock receipt: should authorize receiving, increase center stock, calculate WAC
    ok 7 - 6. Duplicate receipt prevention: should reject receiving an already received purchase
    ok 8 - 7. Current stock calculation: should reflect received stock and valuation
    ok 9 - 8. Customer feed sale: should process credit sale, deduct stock, generate sale record
    ok 10 - 9. Multiple-product invoice: should create multi-product sale and deduct each stock
    ok 11 - 10. Stock shortage rejection: should reject sale when requested qty > available stock
    ok 12 - 11. Customer ledger debit: should verify ledger_transactions has FEED_PURCHASE_DEBIT entry
    ok 13 - 12. Balanced journal: should verify balanced double-entry accounting in ledger_entries
    ok 14 - 13. Atomic rollback: if one product in multi-item sale fails, entire transaction must rollback
    ok 15 - 14. Return of saleable item: should credit customer and add stock back to center inventory
    ok 16 - 15. Return of damaged item: should credit customer but quarantine stock (no sellable stock increase)
    ok 17 - 16. Unauthorized return rejection: should reject return by unauthorized operator
    ok 18 - 17. Stock correction approval: should adjust stock and log authorized adjustment
    ok 19 - 18. Center transfer: should atomically move stock between centers with shared transferId
    ok 20 - 19. Negative stock rejection: should reject transfer or adjustment driving stock < 0
    ok 21 - 20. Duplicate sale retry: should return existing sale idempotently without duplicate debit
    ok 22 - 21. Offline pending feed sale: should record sale with local client event ID
    ok 23 - 22. Inventory sync conflict: should reject offline sync attempt when local stock allocation is invalid
    ok 24 - 23. Cross-center access rejection: should reject operator accessing unauthorized center
    ok 25 - 24. Customer ownership protection: should reject feed credit sale for customer of another org
    ok 26 - 25. Billing integration: customer feed debits must be queryable for milk settlement deduction
    ok 27 - 26. Historical transaction preservation: stock movements and sales audit history must be immutable
    1..27
ok 1 - DFARM Phase 14: Cattle Feed Inventory, Procurement, Sales & Stock Accounting Suite (26 Scenarios)
1..1
# tests 28
# suites 0
# pass 28
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

