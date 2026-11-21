# DFarm Prioritized Implementation Roadmap (Prompts 0 through 12)

## 1. Executive Summary

This roadmap defines the implementation path for the DFarm platform across twelve sequential prompts. Each prompt is scoped with strict prerequisites, boundaries, API contracts, database migrations, and acceptance criteria to ensure modularity and end-to-end reliability.

---

## 2. Roadmap Milestone Overview

| Prompt | Scope Title | Primary Application / System | Key Milestone Deliverable |
| :---: | :--- | :--- | :--- |
| **0** | **Technical Audit & Implementation Baseline** | Complete Platform | 8 Architecture Docs, 16 Audit Docs, 0 Code Changes |
| **1** | **Control Plane & Multi-Tenant Routing Engine** | Backend & Database | Real PostgreSQL cluster, Tenant DB Manager, Secure Tenant Resolver |
| **2** | **Super Admin Dairy Onboarding & Admin Auth** | Super Admin Web & Backend | Dairy registration, DB provisioning, Admin OTP activation |
| **3** | **Customer App Onboarding & Biometrics** | Customer Mobile App | Geofence discovery, OpenCV YuNet/SFace capture, pending approval state |
| **4** | **Dairy Admin Approvals, Directory & RFID** | Dairy Admin Web | Customer verification, approval/rejection queue, RFID card assignment |
| **5** | **Collection Kiosk Hardware & Session Engine**| Collection React App | Web Serial (Essae/Ekomilk/Scale), shift sessions, kiosk face match |
| **6** | **Milk Intake Engine & Atomic Double-Entry Ledger**| Collection App & Backend | FAT/SNF Rate matrix lookup, atomic milk intake transaction, ledger credit |
| **7** | **Customer App Collections, Ledger & Alerts**| Customer App & Backend | Real-time collection receipts, passbook ledger, push/SMS alerts |
| **8** | **Dairy Admin Rates, Feed & Inventory Sales**| Dairy Admin Web & Backend | Dynamic rate charts, cattle feed warehouse inventory, credit sales |
| **9** | **Automated Billing, Deductions & Settlement**| Dairy Admin Web & Backend | 10/15/30-day bill cycles, advance recovery, net payable balance |
| **10**| **Farmer Payouts, SBI NEFT & Bank Reconciliation**| Dairy Admin Web & Backend | Maker-checker payout batches, SBI CMP CSV export, statement import |
| **11**| **Super Admin Platform Health, Audit & Razorpay AMC**| Super Admin Web & Backend | Anomaly detection, audit ledger, support session tokens, Razorpay AMC |
| **12**| **End-to-End Platform Hardening & Handover** | Entire Platform | Multi-kiosk load testing, offline sync verification, deployment runbooks |

---

## 3. Detailed Prompt Specifications

---

### PROMPT 0: Complete Technical Audit & Implementation Baseline
- **Status**: Completed (This Phase).
- **Prerequisites**: Access to git repository and workspace.
- **In-Scope**: Full code audit, architectural analysis, database migration review, API inventory, verification of non-modification.
- **Out-of-Scope**: Code changes, migrations, mock deletions, UI modifications.
- **Deliverables**: 8 Architecture Documents, 16 Audit Documents, Answers to 20 Platform Questions.

---

### PROMPT 1: Central Control Plane & Multi-Tenant Routing Engine
- **Prerequisites**: Prompt 0 Baseline.
- **Scope**:
  - Boot physical PostgreSQL 15+ cluster on port 5432.
  - Fix migration sequencing collision on index `031`.
  - Execute migrations `001` through `033` on central control plane database (`dfarm_central`).
  - Implement `TenantDatabaseManager.ts` with connection pooling and schema routing.
  - Implement `TenantResolverMiddleware.ts` to inspect JWT claims and attach `req.tenantClient`.
  - Remove all fallback secrets (`'dev-secret'`) and header bypasses (`x-dev-*`).
- **Out-of-Scope**: Frontend UI changes, hardware serial integration.
- **APIs Touched/Created**:
  - `POST /api/v1/auth/login` (Cryptographic JWT with tenant claims)
  - `POST /api/v1/auth/refresh`
  - `GET /api/v1/health` (Reports true PostgreSQL status, not pg-mem)
