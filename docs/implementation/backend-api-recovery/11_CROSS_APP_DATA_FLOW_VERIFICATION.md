# Cross-Application Data Flow Verification

**Execution Reference:** DFARM-MASTER-BACKEND-API-RECOVERY

---

## 1. End-to-End Traces

### Trace 1: Milk Collection to Farmer Passbook
```
[Collection Kiosk] Weighing Scale (45.5 L) + Analyzer (4.5% FAT, 8.5% SNF)
  → POST /api/v1/collections/intake
  → Rate Engine calculates ₹38.50/L = ₹1,751.75
  → PostgresCollectionTransactionRepository INSERT milk_collections
  → PostgresLedgerRepository INSERT ledger_transactions (CR Farmer Account)
  → HTTP 201 Created with Receipt #REC-2026-004812
  → [Customer App] GET /api/v1/ledger/passbook reflects updated running balance
```

### Trace 2: Farmer Registration to Center Approval
```
[Customer App] Self-Registration with Mobile OTP & Bank Details
  → POST /api/v1/customers/register
  → Status: PENDING_APPROVAL
  → [Dairy Admin] GET /api/v1/customers/pending-approvals
  → POST /api/v1/customers/:id/approve
  → Status: ACTIVE
  → [Customer App] GET /api/v1/customers/me unlocks full dashboard
```
