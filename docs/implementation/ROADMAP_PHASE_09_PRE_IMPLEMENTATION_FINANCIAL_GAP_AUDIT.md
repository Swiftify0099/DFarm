# ROADMAP PHASE 09: PRE-IMPLEMENTATION FINANCIAL GAP AUDIT
## COMPLETE AUDIT OF FINANCIAL CALCULATIONS, RATE POLICIES, DOUBLE-ENTRY LEDGERS, BILLING SETTLEMENTS & BULK PAYOUTS

**Document ID:** `DFARM-ROADMAP-PHASE-09-PRE-AUDIT`  
**Phase:** Roadmap Phase 09 — Financial Calculation, Farmer Settlement, Bulk Bank Payout & Reconciliation  
**Target:** `services/backend`, `packages/database`, `apps/dfarm-dairy-admin`, `apps/dfarm-customer-app`  
**Database Architecture:** Central Control Plane (`dfarm_central`) + Tenant PostgreSQL DBs (`dfarm_tenant_<code_hash>`)  
**Audit Status:** COMPLETE  

---

## 1. Executive Summary

This pre-implementation gap audit inspects all financial calculation, accounting, billing, payout, and reconciliation assets across the DFarm repository before implementation commences. DFarm manages real financial obligations for rural dairy farmers. Milk intake volume, fat percentage, and SNF percentage are converted into financial liabilities, offset against feed credit purchases and advances, aggregated into periodic billing cycles, approved through segregated Maker–Checker workflows, exported into bank-clearing formats, and settled atomically in a double-entry general ledger upon bank confirmation.

The audit identifies existing foundations, resolves naming ambiguities, flags missing or unverified components, establishes the authoritative accounting source of truth, and defines the roadmap for production readiness.

---

## 2. Comprehensive Financial Capability Audit & Classification Matrix

Each platform capability is classified into one of the mandatory standard tiers:
- `COMPLETE AND VERIFIED`
- `IMPLEMENTED BUT NOT VERIFIED`
- `PARTIALLY IMPLEMENTED`
- `MOCK/HARDCODED`
- `MISSING`
- `SECURITY DEFECT`
- `BLOCKED BY BANK SPECIFICATION`
- `PENDING OWNER DECISION`