- **Acceptance Criteria**:
  - `curl /api/v1/health` returns `dbStatus: "CONNECTED"`, `mode: "PHYSICAL_POSTGRES"`.
  - Supplying forged headers (`x-dev-user-id`) results in `401 Unauthorized`.
  - Tenant connection pool routes to correct tenant database based on authenticated token.

---

### PROMPT 2: Super Admin Dairy Creation, Activation & Admin Accounts
- **Prerequisites**: Prompt 1 Tenant Routing Engine.
- **Scope**:
  - Wire `apps/dfarm-super-admin` to real backend endpoints (replace `mockBackend.ts` for dairies).
  - Implement Dairy Onboarding workflow: Geo-coordinates (lat/long/pin), bank details, primary admin.
  - Trigger automated database/schema provisioning upon dairy creation.
  - Send email activation token and SMS OTP to Primary Dairy Admin.
  - Implement Dairy Admin activation screen (`/activate?token=...`).
- **Out-of-Scope**: Farmer onboarding, milk rate charts.
- **APIs Touched/Created**:
  - `POST /api/v1/super-admin/dairies` (Create dairy and provision DB)
  - `GET /api/v1/super-admin/dairies` (Real tenant list)
  - `POST /api/v1/auth/activate-dairy-admin` (Verify token + OTP, set password)
- **Acceptance Criteria**:
  - Creating a dairy in Super Admin creates `dfarm_tenant_<uuid>` in PostgreSQL.
  - Dairy Admin receives activation link, activates account, and logs into Dairy Admin Web.
  - Super Admin Overview displays accurate count from database query.

---

### PROMPT 3: Customer App Onboarding, Geofence Discovery & Biometrics
- **Prerequisites**: Prompt 2 Active Dairy.
- **Scope**:
  - Implement real Firebase Auth / Fast2SMS OTP verification for customer mobile number.
  - Geolocation query: Find nearest registered dairies within 25 km radius.
  - Biometric capture: Live camera stream integrated with OpenCV YuNet (face detection) and SFace INT8 (128D embedding).
  - Biometric consent recording (DPDP Act compliance).
  - Submit registration payload to backend; store in tenant database as `PENDING_APPROVAL`.
  - Customer App UI reflects `PENDING_APPROVAL` status screen.
- **Out-of-Scope**: Dairy Admin approval action, milk collection intake.
- **APIs Touched/Created**:
  - `GET /api/v1/public/dairies/nearby?lat=...&lng=...&radius=25`
  - `POST /api/v1/customers/register` (Profile, bank details, 128D embedding, consent)
  - `GET /api/v1/customers/me/status`
- **Acceptance Criteria**:
  - Real customer registration successfully writes to selected dairy's tenant database.
  - 128-dimensional embedding verified for $L_2$ normalization.
  - Customer App displays pending approval state upon re-launch.

---

### PROMPT 4: Dairy Admin Approvals, Directory, Face Biometrics & RFID
- **Prerequisites**: Prompt 3 Registered Customer in Pending State.
- **Scope**:
  - Remove Gokul / hardcoded dairy lock-in from `apps/dfarm-dairy-admin`.
  - Build real Pending Approvals queue displaying farmer details, bank account, and face snapshot.
  - Approve / Reject action with mandatory reason.
  - Approved customers populate Customer Directory.
  - RFID Card Registry: Assign unique RFID UID to approved customer.
  - Biometric lifecycle: Re-enrollment, vector verification test.
- **Out-of-Scope**: Kiosk milk collection, billing cycles.
- **APIs Touched/Created**:
  - `GET /api/v1/dairy-admin/customers/pending`
  - `POST /api/v1/dairy-admin/customers/:id/approve`
  - `POST /api/v1/dairy-admin/customers/:id/reject`
  - `POST /api/v1/dairy-admin/customers/:id/rfid`
- **Acceptance Criteria**:
  - Approving a customer changes status in Customer App from `PENDING_APPROVAL` to `ACTIVE`.
  - Customer Directory displays real database rows.
  - Assigned RFID UID is stored with unique constraint per tenant.

---

### PROMPT 5: Collection App Hardware Integration & Shift Sessions
- **Prerequisites**: Prompt 4 Approved Customers & RFID Cards.
- **Scope**:
  - Implement Web Serial API driver in React for Essae / Ekomilk / Lactoscan analyzers and digital scales.
  - Shift Session management (`F3`): Open morning/evening shift, select milk type, verify operator credentials.
  - Biometric identification at kiosk: Camera captures face, runs SFace INT8, performs cosine similarity match against tenant vector cache.
  - RFID identification: Kiosk reads RFID reader input, resolves customer within 200ms.
  - Fallback mechanism: Supervisor PIN override + web-cam photo snapshot for unidentifiable farmers.
