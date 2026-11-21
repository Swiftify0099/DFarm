# DFARM — ROADMAP PHASE 06: CUSTOMER LIFECYCLE & ADMINISTRATIVE SUSPENSION VERIFICATION
**Document Reference:** `docs/implementation/ROADMAP_PHASE_06_CUSTOMER_LIFECYCLE_VERIFICATION.md`  
**Execution Phase:** Roadmap Phase 06 — Dairy Admin Core Operations  
**Target Application:** `apps/dfarm-dairy-admin`  
**Backend Service:** `services/backend`  
**Database Architecture:** Tenant PostgreSQL Database (`dfarm_tenant_<code_hash>`)  
**Status:** VERIFIED & PRODUCTION READY  

---

## 1. Executive Summary

This report documents the verification of the complete customer lifecycle, administrative suspension, reactivation, soft deletion, and restoration capabilities of the DFarm platform.

In rural dairy operations, farmers may temporarily discontinue deliveries, relocate, dispute payments, or face administrative holds. The system must allow Dairy Administrators to suspend and reactivate accounts cleanly. Crucially, administrative suspension MUST preserve all financial ledger balances, past milk intake records, and double-entry accounting records intact, while strictly preventing new milk collections.

---

## 2. Customer State Machine

```
              [Customer Mobile App]
                         │
                         ▼
             ┌───────────────────────┐
             │ PENDING_VERIFICATION  │
             └───────────┬───────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
[Admin Approve]                     [Admin Reject]
        │                                 │
        ▼                                 ▼
 ┌──────────────┐                  ┌──────────────┐
 │   APPROVED   │                  │   REJECTED   │
 └───┬───────▲──┘                  └──────────────┘
     │       │
[Suspend] [Reactivate]
     │       │
     ▼       │
 ┌───────────┴──┐
 │  SUSPENDED   │
 └──────────────┘
```

---

## 3. Operations & Invariants

### 3.1 Customer Suspension (`POST /api/v1/customers/:id/suspend`)
- **Action**: Transitions `customers.status` from `APPROVED` to `SUSPENDED`.
- **Reason Logging**: Accepts an optional suspension reason and records audit metadata.
- **Financial Balance Preservation**:
  - The customer's balance in the double-entry ledger (`ledger_accounts` and `ledger_entries`) is strictly UNTOUCHED.
  - Outstanding dues or payable credits remain completely intact and visible in both Dairy Admin and Customer Mobile Passbook.
- **Intake Delivery Block**:
  - Milk collection endpoints (`POST /api/v1/collections/intake` and `/api/v1/sync/intake-batch`) verify customer status.
  - If status is `SUSPENDED`, milk intake is rejected with HTTP 400/403: `"Customer is suspended from milk collection."`

### 3.2 Customer Reactivation (`POST /api/v1/customers/:id/reactivate`)
- **Action**: Transitions `customers.status` from `SUSPENDED` back to `APPROVED`.
- **Intake Delivery Restoration**: Customer can immediately resume daily morning and evening milk deliveries.

### 3.3 Customer Soft Deletion & Restoration
- **Soft Deletion (`DELETE /api/v1/customers/:id`)**:
  - Marks `customers.is_deleted = TRUE` and records `deleted_at = NOW()`.
  - Record remains in tenant database for historical auditing and ledger referential integrity.
- **Restoration (`POST /api/v1/customers/:id/restore`)**:
  - Uses `findById(id, organizationId, includeDeleted = true)` to locate soft-deleted entity.
  - Sets `is_deleted = FALSE`, restoring operational availability.

---

## 4. Verification Test Evidence

All lifecycle operations were verified in `services/backend/tests/roadmap-phase-06-dairy-admin.test.js`:

| Test Assertion | Input / Action | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| Suspend Customer | POST `/customers/:id/suspend` | Status becomes `SUSPENDED` | Status = `SUSPENDED` | PASS |
| Collection Blocked for Suspended | Attempt intake for suspended customer | Blocked with descriptive error | Intake rejected, customer not permitted | PASS |
| Ledger Balance Unchanged | Check ledger balance before & after suspension | Balance identical, no debit/credit adjustments | Balance perfectly preserved | PASS |
| Reactivate Customer | POST `/customers/:id/reactivate` | Status becomes `APPROVED` | Status = `APPROVED` | PASS |
| Soft Delete Customer | DELETE `/customers/:id` | `is_deleted = TRUE`, excluded from active list | Excluded from standard GET list | PASS |
| Restore Soft-Deleted Customer | POST `/customers/:id/restore` | `is_deleted = FALSE`, restored to active list | Restored and visible in directory | PASS |
| Multi-Tenant Boundary Protection | Attempt to suspend/reactivate customer of Dairy B | 403 Forbidden | 403 Forbidden | PASS |

---

## 5. Summary

The customer lifecycle implementation adheres 100% to clean domain entity rules, preserves accounting invariants, and guarantees operational safety across dairy kiosks.
