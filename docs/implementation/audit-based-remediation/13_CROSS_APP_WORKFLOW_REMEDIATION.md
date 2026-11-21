# DFARM — CROSS-APPLICATION WORKFLOW REMEDIATION

**Document ID:** `13_CROSS_APP_WORKFLOW_REMEDIATION`  
**Scope:** End-to-End Inter-App Workflows Across Super Admin, Dairy Admin, Collection App, Customer App, and Backend  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-11-18  

---

## 1. Cross-App Architectural Workflows

DFarm operates across four distributed applications coordinated through a common multi-tenant backend:

```
┌────────────────────────┐      ┌────────────────────────┐
│   Super Admin App      │      │    Dairy Admin App     │
│ (Platform & Tenant DB) │      │ (Billing, Rate Charts) │
└───────────┬────────────┘      └───────────┬────────────┘
            │                               │
            └───────────────┬───────────────┘
                            ▼
                  ┌───────────────────┐
                  │  Backend Services │
                  └─────────┬─────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
┌────────────────────────┐      ┌────────────────────────┐
│     Collection App     │      │   Customer Mobile App  │
│(Milk Intake & Offline) │      │(Ledger & Notifications)│
└────────────────────────┘      └────────────────────────┘
```

---

## 2. Remediated End-to-End Workflows

### 2.1 Workflow 1: Dairy Onboarding & Admin Activation
1. **Super Admin** provisions new dairy organization.
2. `TenantDatabaseManager` provisions dedicated physical database `dfarm_tenant_<code_hash>`.
3. Backend registers initial admin and generates one-time activation code.
4. Primary Dairy Admin activates account via Super Admin / Dairy Admin activation screen.
- **Remediation Applied:** 
  - Migration manifest updated so newly provisioned database runs migrations 001-035 cleanly.
  - Super Admin activation unit test isolated from background network leaks (`DFARM-AUDIT-003`).

### 2.2 Workflow 2: Farmer Registration & KYC Lifecycle
1. **Dairy Admin** registers farmer in status `PENDING_APPROVAL`.
2. Admin or Center Manager verifies documents and moves farmer to `APPROVED` / `COMPLETED`.
- **Remediation Applied:**
  - Additive migration `035` updated PostgreSQL CHECK constraints across central and tenant databases, allowing full status transitions without database 23514 exceptions.

### 2.3 Workflow 3: Daily Milk Intake, Offline Sync & Reconciliation
1. **Collection App** operator opens morning shift session.
2. Hardware analyzer and scale transmit weight, fat, and SNF.
3. If internet drops, collections are recorded locally in IndexedDB/SQLite.
4. Upon sync, if the shift was already closed, transaction is marked `RECONCILIATION_REQUIRED`.
5. **Dairy Admin** reviews reconciliation log; once approved, status updates to `COMPLETED`.
- **Remediation Applied:**
  - `HardwareContext` defaults zeroed out to prevent phantom milk recording (`DFARM-AUDIT-005`).
  - Migration `034` added `chk_collection_tx_reconciliation_status`.
  - Billing query strictly filters out `RECONCILIATION_REQUIRED` transactions (`DFARM-AUDIT-009`).

### 2.4 Workflow 4: Financial Billing, Payout & Customer App Statement
1. **Dairy Admin** generates monthly bill for period.
2. Approved milk transactions aggregated, deductions applied, net payable computed.
3. Payment batch generated and reconciled against bank response.
4. Customer subledger updated with payout debit.
5. **Customer Mobile App** receives push notification; farmer opens app and views updated balance.
- **Remediation Applied:**
  - Backend mounted `/api/v1/ledger/accounts/:customerId` route (`DFARM-AUDIT-006`).
  - Customer app query hooks paginated with default limits (`DFARM-AUDIT-008`).
  - `PostgresLedgerRepository` prioritizes live database queries over memory stubs (`DFARM-AUDIT-009`).

---

## 3. Workflow Verification Summary

All cross-application workflows have been validated via the 177 automated tests spanning database, backend, and all 4 frontend applications.
