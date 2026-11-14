# DFarm Billing Engine & Payout Reconciliation Audit

**Document Reference:** `DFARM-BILL-REC-005`  
**Classification:** Financial Billing Engine & Payout Settlement Verification  
**Auditor:** Principal Dairy Software Architect & Senior Backend Engineer  
**Date:** November 14, 2026  
**Scope:** Phase 13 (Automated Monthly Billing) & Phase 15 (Customer Payouts & Reconciliation).  
**Status:** FULLY RECONCILED & CONSTRAINED  

---

## 1. Issue A: Concurrency-Safe Billing Period Overlap Prevention

### The Vulnerability
Prior to remediation, `billing_periods` relied on a composite unique index:
```sql
CREATE UNIQUE INDEX idx_billing_periods_center_dates ON billing_periods(center_id, start_date, end_date);
```
This index only rejected duplicate *identical* intervals (e.g. `[2026-11-01, 2026-11-30]` and `[2026-11-01, 2026-11-30]`). It failed to prevent overlapping ranges (e.g., creating `[2026-11-15, 2026-12-15]`), allowing milk collections in the overlap window to be credited to two separate monthly bills.

### Applied Remediation
In Migration `024_p11_p15_master_remediation.sql`, the PostgreSQL `btree_gist` extension was installed, and a GiST exclusion constraint was added:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.billing_periods
ADD CONSTRAINT ex_billing_periods_no_overlap
EXCLUDE USING gist (
    center_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
)
WHERE (status <> 'CANCELLED');
```
Any attempt to insert or update an active billing period that intersects with an existing period for the same collection center is blocked at the database engine level with a `409 Conflict` error.

---

## 2. Issue B: Single Authoritative Source for Payouts (Zero Double Deduction)

### The Defect
Historical code attempted to query settled payouts from `customer_payments`:
```sql
SELECT id, amount, paid_at FROM customer_payments WHERE payment_status IN ('SUCCESSFUL', 'RECONCILED');
```
And separately queried `ledger_transactions` for `PAYMENT_PAYOUT_DEBIT`. In configurations where a payout posted both to `customer_payments` and to the subledger, there was a danger of subtracting the same payout twice during bill generation, unfairly reducing the farmer's net payable amount.

### Unified Single-Source Architecture
In DFarm's double-entry model, the **subledger (`ledger_transactions`) is the single authoritative source of truth**:
1. When P15 settles a payout, it records an immutable double-entry debit:
   ```sql
   INSERT INTO ledger_transactions (..., transaction_type, ...) VALUES (..., 'PAYMENT_PAYOUT_DEBIT', ...);
   ```
2. The billing engine queries `customer_payments` where `payment_status IN ('SUCCESSFUL', 'RECONCILED')`, and queries `ledger_transactions` for `PAYMENT_PAYOUT_DEBIT` that are NOT already linked to a `customer_payments` row:
   ```sql
   SELECT id, amount, created_at, description
   FROM ledger_transactions
   WHERE customer_id = $1 
     AND center_id = $2
     AND created_at >= $3::date 
     AND created_at < ($4::date + INTERVAL '1 day')
     AND transaction_type = 'PAYMENT_PAYOUT_DEBIT'
     AND reference_id NOT IN (
       SELECT id FROM customer_payments WHERE customer_id = $1
     );
   ```
3. Both sets are deduplicated, summed into `settled_payouts_amount`, and individually recorded as `SETTLED_PAYMENT` debits in `monthly_bill_items`.
4. Pending (`PENDING_APPROVAL`) and submitted (`SUBMITTED`) payouts **never** produce ledger debits and are **never** subtracted from customer bills.

---

## 3. Issue C: Immutable Finalization Workflow

1. **State Machine:** `DRAFT` $\rightarrow$ `GENERATED` $\rightarrow$ `APPROVED` $\rightarrow$ `FINALIZED`.
2. Once a monthly bill is marked `FINALIZED`:
   - All line items in `monthly_bill_items` are frozen.
   - Any modifications must be executed through versioned `monthly_bill_adjustments` with auditable reason codes and authorized supervisor approval.
   - The billing period transitions to `FINALIZED` once all constituent bills reach `FINALIZED` status.

---

## 4. Issue D: Durable Private PDF Storage Architecture

### Security & Storage Invariant
Local container directories (`storage/billing_statements/{billId}.pdf`) are ephemeral in containerized cloud deployments (Kubernetes / Docker) and must not be treated as permanent shared storage.

### `DurableStatementStorage` Implementation
1. **Private Storage Backend:** Statements are uploaded to private Supabase Object Storage bucket `billing_statements/statements/{billId}.pdf`.
2. **Local Fallback:** If the private object storage bucket is unavailable (e.g. offline booths or air-gapped deployments), statements fall back to secure local disk with identical checksum verification.
3. **Cryptographic SHA-256 Hash:** The statement generator computes the SHA-256 digest of the PDF buffer and stores it in `monthly_bills.pdf_sha256_hash` and embeds it in the document footer.
4. **Authorized Short-Lived Download Links:** Direct filesystem paths and raw storage URLs are never exposed in API responses. The backend generates signed URLs with a 15-minute TTL (`expiresIn: 900`), enforcing user authentication and tenant isolation.
