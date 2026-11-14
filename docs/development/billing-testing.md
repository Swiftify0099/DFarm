# DFarm Billing & Settlement Testing Guide

## 1. Test Suite Architecture

The DFarm billing engine is verified using an end-to-end integration test suite backed by a live PostgreSQL database instance:
- **Test File**: `services/backend/tests/billing-engine.test.js`
- **Harness**: Native Node.js test runner (`node --test`) and `supertest`.
- **Database**: Local PostgreSQL with full schema migrations, triggers, and Row Level Security active.

---

## 2. The 24 Mandatory Integration Test Scenarios

| # | Scenario Name | Test Objective & Verification |
|---|---------------|--------------------------------|
| 1 | **Calendar month period generation** | Creates a 30-day billing period with `CALENDAR_MONTH` cycle type; verifies 201 Created and `DRAFT` status. |
| 2 | **Billing period boundary dates validation** | Rejects `startDate > endDate` with 400 Bad Request and descriptive validation error. |
| 3 | **Overlapping period rejection** | Rejects creation of a second period for the same center that overlaps active period dates (409 Conflict `OVERLAPPING_BILLING_PERIOD`). |
| 4 | **Customer opening balance lookup** | Pulls pre-period balance (₹1250.50) from ledger transactions dated $< T_{start}$; confirms exact match. |
| 5 | **Cow Milk aggregation** | Aggregates multiple Cow deliveries across morning and evening shifts; verifies count (2), total weight (35.00 kg), and gross value (₹1400.00). |
| 6 | **Buffalo Milk aggregation** | Aggregates Buffalo deliveries; verifies count (1), weight (10.00 kg), and gross value (₹650.00); verifies total combined milk (₹2050.00). |
| 7 | **Fat/SNF & units preservation** | Confirms line items maintain canonical `KG` measurement units without silent unit conversions; verifies fat/snf values match intake slips. |
| 8 | **Feed debit aggregation** | Sums ledger transactions with type `FEED_PURCHASE_DEBIT` (₹350.00) during the period. |
| 9 | **Advance debit aggregation** | Sums ledger transactions with type `ADVANCE_DEBIT` (₹400.00) during the period. |
| 10 | **Deduction aggregation** | Aggregates period deductions from `customer_deductions` (₹150.00). Total debits = ₹350 + ₹400 + ₹150 = ₹900.00. |
| 11 | **Settled payout aggregation** | Verifies that a payout in `SUCCESSFUL` status (₹500.00) is deducted from the payable balance. |
| 12 | **Pending payout exclusion** | Injects a `PENDING` payout of ₹1000.00; asserts that the pending payout is **NOT** deducted from the closing balance. |
| 13 | **Closing balance calculation parity** | Tests formula: `Opening (1250.50) + Credits (2050.00) - Debits (900.00) - Settled Payouts (500.00) = 1900.50`. Asserts exact numeric equality. |
| 14 | **Negative customer balance handling** | Customer B receives ₹1500 advance without milk; closing balance = -₹1500.00; `is_negative_balance` is true; `net_payable_amount` is strictly 0.00 (not negative payout). |
| 15 | **Duplicate bill prevention** | Verifies database unique constraint `uq_customer_bill_per_period` blocks inserting duplicate bills for the same customer in the same period (Postgres error 23505). |
| 16 | **Repeated generation idempotency** | Re-triggers batch generation on an existing period; verifies existing bills are refreshed in-place without duplicating rows; balance remains ₹1900.50. |
| 17 | **Finalized bill immutability trigger** | Verifies PostgreSQL trigger `enforce_finalized_period_immutability` raises error 22000 on direct SQL modification of a finalized bill. |
| 18 | **Authorized approval workflow** | Center Manager successfully transitions bill from `GENERATED` $\to$ `UNDER_REVIEW` $\to$ `APPROVED`. |
| 19 | **Unauthorized finalization rejection** | Center Manager attempts to finalize bill; server strictly returns 403 Forbidden (requires Owner / Super Admin). |
| 20 | **Authorized Owner finalization & PDF** | Dairy Owner finalizes bill; verifies real PDF generation, valid PDF byte buffer, SHA-256 header, and `FINALIZED` record creation. |
| 21 | **Customer ownership isolation** | Customer B attempts to access Customer A's statement; server returns 403 `CUSTOMER_ISOLATION_VIOLATION`. Customer A accessing own statement succeeds. |
| 22 | **Center isolation** | Manager of Center Beta attempts to trigger generation or view periods for Center Alpha; server returns 403 `CENTER_ACCESS_DENIED`. |
| 23 | **Adjustment & versioned correction** | Applies ₹100.00 credit adjustment to finalized bill; increments version to 2; moves status to `CORRECTION_REQUIRED`; new closing balance = ₹2000.50. |
| 24 | **Historical ledger reconciliation parity** | Reconciles customer ledger running balance against statement closing balance; verifies parity. |

---

## 3. How to Run the Tests

### 3.1 Run Billing Test Suite Alone
```bash
node --test services/backend/tests/billing-engine.test.js
```

### 3.2 Run Full Backend Suite (Including Auth, Customer & Billing)
```bash
npm --workspace=@dfarm/backend test
```

### 3.3 Run Database Migration & Static Schema Verification
```bash
npm --workspace=@dfarm/database test
```

### 3.4 Build Backend
```bash
npm --workspace=@dfarm/backend run build
```
