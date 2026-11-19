# PROMPT 05: PASSBOOK, BILLING, LEDGER & CATTLE FEED VERIFICATION REPORT

**Document ID:** `DFARM-VERIF-05-FIN-001`  
**Execution Phase:** Prompt 05  
**Target:** Farmer Financial Ledger, Intake Passbook, Billing & Cattle Feed Infrastructure  
**Verification Date:** November 17, 2026  
**Status:** FULLY VERIFIED — ZERO DATA LEAKAGE  

---

## 1. Executive Summary

Farmers rely on the DFarm Customer Mobile App as their digital passbook to track daily milk collections, inspect quality metrics (FAT/SNF), review financial credits and debits, monitor cattle feed purchases, and verify period payout bills. In Prompt 05, all passbook, ledger, and billing routes were audited and fortified with strict tenant isolation, authenticated farmer-ownership filters, and double-entry subledger integrity.

---

## 2. Daily Milk Collection Passbook

### 2.1 Route Architecture & Ownership Enforcement
Handled by `services/backend/src/presentation/routes/collections.routes.ts`:
- **Endpoint:** `GET /api/v1/collections`
- **Security Rule:** If `req.user.role === 'FARMER_CUSTOMER'`, the backend automatically forces:
  ```typescript
  if (req.user?.role === 'FARMER_CUSTOMER') {
    if (queryCustomerId && queryCustomerId !== req.user.userId) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Farmers are not permitted to view collections of other farmers' }
      });
    }
    targetCustomerId = req.user.userId;
  }
  ```
- Any attempt by Farmer A to query collections of Farmer B is intercepted and blocked with `403 Forbidden`.

### 2.2 Shift Record Data Schema
Each collection passbook entry includes:
- `collectionId`: UUID of intake record.
- `collectionDate`: YYYY-MM-DD.
- `shift`: `'MORNING'` | `'EVENING'`.
- `milkType`: `'COW'` | `'BUFFALO'`.
- `quantityLiters`: Exact volume measured by weighing scale.
- `fatPercentage`: Calibrated FAT from ultrasonic analyzer.
- `snfPercentage`: Calibrated SNF from ultrasonic analyzer.
- `ratePerLiter`: Dynamic rate derived from Dairy rate chart matrix.
- `totalAmount`: $\text{quantityLiters} \times \text{ratePerLiter}$, stored as fixed numeric currency.

---

## 3. Customer Subledger & Real-Time Balance

### 3.1 Double-Entry Subledger Mechanics
Implemented in `services/backend/src/presentation/routes/ledger.routes.ts`:
- **Endpoint:** `GET /api/v1/ledger/balance` and `GET /api/v1/ledger/entries`
- **Ownership Scope:** Enforces `targetCustomerId = req.user.userId`.
- **Accounting Invariant:**
  - **Credit (Cr):** Milk intake deliveries. Increases farmer's receivable balance.
  - **Debit (Dr):** Feed purchases, store items, advance cash payouts, bank settlements. Decreases farmer's balance.
  - **Running Balance:**

$$\text{Net Balance} = \sum \text{Credits} - \sum \text{Debits}$$

### 3.2 Immutability
All ledger entries are append-only. No row updates or deletions are permitted on `customer_subledger` or `ledger_entries`. Adjustments require signed compensating journal entries.

---

## 4. Milk Billing & Settlement Cycles

### 4.1 Bill Statements
Handled by `services/backend/src/presentation/routes/bills.routes.ts`:
- **Endpoint:** `GET /api/v1/bills`
- **Ownership Scope:** Enforces `targetCustomerId = req.user.userId`. Passing foreign customer ID returns `403`.
- **Billing Cycles:** 10-day cycle (Day 1-10, 11-20, 21-End of month) or monthly settlement.
- **Statement Details:**
  - Gross Milk Amount: Total ₹ earned from deliveries.
  - Feed Deductions: Total ₹ deducted for cattle feed purchased during cycle.
  - Other Deductions / Advances: Store purchases or veterinary charges.
  - Net Payable Amount: ₹ disbursed to farmer's verified bank account.
  - Settlement Status: `'PENDING'` | `'APPROVED'` | `'PROCESSED'` | `'PAID'`.

---

## 5. Cattle Feed Purchase Ledger

### 5.1 Route & Schema Architecture
Implemented in `services/backend/src/presentation/routes/feed.routes.ts`:
- **Endpoint:** `GET /api/v1/feed/sales`
- **Ownership Scope:** Automatically defaults `customerId` filter to `req.user.userId` for farmer role; prevents cross-farmer access.
- **Itemized Purchase Line:**
  - `saleId`: UUID.
  - `saleDate`: Date of purchase at Dairy store.
  - `productName`: e.g. "DFarm Cattle Mash 50kg", "Mineral Mixture 5kg".
  - `quantity`: Number of bags/units.
  - `unitPrice`: ₹ per unit.
  - `totalAmount`: Total purchase amount.
  - `paymentStatus`: `'ON_CREDIT'` (deducted from next milk bill) or `'PAID_CASH'`.

---

## 6. Verification Test Suite Coverage

Verified via `node --test services/backend/tests/customer-app-production.test.js`:
- `Subtest 14-16`: Collection intake creation and retrieval with verified milk amounts and quality metrics.
- `Subtest 17-18`: Enforces customer ownership on collections; foreign customer query returns `403 Forbidden`.
- `Subtest 19-20`: Verifies customer subledger running balance and balanced credit/debit entries.
- `Subtest 21`: Verifies billing statement generation and customer-scoped retrieval.
- `Subtest 22`: Verifies cattle feed purchase history with itemized line items.
- `Subtest 23`: Blocks foreign customer bill access with `403 Forbidden`.
