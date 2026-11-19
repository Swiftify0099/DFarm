# DFARM — ROADMAP PHASE 10: CUSTOMER REGISTRATION & APPROVAL FLOW

**Document ID:** `ROADMAP-PHASE-10-DOC-004`  
**Execution Phase:** Roadmap Phase 10 — Cross-App Integration, End-to-End Business Workflows & Data Consistency  
**Target Path:** `docs/implementation/ROADMAP_PHASE_10_CUSTOMER_REGISTRATION_FLOW.md`  
**Date:** 2026-11-18  
**Classification:** Cross-Application Business Workflow Specification  

---

## 1. Flow Overview

The farmer onboarding journey spans the Customer App (`apps/dfarm-customer-app`), Dairy Admin App (`apps/dfarm-dairy-admin`), backend API gateway, central registry (`dfarm_central`), and the tenant-isolated operational database (`dfarm_tenant_<code_hash>`).

```mermaid
sequenceDiagram
    autonumber
    actor Farmer as Farmer (Customer App)
    participant Central as Backend / dfarm_central
    participant Tenant as Backend / dfarm_tenant_db
    actor Admin as Dairy Admin (Dairy Admin App)
    actor Kiosk as Collection Kiosk

    Note over Farmer: 1. Discovery & Self-Registration
    Farmer->>Central: GET /api/v1/customers/discover-dairies (Lat/Lng)
    Central-->>Farmer: Discovered Dairies (e.g. Sangamner Dairy Union)
    Farmer->>Central: POST /api/v1/customers/register (Mobile, KYC, Bank, Center)
    Central->>Central: Normalize phone (+91XXXXXXXXXX), Check uniqueness
    Central->>Tenant: Insert Customer (status: INACTIVE, reg_status: PENDING_APPROVAL)
    Central-->>Farmer: 201 Created (Pending Verification)

    Note over Admin: 2. Dairy Admin Verification & Approval
    Admin->>Tenant: GET /api/v1/customers/pending
    Tenant-->>Admin: List of pending registrations
    Admin->>Tenant: POST /api/v1/customers/:id/approve (Assign farmer_code: C-101)
    Tenant->>Tenant: Set status = ACTIVE, registration_status = APPROVED, farmer_code = C-101
    Tenant->>Tenant: Initialize customer_ledger_accounts (Balance: ₹0.00)
    Tenant->>Central: Synchronize customer status to APPROVED
    Tenant-->>Admin: 200 OK (Farmer Approved)

    Note over Farmer: 3. Status Reflection
    Farmer->>Tenant: GET /api/v1/customers/me/profile
    Tenant-->>Farmer: Status: ACTIVE, Farmer Code: C-101 (Passbook unlocked)

    Note over Admin,Kiosk: 4. Biometric & Hardware Enrollment
    Admin->>Tenant: POST /api/v1/customers/:id/biometrics/face (YuNet/SFace vectors)
    Tenant->>Tenant: Store AES-256-GCM encrypted 128-d face embedding
    Admin->>Tenant: POST /api/v1/customers/:id/rfid (Assign ISO 14443 UID)
    Tenant->>Tenant: Store RFID mapping
    Kiosk->>Tenant: GET /api/v1/sync/pull (Incremental sync)
    Tenant-->>Kiosk: Downstream sync downloads farmer profile, RFID & face template
```

---

## 2. Technical Invariants & Data Integrity

1. **Normalized Mobile Uniqueness:**
   - E.164 phone normalization enforced at gateway.
   - Central database enforces unique index `(normalized_mobile_number)` for active farmers.
   - Submitting an existing mobile returns HTTP 409 Conflict with clear diagnostic message.
2. **Canonical Farmer Code Assignment:**
   - At self-registration, the farmer has no operational code.
   - Upon Dairy Admin approval, an authoritative, unique `farmer_code` (e.g. `C-101`, `C-102`) is assigned within the Dairy tenant.
3. **Automatic Ledger Initialization:**
   - Approval automatically initializes the double-entry subledger account `customer_ledger_accounts` with currency `INR` and `current_balance = 0.00`.
4. **Immediate Kiosk Synchronization:**
   - Approved customers and their biometric/RFID tokens are marked with downstream sync cursors, making them immediately pullable by offline kiosks during `GET /api/v1/sync/pull`.
