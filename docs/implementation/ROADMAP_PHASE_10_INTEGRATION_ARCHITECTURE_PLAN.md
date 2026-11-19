# DFARM — ROADMAP PHASE 10: INTEGRATION ARCHITECTURE PLAN

**Document ID:** `ROADMAP-PHASE-10-DOC-002`  
**Execution Phase:** Roadmap Phase 10 — Cross-App Integration, End-to-End Business Workflows & Data Consistency  
**Target Path:** `docs/implementation/ROADMAP_PHASE_10_INTEGRATION_ARCHITECTURE_PLAN.md`  
**Date:** 2026-11-18  
**Classification:** System Architecture & Cross-Application Integration Plan  

---

## 1. Architectural Foundation & Multi-Tenant Topology

The DFarm platform is built upon strict physical separation of tenant data, centralized control-plane governance, and event-driven end-to-end business workflows.

```mermaid
flowchart TB
    subgraph Client_Applications["DFarm Multi-Application Ecosystem"]
        CA["Customer App<br/>(React Native / Expo Android)"]
        DA["Dairy Admin App<br/>(React / Vite Web)"]
        KA["Collection Kiosk App<br/>(React / Vite Web + Hardware)"]
        SA["Super Admin App<br/>(React / Vite Web)"]
    end

    subgraph Backend_Gateway["Backend API & Domain Services (services/backend)"]
        AuthMiddleware["JWT Authentication & RBAC Engine"]
        TenantRouter["Dynamic Tenant DB Connection Pool Manager"]
        
        subgraph Domain_Services["Authoritative Domain Services"]
            CustSvc["Customer & Identity Service"]
            BioSvc["Biometric (YuNet/SFace) & RFID Service"]
            CollSvc["Milk Intake & Session Service"]
            FinPolicy["Financial Policy Resolution Engine"]
            LedgerSvc["Double-Entry Subledger Service"]
            BillSvc["Billing Cycle & Settlement Engine"]
            PayoutSvc["Maker-Checker Payout & Reconcile Engine"]
            SyncSvc["Offline Sync & Conflict Engine"]
        end
    end

    subgraph Data_Tier["Physical PostgreSQL Persistence Tier"]
        CentralDB[("dfarm_central<br/>Control Plane DB<br/>(Dairies, Global Policies, Hardware, Audit)")]
        TenantDBA[("dfarm_tenant_sangamner<br/>Physical DB Tenant A<br/>(Intakes, Ledger, Bills, Payouts)")]
        TenantDBB[("dfarm_tenant_baramati<br/>Physical DB Tenant B<br/>(Intakes, Ledger, Bills, Payouts)")]
    end

    CA --> AuthMiddleware
    DA --> AuthMiddleware
    KA --> AuthMiddleware
    SA --> AuthMiddleware

    AuthMiddleware --> TenantRouter
    TenantRouter --> Domain_Services

    CustSvc <--> CentralDB
    CustSvc <--> TenantDBA
    FinPolicy <--> CentralDB
    FinPolicy <--> TenantDBA
    CollSvc <--> TenantDBA
    LedgerSvc <--> TenantDBA
    BillSvc <--> TenantDBA
    PayoutSvc <--> TenantDBA
    SyncSvc <--> TenantDBA
    SyncSvc <--> TenantDBB
```

---

## 2. End-to-End Business Workflows (1 through 9)

### Workflow 1: Farmer Discovery, Registration, Biometrics & Approval
```mermaid
sequenceDiagram
    autonumber
    actor Farmer as Farmer (Customer App)
    actor Admin as Dairy Admin (Dairy Admin App)
    participant Backend as Backend API
    participant CentralDB as dfarm_central
    participant TenantDB as dfarm_tenant_db

    Farmer->>Backend: GET /api/v1/customers/discover-dairies (GPS Lat/Lng)
    Backend->>CentralDB: Query active dairies within radius (Haversine)
    CentralDB-->>Farmer: Return discovered dairies list
    Farmer->>Backend: POST /api/v1/customers/register (KYC, Bank, Photo)
    Backend->>CentralDB: Register customer (Status: PENDING_APPROVAL)
    Backend->>TenantDB: Create customer record (status: INACTIVE)
    Backend-->>Farmer: 201 Created (Pending Verification)

    Admin->>Backend: GET /api/v1/customers/pending
    Backend->>TenantDB: Fetch unapproved farmers
    TenantDB-->>Admin: Display pending registration queue
    Admin->>Backend: POST /api/v1/customers/:id/approve (Assign farmer_code C-101)
    Backend->>TenantDB: Update status = ACTIVE, farmer_code = C-101
    Backend->>CentralDB: Update registration_status = APPROVED
    Admin->>Backend: POST /api/v1/customers/:id/biometrics/face (YuNet/SFace vectors)
    Backend->>TenantDB: Store AES-256-GCM encrypted 128-d face embedding
    Admin->>Backend: POST /api/v1/customers/:id/rfid (Assign ISO/IEC 14443 UID)
    Backend->>TenantDB: Store RFID mapping
    Backend-->>Admin: 200 OK (Farmer Fully Enrolled & Active)
```