- **Out-of-Scope**: Ledger posting, milk rate charts.
- **APIs Touched/Created**:
  - `POST /api/v1/collection/shifts/open`
  - `POST /api/v1/collection/shifts/close`
  - `POST /api/v1/collection/identify/face` (Match vector)
  - `GET /api/v1/collection/identify/rfid/:uid`
- **Acceptance Criteria**:
  - Serial port streams data directly into FAT/SNF/Weight fields on intake screen.
  - Face match recognizes enrolled farmer with > 0.65 similarity in under 1 second.
  - Shift session state machine transitions properly (`OPEN` -> `IN_PROGRESS` -> `COMPLETED`).

---

### PROMPT 6: Milk Intake Engine, Rate Matrix & Atomic Double-Entry Ledger
- **Prerequisites**: Prompt 5 Kiosk Hardware & Customer Identification.
- **Scope**:
  - Active Rate Chart resolution: Determine price per liter from 2D FAT/SNF matrix.
  - Calculate total gross payment: $\text{Liters} \times \text{Rate}$.
  - Execute atomic stored procedure `create_milk_collection_session()`:
    - Writes `milk_collections` record.
    - Inserts `ledger_transactions` master row (`MILK_COLLECTION_CREDIT`).
    - Inserts dual balancing rows into `ledger_entries` (`CUSTOMER_PAYABLE` credit, `MILK_PURCHASE_EXPENSE` debit).
  - Print / display collection receipt with session sequence number.
- **Out-of-Scope**: 10-day billing summaries, bulk payouts.
- **APIs Touched/Created**:
  - `POST /api/v1/collection/intake/submit`
  - `GET /api/v1/collection/shifts/:id/journal`
- **Acceptance Criteria**:
  - Collection record and double-entry ledger entries commit atomically.
  - Immutability trigger prevents direct SQL updates or deletes on posted transactions.
  - Kiosk displays updated shift volume and expenditure totals.

---

### PROMPT 7: Customer App Daily/Monthly Collections & Passbook Ledger
- **Prerequisites**: Prompt 6 Committed Milk Collections.
- **Scope**:
  - Customer App Dashboard connected to real collection APIs.
  - Daily Collection tab: Morning/Evening intake records, Liters, FAT, SNF, Amount.
  - Monthly Collection tab: Calendar aggregation, total liters, average FAT/SNF.
  - Passbook Ledger: Real running balance, transaction credits (milk) and debits (advances, feed).
  - Push notification / SMS dispatch on collection intake completion.
- **Out-of-Scope**: Farmer payout batch generation.
- **APIs Touched/Created**:
  - `GET /api/v1/customers/me/collections/daily`
  - `GET /api/v1/customers/me/collections/monthly?year=...&month=...`
  - `GET /api/v1/customers/me/ledger`
- **Acceptance Criteria**:
  - Farmer immediately sees collection intake recorded at kiosk within 2 seconds.
  - Running balance accurately reflects all credits and debits.

---

### PROMPT 8: Dairy Admin Milk Rate Charts, Feed Inventory & Credit Sales
- **Prerequisites**: Prompt 4 & 6.
- **Scope**:
  - Dynamic Rate Chart editor in Dairy Admin Web: Buffalo and Cow matrices (FAT 3.0–10.0%, SNF 7.0–10.5%).
  - Rate chart versioning with effective date ranges.
  - Cattle feed warehouse management: Products, stock replenishment batches.
  - Feed store credit sale to farmer: Deducts inventory stock, writes `FEED_PURCHASE_DEBIT` transaction to customer ledger.
- **Out-of-Scope**: Bank payout batches.
- **APIs Touched/Created**:
  - `POST /api/v1/dairy-admin/rates/charts`
  - `POST /api/v1/dairy-admin/inventory/feed/stock`
  - `POST /api/v1/dairy-admin/inventory/feed/sales`
- **Acceptance Criteria**:
  - Milk collection immediately adopts new rate chart when effective date triggers.
  - Feed sale reduces warehouse inventory and immediately debits farmer's ledger.

---

