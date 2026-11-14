# DFarm Master Remediation: Phases 11–15 Defect Register

**Document Reference:** `DFARM-DEFECT-P11-P15-002`  
**Classification:** Official Remediation Defect Register  
**Auditor:** Principal Dairy Software Architect & QA Lead  
**Date:** November 14, 2026  
**Status:** ALL DEFECTS REMEDIATED OR TRUTHFULLY CLASSIFIED  

---

## 1. Summary of Defect Classifications

| Defect ID | Phase | Severity | Component | Summary Description | Remediation Applied | Final Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DEF-11-01** | P11 | High | Rate Charts / Matrix | Missing matrix cells could cause silent NaN rates or zero payouts | Added strict cell validation in `RateService.calculateRate()`; reject incomplete charts | **FIXED AND TESTED** |
| **DEF-11-02** | P11 | Medium | Sync Engine | Unpublished draft rate charts could sync to offline collection devices | Added SQL filter restricting sync queries strictly to `status = 'PUBLISHED'` | **FIXED AND TESTED** |
| **DEF-11-03** | P11 | High | Biometrics / AI | Empty ONNX model checksum; missing physical model binary artifact | Preserved fail-safe fallback to RFID and supervisor override; flagged artifact | **BLOCKED BY EXTERNAL DEPENDENCY** |
| **DEF-12-01** | P12 | Critical | Ledger Service | Over-recovery of advances allowed recovering more than outstanding principal | Added `OVER_RECOVERY_PROHIBITED` check rejecting excess recovery amounts | **FIXED AND TESTED** |
| **DEF-12-02** | P12 | High | Authorization / RBAC | Collection operators had unrestricted read access to full financial ledgers | Enforced least-privilege guard `requireCustomerOwnership` with role filter | **FIXED AND TESTED** |
| **DEF-12-03** | P12 | Medium | Stored Procedures | Running balance drift in concurrent ledger posting | Added `FOR UPDATE` row lock on `customer_ledger_accounts` during journal posting | **FIXED AND TESTED** |
| **DEF-13-01** | P13 | Critical | Billing Database | Billing period overlap not prevented by composite column unique index | Installed `btree_gist` and added GiST exclusion constraint on `daterange` | **FIXED AND TESTED** |
| **DEF-13-02** | P13 | Critical | Billing Engine | Risk of double-deducting settled payouts from both ledger and payouts tables | Unified billing engine to read `PAYMENT_PAYOUT_DEBIT` from `ledger_transactions` | **FIXED AND TESTED** |
| **DEF-13-03** | P13 | High | Storage Adapter | Statements stored in ephemeral local container directories without durability | Implemented `DurableStatementStorage` adapter with Supabase Private Storage | **FIXED AND TESTED** |
| **DEF-13-04** | P13 | Medium | PDF Generator | Statement PDF SHA-256 integrity hash not stored or validated on access | Added SHA-256 hash calculation, database persistence, and footer verification | **FIXED AND TESTED** |
| **DEF-14-01** | P14 | High | POS Accounting | Credit feed sales did not check customer organization membership | Added organization validation; rejects credit sales across mismatched orgs | **FIXED AND TESTED** |
| **DEF-14-02** | P14 | High | Inventory Costing | JavaScript floating-point arithmetic used for Weighted Average Cost (WAC) | Migrated WAC calculations to exact PostgreSQL `NUMERIC(12,4)` arithmetic | **FIXED AND TESTED** |
| **DEF-14-03** | P14 | Medium | POS Sales | Cash sales risked creating unnecessary customer credit-sale balance entries | Segregated cash and credit flows: cash generates cash receipt voucher only | **FIXED AND TESTED** |
| **DEF-15-01** | P15 | Critical | Batch Service | Foreign key violation `fk_payout_batch` during bulk batch creation | Reordered transaction logic: insert parent batch header prior to child items | **FIXED AND TESTED** |
| **DEF-15-02** | P15 | High | Payout Stored Proc | Stored procedure `create_customer_payout` return payload lacked expected fields | Updated function in migration 026 to return full legacy & extended contract | **FIXED AND TESTED** |
| **DEF-15-03** | P15 | High | Payout Settlement | UPI payments risked immediate settlement without authenticated gateway verification | Enforced state machine: UPI payouts require bank/gateway confirmation UTR | **FIXED AND TESTED** |
| **DEF-15-04** | P15 | Medium | Payment Providers | Absence of live external banking gateway provider credentials | Mock provider adapter used for local testing; live gateway flagged | **BLOCKED BY EXTERNAL DEPENDENCY** |
| **DEF-MIG-01** | All | Critical | Supabase Migrations | Duplicate migration prefixes (`012_`, `014_`, `016_`, `017_`) across phases | Renamed unapplied files into canonical monotonic sequence `001` through `026` | **FIXED AND TESTED** |

---

## 2. Detailed Root-Cause Analysis for Key Critical Defects

### DEF-13-01: Billing Period Date Range Overlap
- **Root Cause:** A composite unique index `(center_id, start_date, end_date)` only prevents exact boundary matches (e.g., Nov 1 to Nov 30). An interleaved period (e.g., Nov 15 to Dec 15) was accepted by PostgreSQL, leading to double-counting milk collections in overlapping bills.
- **Remediation:** Enabled the `btree_gist` extension and applied a PostgreSQL exclusion constraint:
  ```sql
  ALTER TABLE public.billing_periods
  ADD CONSTRAINT ex_billing_periods_no_overlap
  EXCLUDE USING gist (
      center_id WITH =,
      daterange(start_date, end_date, '[]') WITH &&
  )
  WHERE (status <> 'CANCELLED');
  ```
- **Verification:** Verified by subtest 3 in `billing-engine.test.js` where overlapping period creation threw `409 Conflict`.

### DEF-15-01: Payout Batch Foreign Key Violation (`fk_payout_batch`)
- **Root Cause:** `BatchService.createBatch` iterated over eligible customers and inserted rows into `customer_payouts` referencing `batchId`, before the `INSERT INTO payment_batches` statement was executed. Because PostgreSQL enforces foreign keys immediately within transaction boundaries when not deferred, `fk_payout_batch` failed.
- **Remediation:** Refactored `BatchService.createBatch` in `services/backend/src/modules/payments/batch.service.ts` to execute the parent `payment_batches` `INSERT` statement first, followed by child records in `customer_payouts` and `payment_batch_items`.
- **Verification:** Verified by subtests 14, 15, and 27 in `customer-payments-p15.test.js`.

### DEF-12-02: Least-Privilege Leak to Collection Operators
- **Root Cause:** Middleware `requireCustomerOwnership` allowed any request with `actorType === 'STAFF'` to access customer financial subledgers. A collection operator at a rural booth could inspect personal farmer statements, total loan balances, and bank details.
- **Remediation:** Updated `requireCustomerOwnership` to take an optional `allowedStaffRoles` array. Configured sensitive endpoints (`/:customerId/transactions`, `/:customerId/ledger/statement`) to permit only `[SUPER_ADMIN, DAIRY_OWNER, CENTER_MANAGER, ACCOUNTANT, SUPERVISOR]`, blocking `COLLECTION_OPERATOR` with `403 Forbidden` (`STAFF_FINANCIAL_ACCESS_DENIED`).
- **Verification:** Verified by automated regression test asserting 403 status when collection operator accesses customer statement.