---

### Workflow 2: Face / RFID Identification, Operator Fallback & Milk Collection
```mermaid
sequenceDiagram
    autonumber
    actor Farmer as Farmer
    actor Operator as Kiosk Operator (Collection App)
    participant Kiosk as Kiosk Browser / App
    participant Scale as Weighing Scale (Serial)
    participant Analyzer as Milk Analyzer (Serial)
    participant Backend as Backend API
    participant TenantDB as dfarm_tenant_db

    Farmer->>Kiosk: Taps RFID card OR Presents face to YuNet camera
    alt Biometric / RFID Match
        Kiosk->>Backend: POST /api/v1/rfid/lookup OR POST /api/v1/biometrics/verify-face
        Backend->>TenantDB: Query encrypted template / RFID UID
        TenantDB-->>Kiosk: Return Farmer: Pandurang Salunkhe (C-101, COW)
    else Identification Fallback
        Operator->>Kiosk: Manual entry of farmer_code C-101 with supervisor audit PIN
        Kiosk->>Backend: POST /api/v1/collections/sessions (Operator Fallback)
    end

    Kiosk->>Scale: Capture gross weight (12.35 Kg)
    Kiosk->>Analyzer: Capture FAT (4.10%) & SNF (8.60%)
    Kiosk->>Backend: POST /api/v1/collections/sessions/:id/complete (Raw sensor measurements)
    Backend->>TenantDB: Resolve Rate Chart & Authoritative Price Snapshot
    Backend->>TenantDB: INSERT milk_collections record
    Backend->>TenantDB: POST Double-Entry Ledger Credit
    Backend-->>Kiosk: 200 OK (Completed with Pricing Snapshot)
    Kiosk->>Kiosk: Print 40-column ESC/POS Thermal Receipt
```

---

### Workflow 3: Offline Milk Intake, Sync Reconciliation & Session Closure Policy
```mermaid
sequenceDiagram
    autonumber
    actor Operator as Kiosk Operator
    participant Kiosk as Kiosk Client (IndexedDB)
    participant Backend as Sync Engine (services/backend)
    participant TenantDB as dfarm_tenant_db

    Note over Kiosk: Internet Disconnected
    Operator->>Kiosk: Weighs & accepts milk delivery from Farmer C-102
    Kiosk->>Kiosk: Store in IndexedDB offline_queue (UUID idempotency key)
    Kiosk->>Kiosk: Print offline thermal receipt with timestamp & offline tag

    Note over Kiosk: Shift Session Closes on Server at 10:00 AM
    Note over Kiosk: Internet Reconnected at 11:30 AM
    Kiosk->>Backend: POST /api/v1/sync/push (Batch offline events)
    Backend->>TenantDB: Check target shift session status
    alt Target Session Open
        Backend->>TenantDB: INSERT milk_collections (COMPLETED)
        Backend->>TenantDB: INSERT ledger credit
    else Target Session Already Closed (Decision Gate Policy)
        Backend->>TenantDB: INSERT milk_collections (RECONCILIATION_REQUIRED)
        Backend->>TenantDB: INSERT sync_conflict_records (CLOSED_SESSION_LATE_ARRIVAL)
        Backend->>TenantDB: INSERT ledger credit with supervisor audit flag
        Note over Backend,TenantDB: Milk preserved; Farmer earnings protected; Audit trail created
    end
    Backend-->>Kiosk: 200 OK (Sync Acknowledged with status flags)
```

---

### Workflow 4: Quality Analysis, Rate Chart Resolution & Pricing Snapshot
1. **Raw Measurement Layer:** Net Weight, FAT%, SNF%, Density, and Temperature are captured raw and unadjusted.
2. **Authoritative Resolution Layer:**
   - Active Dairy Rate Chart (Two-axis Cow/Buffalo matrix or formula base).
   - Global Quality Brackets (Published FAT/SNF deduction or incentive rules).
   - Authorized Dairy / Federation Procurement Floor Rate (Enforces floor price).
3. **Exact Half-Up Decimal Arithmetic:**
   - Evaluated as `roundHalfUp(weightLiters * finalRatePerLiter, 2)`.
   - Result: `12.345 L * ₹45.67/L` = `563.79615` $\to$ **₹563.80**.
4. **Immutable JSONB Snapshot:** Stored inside the collection transaction record for 100% historical auditability.

---