### PROMPT 9: Automated Billing Cycles, Settlements & Deductions
- **Prerequisites**: Prompts 6, 7, 8.
- **Scope**:
  - Automated billing cycle generator: 10-day (1–10, 11–20, 21–End), 15-day, or monthly.
  - Calculate gross milk earnings per farmer.
  - Deduct feed purchases, veterinary charges, and active advance installments.
  - Compute net payable balance using `compute_eligible_payout_balance()`.
  - Generate printable PDF billing statements.
- **Out-of-Scope**: Bank file generation.
- **APIs Touched/Created**:
  - `POST /api/v1/dairy-admin/billing/cycles/generate`
  - `GET /api/v1/dairy-admin/billing/cycles/:id/summary`
  - `GET /api/v1/dairy-admin/billing/statements/:customerId`
- **Acceptance Criteria**:
  - Bills accurately reconcile all milk collections and store debits for the cycle period.
  - Finalized bills freeze period transactions from duplicate deduction.

---

### PROMPT 10: Farmer Bulk Payouts, SBI Corporate NEFT & Reconciliation
- **Prerequisites**: Prompt 9 Finalized Billing Cycles.
- **Scope**:
  - Payout batch creation with maker-checker workflow (Staff creates, Admin approves).
  - Implement `SbiPayoutBatchSerializer.ts`: Generates compliant SBI CMP CSV/text batch file.
  - Payout execution tracking (`DRAFT` -> `APPROVED` -> `EXPORTED` -> `SETTLED`).
  - Bank statement CSV reconciliation: Upload statement, parse UTRs, auto-match against payouts, post double-entry clearing ledger rows.
- **Out-of-Scope**: Razorpay Super Admin AMC.
- **APIs Touched/Created**:
  - `POST /api/v1/dairy-admin/payouts/batches`
  - `POST /api/v1/dairy-admin/payouts/batches/:id/approve`
  - `GET /api/v1/dairy-admin/payouts/batches/:id/export/sbi`
  - `POST /api/v1/dairy-admin/reconciliation/upload`
- **Acceptance Criteria**:
  - Downloaded SBI batch file validates against SBI CMP format schema.
  - Reconciled rows clear `CUSTOMER_PAYABLE` liability and record bank credit.

---

### PROMPT 11: Super Admin Health, Audit Ledger, Support Portal & Razorpay AMC
- **Prerequisites**: Prompts 1, 2, 10.
- **Scope**:
  - Replace mock Super Admin modules with real platform data.
  - Real platform health: Database cluster CPU/memory, active connection pool stats, queue depths.
  - Immutable platform audit ledger view (`central.platform_audit_logs`).
  - Controlled Support Access Portal: Time-bound scoped impersonation JWTs with mandatory audit logging.
  - Platform AMC Monetization:
    - Razorpay SDK integration for AMC plan billing.
    - Webhook receiver with HMAC-SHA256 signature verification.
    - Dairy subscription lifecycle and automated grace period / suspension enforcement.
- **Out-of-Scope**: None (final functional module).
- **APIs Touched/Created**:
  - `GET /api/v1/super-admin/system/health`
  - `GET /api/v1/super-admin/audit/logs`
  - `POST /api/v1/super-admin/support/session`
  - `POST /api/v1/super-admin/billing/amc/orders`
  - `POST /api/v1/webhooks/razorpay`
- **Acceptance Criteria**:
  - Super Admin Overview displays real telemetry and live tenant counts.
  - Support sessions automatically expire after configured duration.
  - Razorpay payment webhook successfully renews tenant AMC license.

---

### PROMPT 12: End-to-End Hardening, Chaos Testing & Production Runbooks
- **Prerequisites**: Prompts 0 through 11 fully executed.
- **Scope**:
  - End-to-end integration testing: Complete farmer journey (Registration -> Approval -> Milk Collection -> Billing -> Payout -> Reconciliation).
  - Multi-kiosk concurrent load testing (simulating 50 concurrent kiosks during morning peak).
  - Offline sync verification: Network disconnect during shift intake, offline SQLite queuing, reconnection auto-sync.
  - Security penetration testing: Verify zero IDOR, verify rejection of forged headers, verify RLS/tenant boundary separation.
  - Production deployment runbooks (Docker Compose, Kubernetes manifests, backup scripts).
- **Deliverables**: Hardened production release, operational documentation, Disaster Recovery plan.