| Module / Financial Capability | Current Implementation File(s) | Database Tables | Current Classification | Gap & Required Implementation |
| :--- | :--- | :--- | :--- | :--- |
| **Global Rate Policy Administration** | `services/backend/src/infrastructure/repositories/PostgresSuperAdminRepository.ts` | `dfarm_central.global_rate_policies`, `global_rate_policy_versions` | **COMPLETE AND VERIFIED** | Central versioning, checksums, and draft quarantine verified in Phase 04. |
| **Global FAT/SNF Adjustment Policy** | `PostgresSuperAdminRepository.ts` | `dfarm_central.global_fat_snf_adjustment_policies`, `versions` | **COMPLETE AND VERIFIED** | Policy schema, brackets, rounding policies (`NEAREST_TWO_DECIMALS`), and SHA-256 verified in Phase 04. |
| **Financial Policy Resolution Service** | None (Direct Dairy chart lookup only) | Central + Tenant | **MISSING** | Intake pricing uses only local Dairy Rate Charts without checking active, published global policies or statutory minimum floor prices (MSP). Must implement `FinancialPolicyResolutionService`. |
| **Authoritative Milk Collection Pricing** | `services/backend/src/application/use-cases/collections/MilkIntakeUseCases.ts`, `domain/entities/RateChart.ts` | `collections`, `milk_collections` | **PARTIALLY IMPLEMENTED** | Two-axis formula and grid lookup exist. Needs integration with resolved global policies, immutable calculation snapshots, and exact decimal arithmetic. |
| **Double-Entry Customer Ledger Engine** | `services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts`, `modules/ledger/ledger.service.ts` | `customer_ledger_accounts`, `ledger_transactions`, `ledger_entries` | **COMPLETE AND VERIFIED** | Header running balance + append-only journal (`ledger_transactions`) + double-entry entries (`ledger_entries`) verified in Phase 07/08. |
| **Billing Cycle Generation & Finalization** | `services/backend/src/modules/billing/billing.service.ts`, `presentation/routes/bills.routes.ts` | `billing_periods`, `monthly_bills` | **COMPLETE AND VERIFIED** | Ten-day & monthly cycles, opening/closing balances, feed deduction reconciliation, and cryptographic checksum finalization implemented. |
| **Farmer Payable Calculation & Eligibility** | `services/backend/src/modules/payments/batch.service.ts` | `customer_ledger_accounts`, `monthly_bills` | **PARTIALLY IMPLEMENTED** | Basic filter for `current_balance > 0` exists. Needs explicit linkage to finalized billing cycle, beneficiary verification status check, and obligation reservation. |
| **Bank Beneficiary Encryption & Protection** | `services/backend/src/infrastructure/security/CredentialEncryption.ts`, `customers` table | `customers.bank_account_number`, `bank_ifsc_code` | **COMPLETE AND VERIFIED** | AES-256-GCM encryption at rest implemented; API responses return masked `XXXX-XXXX-1234`. |
| **Bulk Payout Batch Preparation** | `services/backend/src/modules/payments/batch.service.ts` | `payment_batches`, `payment_batch_items`, `customer_payouts` | **PARTIALLY IMPLEMENTED** | Batch creation exists, but missing duplicate cycle batch guard (preventing two live batches for the same billing cycle) and frozen payout snapshot verification. |
| **Maker–Checker Segregation of Duties** | `batch.service.ts`, `payout.service.ts` | `payment_batches`, `payment_approvals` | **SECURITY DEFECT** | Individual payouts check `payout.created_by !== auth.userId`, but `BatchService.approveBatch` lacks the self-approval block! Creator could approve their own bulk batch. Must enforce strictly. |
| **Bank Bulk Payment File Serializer (NEFT)** | None | None | **MISSING** | No server-side serializer exists to format approved batches into standard RBI NEFT clearing files. Must implement `StandardNeftSerializer`. |
| **SBI Corporate Multi-Payment (CMP)** | None | None | **BLOCKED BY BANK SPECIFICATION** | Official SBI CMP host-to-host layout, client encryption keys, and corporate product credentials are not provisioned by the cooperative. Must keep serializer unconfigured and raise explicit diagnostic. |
| **Secure Bank File Download & Token** | None | `payment_batches` | **MISSING** | No short-lived authorized download link with SHA-256 verification and `Cache-Control: no-store`. |
| **Bank Response / UTR Reconciliation** | `services/backend/src/modules/payments/reconciliation.service.ts`, `batch.service.ts` | `payment_reconciliation_records`, `payment_batch_items` | **PARTIALLY IMPLEMENTED** | CSV import and item status matching exist, but need direct settlement integration with batch items and partial batch handling. |
| **Settlement Double-Entry Ledger Posting** | `supabase/migrations/021_customer_payouts_batches_and_reconciliation.sql`, `payout.service.ts` | `customer_ledger_accounts`, `ledger_transactions`, `ledger_entries` | **COMPLETE AND VERIFIED** | Stored procedure `settle_customer_payout` debits `CUSTOMER_PAYABLE` and credits `CASH_BANK` atomically. |
| **Customer Passbook Settlement Visibility** | `services/backend/src/presentation/routes/ledger.routes.ts`, `bills.routes.ts` | `ledger_transactions`, `monthly_bills` | **COMPLETE AND VERIFIED** | Only confirmed `SETTLED` payout debits appear in passbook. Pending or draft batches have zero ledger effect. |

---

## 3. Mandatory Ledger Naming Reconciliation (Section 5.1 of Scope)

Historical documentation across prompts and roadmaps referenced varying schema names:
- `customer_ledger_entries`
- `customer_ledger_accounts`
- `ledger_accounts`
- `ledger_entries`
- `ledger_transactions`

### Definitive Codebase & Migration Audit:
1. **Migration Inspection:**
   - Migration `009_customer_ledger.sql` and `019_customer_accounting_and_double_entry_ledger.sql` define the physical database schema.
   - There are **no tables** named `customer_ledger_entries` or `ledger_accounts` in any migration.
   - The authoritative schema consists of exactly three relational tables per tenant:
     1. `customer_ledger_accounts`: Account header holding the current running liability (`current_balance`).
     2. `ledger_transactions`: Append-only journal recording each economic event (`amount`, `direction`, `balance_after`, `transaction_type`, `reference_entity`, `reference_id`, `idempotency_key`).
     3. `ledger_entries`: Double-entry balancing lines (`account_type`, `entry_type`, `amount`).