### Workflow 5: Double-Entry Subledger, Feed Purchase & Net Payable Accumulation
```mermaid
flowchart LR
    Intake["Milk Intake<br/>(+₹563.80)"] -->|Credit| CustPayable["Customer Payable<br/>(Subledger Account)"]
    Intake -->|Debit| MilkExp["Milk Purchase Expense<br/>(Operating Expense)"]

    FeedSale["Cattle Feed Sale<br/>(-₹120.00)"] -->|Debit| CustPayable
    FeedSale -->|Credit| FeedRev["Feed Sales Revenue<br/>(Operating Income)"]

    CustPayable --> NetBal["Net Payable Balance<br/>₹443.80"]
```

Every financial movement writes balanced debits and credits:
$$\sum \text{Debits} = \sum \text{Credits}$$
Farmer current balance is maintained transactionally with optimistic concurrency control and zero drift.

---

### Workflow 6: Billing Cycle Generation, Bill Finalization & Payout Batch
1. **Billing Cycle Generation:**
   - Triggered for standard 10-day cycle (e.g. 1st to 10th of month).
   - Aggregates all completed milk intakes for the period.
   - Computes gross earnings, total liters, average FAT/SNF.
   - Deduces cattle feed charges, cash advances, and veterinary fees.
   - Generates `DRAFT` bills per farmer.
2. **Bill Finalization:**
   - Dairy Owner / Accountant reviews cycle summary.
   - Transitions bills from `DRAFT` to `FINALIZED`.
   - Locks underlying milk intakes against retro-adjustments.
3. **Maker-Checker Payout Batch:**
   - **Maker (Accountant):** Generates payout batch for all finalized bills with non-zero payable balances. Status: `DRAFT`.
   - **Checker (Dairy Owner):** Reviews batch, verifies total disbursement and beneficiary details, executes cryptographic approval. Status: `APPROVED`.
   - **Export:** Generates standardized NEFT bank payment CSV with mandatory IFSC, Account Number, Farmer Code, and Net Amount. Status: `PROCESSING`.

---

### Workflow 7: Bank Payout Reconciliation & Farmer Passbook Update
```mermaid
sequenceDiagram
    autonumber
    actor Admin as Dairy Admin (Accountant)
    participant Backend as Backend Payout Engine
    participant TenantDB as dfarm_tenant_db
    actor Farmer as Farmer (Customer App)

    Admin->>Backend: POST /api/v1/payouts/batches/:id/reconcile (Upload Bank Return CSV)
    Backend->>TenantDB: Parse CSV (UTR numbers, Success/Failure status per farmer)
    Backend->>TenantDB: For Settled: Update line status = SETTLED, UTR = UTR123456789
    Backend->>TenantDB: Post Ledger Debit to CUSTOMER_PAYABLE and Credit to BANK_ACCOUNT
    Backend->>TenantDB: For Failed: Update line status = REJECTED with rejection reason
    Backend-->>Admin: 200 OK (Reconciliation Report: 98 Settled, 2 Rejected)

    Farmer->>Backend: GET /api/v1/customers/me/passbook
    Backend->>TenantDB: Query customer_ledger_accounts and reconciled payout lines
    TenantDB-->>Farmer: Live Passbook: UTR reference, Settlement Date, Updated Balance
```

---

### Workflow 8: Super Admin Platform Oversight & Global AMC
1. **Multi-Tenant Health:** Super Admin monitors tenant database connection pools, storage size, and active migration status across all provisioned dairies.
2. **Global Policy Distribution:** Draft policies are quarantined; published policies are cryptographically signed and versioned.
3. **Cross-Tenant Isolation Invariant:** Super Admin queries central metadata only. No Super Admin query ever executes cross-dairy joins or bypasses tenant isolation boundaries.
4. **Hardware & AMC Tracking:** Global inventory of serial numbers, calibration records, and AMC expiry dates monitored with predictive warranty alerts.

---

### Workflow 9: Push / SMS Notification Event Lifecycle
1. **Event Trigger:** Milk intake recorded, bill finalized, or bank payout reconciled.
2. **Payload Construction:** Real event data (liters, fat, amount, UTR, balance). No synthetic templates.
3. **Provider Gateway:** Real SMS/Push dispatcher. If external gateway is unconfigured or offline in development, event is queued with status `QUEUED_EXTERNAL_GATEWAY` without crashing the financial transaction.

---

## 3. Data Integrity & Invariants

1. **Physical Isolation:** Each Dairy operates on an independent PostgreSQL database. Connection credentials and database names are isolated.
2. **Atomic Financial Transactions:** Intake recording, ledger updates, billing finalization, and payout reconciliation are wrapped in ACID PostgreSQL transactions.
3. **Strict Audit Trail:** Every override, supervisor fallback, offline reconciliation, and maker-checker approval records the operator UUID, timestamp, and immutable reason.
