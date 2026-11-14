# Payment & Settlement Security Architecture

## 1. Overview & Security Principles

Financial payment systems handle direct monetary disbursements and customer liability modifications. Security and authorization must withstand adversarial attempts at unauthorized payout creation, self-approval, tenant cross-leakage, replay attacks, and sensitive banking data exposure.

---

## 2. Role-Based Access Control (RBAC) & Separation of Duties

| Operation | Dairy Owner | Dairy Admin | Center Supervisor | Accounts Employee | Collection Operator | Farmer Customer |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Draft Payout** | Yes | Yes | Yes | Yes | Yes | No |
| **Approve Payout (Maker-Checker)** | Yes | Yes | Yes | No | No | No |
| **Submit Payout to Bank** | Yes | Yes | Yes | Yes | No | No |
| **Confirm Settlement (Manual)** | Yes | Yes | Yes | Yes | No | No |
| **Reverse Payout** | Yes | Yes | No | No | No | No |
| **Record Debt Receipt** | Yes | Yes | Yes | Yes | Yes | No |
| **Approve Batch** | Yes | Yes | Yes | No | No | No |
| **Import Bank Statement** | Yes | Yes | No | Yes | No | No |
| **Resolve Discrepancy** | Yes | Yes | No | Yes | No | No |
| **View Own History / Receipt** | Yes | Yes | Yes | Yes | Yes | Yes (Own Only) |

### Self-Approval Prohibition:
A strict Maker-Checker rule is enforced in both application logic and database triggers:
```sql
IF v_payout.created_by = p_approver_id THEN
    RAISE EXCEPTION 'SELF_APPROVAL_NOT_PERMITTED: The initiator cannot approve their own payout request';
END IF;
```

---

## 3. Tenant & Center Isolation

1. **Multi-Tenant Isolation:**
   Every payment, receipt, batch, and reconciliation record carries `organization_id`. Database queries strictly scope operations to the authenticated user's organization. Cross-organization access returns HTTP 404/403.
2. **Center-Level Scoping:**
   Center staff (`COLLECTION_OPERATOR`, `SUPERVISOR`) are constrained to their assigned dairy centers. Creating payouts for unauthorized centers is rejected with `CENTER_ISOLATION_VIOLATION`.
3. **Customer Ownership Scoping:**
   Customers (`FARMER_CUSTOMER`) querying `/api/v1/payments/customers/:customerId` may only access their own customer UUID. Attempting to inspect another farmer's payment history returns HTTP 403 `CUSTOMER_ISOLATION_VIOLATION`.

---

## 4. Sensitive Banking Data Protection

- **Account Masking:** Bank account numbers are never logged in plaintext or displayed on thermal receipt slips. Accounts are stored with full numbers encrypted/secured at rest and projected as `XXXX-XXXX-1234`.
- **Credential Storage:** Payment gateway API keys and webhook secrets are stored strictly in environment variables and never exposed in database records, HTTP responses, or logs.

---

## 5. Offline Payment Synchronization Guarantees

In rural dairy collection centers with intermittent connectivity:
- Offline payout requests queued locally are synchronized with `action = 'UPDATE'` and stored in the cloud as `PENDING_APPROVAL`.
- **Zero Premature Settlement:** No offline transaction can mark a payment `SETTLED`. Ledger posting only occurs once verified server-side.
- **Idempotency Replay Protection:** Re-syncing an existing offline transaction is recognized via `idempotency_key` and acknowledged idempotently without duplicating financial liability.