2. **Repository & Domain Inspection:**
   - [PostgresLedgerRepository.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/repositories/PostgresLedgerRepository.ts) reads and writes `customer_ledger_accounts` and `ledger_transactions`.
   - Domain entity `CustomerLedgerAccount` maps rows from `ledger_transactions` as domain `LedgerEntry` objects.
3. **Conclusion & Decision:**
   - `customer_ledger_accounts` + `ledger_transactions` + `ledger_entries` is certified as the **SINGLE AUTHORITATIVE ACCOUNTING SOURCE OF TRUTH**.
   - No table duplication or schema duplication will be created.

---

## 4. Double-Entry Accounting Invariant Verification (Section 5.2 of Scope)

The general ledger chart of accounts enforces balanced journal lines for all transactions:

$$\sum \text{Debits} = \sum \text{Credits}$$

| Business Event | Journal Header (`ledger_transactions`) | Debit Line (`ledger_entries`) | Credit Line (`ledger_entries`) | Customer Liability (`current_balance`) |
| :--- | :--- | :--- | :--- | :--- |
| **Milk Collection Intake** | `transaction_type = 'MILK_COLLECTION_CREDIT'`, `direction = 'CREDIT'` | `MILK_PURCHASE_EXPENSE` (Expense increases) | `CUSTOMER_PAYABLE` (Liability increases) | Increases ($\text{Bal} + \text{Amt}$) |
| **Cattle Feed Credit Sale** | `transaction_type = 'FEED_PURCHASE_DEBIT'`, `direction = 'DEBIT'` | `CUSTOMER_PAYABLE` (Liability decreases) | `FEED_INVENTORY` (Asset decreases) | Decreases ($\text{Bal} - \text{Amt}$) |
| **Emergency Cash Advance** | `transaction_type = 'CUSTOMER_ADVANCE_DEBIT'`, `direction = 'DEBIT'` | `CUSTOMER_PAYABLE` (Liability decreases) | `CASH_BANK` (Asset decreases) | Decreases ($\text{Bal} - \text{Amt}$) |
| **Bank Settlement Payout** | `transaction_type = 'PAYMENT_PAYOUT_DEBIT'`, `direction = 'DEBIT'` | `CUSTOMER_PAYABLE` (Liability decreases) | `CASH_BANK` (Asset decreases) | Decreases ($\text{Bal} - \text{Amt}$) |

---

## 5. Security & Segregation of Duties Gaps Identified

1. **Maker–Checker Flaw in Batch Approval:**
   In [batch.service.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/payments/batch.service.ts) (line 229), `approveBatch` checks `batch.status`, but fails to assert `batch.created_by !== auth.userId`. This allows a single user to prepare and approve a bulk financial file without independent oversight.
2. **Missing Duplicate Batch Protection:**
   `BatchService.createBatch` checks `idempotency_key`, but does not query whether an active batch already exists for the designated `billing_cycle_id`. If an operator inputs a new idempotency key, a duplicate batch could be spawned for the same finalized billing cycle.
3. **Lack of Server-Side Bank File Serialization:**
   Currently, payout batches are approved in the database, but there is no mechanism to export a validated, checksummed bank transfer file (NEFT/RTGS).
4. **Unconfigured Bank Protocols:**
   The codebase contains references to SBI CMP without formal verification of the cooperative's corporate banking credentials.

---

## 6. Pre-Implementation Action Plan

1. **Implement `FinancialPolicyResolutionService`:** Resolve applicable published global rate policies, FAT/SNF adjustment policies, and Dairy rate charts.
2. **Harden `BatchService`:** Add duplicate billing cycle batch prevention and enforce strict Maker–Checker separation (`created_by !== approver_id`).
3. **Implement `BankFileService` & `StandardNeftSerializer`:** Standard RBI NEFT batch CSV generation with SHA-256 checksumming, secure download tokens, and `Cache-Control: no-store`.
4. **Implement SBI CMP Adapter with Explicit Guard:** If unconfigured, block export and return an informative diagnostic.
5. **Author Comprehensive Test Suite:** Validate all 10 test groups across two separate tenant databases.
