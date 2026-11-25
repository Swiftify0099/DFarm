# DFARM PROMPT 7 — PRE-IMPLEMENTATION AUDIT REPORT
## Farmer Milk Payment, Settlement & Union Bank Payout Management System

**Audit Date:** November 25, 2026  
**Target Environment:** Node.js Express (Render) + Supabase PostgreSQL + React Vite TypeScript (Cloudflare Pages)  
**Primary Financial Authority:** PostgreSQL (`aws-1-ap-northeast-2.pooler.supabase.com`)  
**Target Payout Bank:** Union Bank of India  
**Auditor:** DFarm Agent Architecture Audit & Security Review

---

### 1. Existing System & Architecture Findings

#### 1.1 Farmer Identity & Bank Details
- **Master Table:** `customers` (Migration 004, 035, 037)
- **Relevant Fields:**
  - `id`: UUID (Primary Key)
  - `organization_id`: UUID (Multi-tenant Dairy scoping)
  - `primary_center_id`: UUID (Chilling Center assignment)
  - `farmer_code`: VARCHAR(30) (Unique per Center)
  - `full_name`: VARCHAR(150)
  - `normalized_mobile_number`: VARCHAR(20)
  - `status`: VARCHAR(30) (`ACTIVE`, `SUSPENDED`, etc.)
  - `bank_name`: VARCHAR(100)
  - `bank_account_number`: VARCHAR(50) (Plaintext in db, masked in responses)
  - `bank_ifsc_code`: VARCHAR(20)
  - `bank_account_holder_name`: VARCHAR(150)
  - `is_deleted`: BOOLEAN
- **Audit Assessment:**
  - Existing bank details are present on `customers`.
  - Missing for robust banking integration: `beneficiary_status`, `bank_verification_status` (`VERIFIED`, `UNVERIFIED`, `PENDING_VERIFICATION`, `REJECTED`), `last_verified_at`, and audit history tracking changes to bank details.
  - **Remediation:** Migration 042 will add `bank_verification_status`, `beneficiary_status`, `last_verified_at` to `customers` without destructive changes, plus a dedicated `beneficiary_audit_logs` table.

#### 1.2 Milk Collection & Accounting Ledger Entries
- **Master Tables:**
  - `milk_collections` (Migration 008, 017, 039)
  - `ledger_transactions` (Migration 009, 017, 019, 021)
  - `customer_ledger_accounts` (Migration 009, 019, 026)
  - `customer_deductions` & `customer_advances` (Migration 009, 019)
- **Financial Dynamics:**
  - `MILK_COLLECTION_CREDIT`: Increases Dairy's payable liability to the farmer.
  - `PAYMENT_PAYOUT_DEBIT` / `PAYOUT_SETTLEMENT_DEBIT`: Decreases Dairy's payable liability upon bank confirmation.
  - `FEED_PURCHASE_DEBIT`, `CUSTOMER_ADVANCE_DEBIT`, `AUTHORIZED_DEDUCTION_DEBIT`, `DEDUCTION_DEBIT`: Deduct from payable liability.
  - `PAYOUT_REVERSAL_CREDIT`: Compensating entry for bank reversals without deleting historical transactions.
- **Audit Assessment:**
  - Ledger structure is strictly double-entry and append-only.
  - PostgreSQL `NUMERIC(12,2)` is consistently used across all tables.
  - Payable amount must be calculated from ledger entries for the chosen settlement period (with opening balance and pending batch reservations).

#### 1.3 Existing Payment Batches & Reconciliation Schema
- **Existing Tables:**
  - `customer_payouts` (Migration 021, 025, 026)
  - `payment_batches` (Migration 021)
  - `payment_batch_items` (Migration 021)
  - `payment_approvals` (Migration 021)
  - `payment_reconciliation_records` (Migration 021)
  - `payment_adjustments` (Migration 021)
- **Audit Assessment:**
  - Existing tables provide the backbone for payouts and batches.
  - Existing batch status constraint: `'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SUBMITTED', 'PROCESSING', 'SETTLED', 'PARTIALLY_SETTLED', 'FAILED', 'CANCELLED'`.
  - Prompt 7 requires the granular workflow: `DRAFT` → `CALCULATED` → `UNDER_REVIEW` → `APPROVED` → `SUBMITTED_TO_BANK` → `PROCESSING` → `PARTIALLY_PAID` / `PAID` / `FAILED` / `UNKNOWN` → `RECONCILED`.
  - **Remediation:** Migration 042 will safely expand status constraints and add snapshot hash, JSON calculation snapshots, and Union Bank transmission tracking.

#### 1.4 Dairy, Tenant & Centre Isolation
- Every payment, batch, item, and customer record carries `organization_id` and `center_id`.
- TenantDatabaseManager and JWT authentication enforce fail-closed tenant scoping.
- Maker-Checker segregation of duties is partially enforced in `batch.service.ts` (`batch.created_by !== auth.userId`), and must be strengthened to verify cryptographic snapshot hashes and server-side roles.

#### 1.5 Union Bank of India Integration Status
- **Current Codebase:** No Union Bank-specific adapter exists. Only generic NEFT and a stubbed SBI CMP adapter exist under `services/backend/src/modules/payments/serializers/`.
- **Onboarding Reality Check:**
  - No active Union Bank API credentials or host-to-host certificates exist in the repository or environment.
  - Official Union Bank bulk file formats for Cash Management Services (CAPS) and Bulk NEFT/RTGS must be cleanly serialized and parsed.
  - A dedicated modular directory `services/backend/src/integrations/banking/union-bank/` must be introduced, supporting:
    1) Validated Union Bank Bulk NEFT/RTGS & CAPS file generator.
    2) Bank response parser (for settlement UTR reports and return files).
    3) Status inquiry & reconciliation adapter.
    4) Host-to-Host / API client boundary with UAT mock sandbox and production fail-closed security.

---

### 2. Strategy for Prompt 7 Implementation

1. **Database Migration (`042_union_bank_farmer_payout_and_settlement_system.sql`):**
   - Non-destructive extensions to `payment_batches`, `payment_batch_items`, and `customers`.
   - New `bank_submissions` table for tracking transmission files, references, and responses.
   - New `beneficiary_audit_logs` table for tracking bank detail revisions and approval status.
   - New `payment_settlement_snapshots` table for immutable calculation traceability.

2. **Calculation & Batch Engine (`UnionBankSettlementService`):**
   - Authoritative period-based SQL calculations with decimal precision.
   - Traceability linking calculation items to ledger entries and milk collections.
   - Strict row-locking (`FOR UPDATE`) preventing concurrent duplicate allocation.

3. **Union Bank Integration Adapter (`services/backend/src/integrations/banking/union-bank/`):**
   - Clean, modular architecture following project standards.
   - Validated Union Bank file serializer & parser.
   - Safe API adapter with explicit UAT/Production boundary.

4. **Maker-Checker & Bank Submission APIs:**
   - Calculation preview, batch creation, review, approval, export, submission, and reconciliation.
   - Immutable snapshot checksum validation ensuring zero post-approval tampering.

5. **Dairy Admin Frontend UI:**
   - Unified Payment & Settlement Management console in `apps/dfarm-dairy-admin`.
   - 5 cohesive tabs: Overview, Create Settlement Batch, Review & Approval, Bank Submission, and Reconciliation.
