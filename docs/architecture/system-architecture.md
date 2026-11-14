# DFarm: Complete System Architecture

## 1. Architectural Overview

The DFarm platform employs an offline-first, client-server hybrid architecture. Edge client devices (Android Registration devices and Collection Counter terminals) run local persistence engines that queue transactions during rural network outages and perform bi-directional synchronization with the central cloud infrastructure.

```mermaid
graph TB
    subgraph Edge_Intake_Counter [Dairy Collection Counter (Offline-First)]
        direction TB
        Camera[Device Camera] --> FaceEngine[Face Recognition Engine<br/>ONNX / MobileFaceNet]
        RFIDReader[RFID Card Reader Input] --> RFIDEngine[Card Resolution Module]
        ManualUI[Supervisor Override UI] --> ManualAuth[Supervisor Verification Engine]

        FaceEngine --> IntakeController[Intake Controller]
        RFIDEngine --> IntakeController
        ManualAuth --> IntakeController

        IntakeController --> LocalDB[(Local SQLite DB<br/>Customers, Rates, Face Vectors)]
        IntakeController --> MilkCalc[Milk Calculation Engine]
        MilkCalc --> LocalJournal[(Offline Sync Journal<br/>Collections, Slips, Audits)]
        LocalJournal --> LocalReceipt[Thermal Receipt Printer]
    end

    subgraph Sync_Transport [Secure Sync Layer]
        LocalJournal <==>|HTTPS / JSON Batch<br/>Idempotent Cursors| SyncGateway[Sync Gateway Service]
    end

    subgraph Cloud_Infrastructure [Central Cloud Platform (Authoritative)]
        SyncGateway --> APIRouter[API Gateway Router]
        APIRouter --> AuthSvc[Auth & RBAC Service]
        APIRouter --> CustSvc[Customer Lifecycle Service]
        APIRouter --> RateSvc[Pricing & Rate Chart Service]
        APIRouter --> LedgerSvc[Double-Entry Ledger Service]
        APIRouter --> BillingSvc[Billing & Payroll Engine]
        APIRouter --> AuditSvc[Immutable Audit Logger]

        AuthSvc --> CloudDB[(Supabase PostgreSQL<br/>Row Level Security)]
        CustSvc --> CloudDB
        RateSvc --> CloudDB
        LedgerSvc --> CloudDB
        BillingSvc --> CloudDB
        AuditSvc --> CloudDB
    end

    subgraph External_Interfaces [Administrative & Farmer Clients]
        AdminApp[Admin Web Dashboard<br/>React / TypeScript] ==>|HTTPS / WSS| APIRouter
        FarmerApp[Farmer Mobile App<br/>React Native / Expo] ==>|HTTPS| APIRouter
        WhatsAppAPI[WhatsApp Business API] <==|Webhooks / REST| BillingSvc
    end
```

---

## 2. Component Boundaries & Responsibilities

### 2.1 Edge Intake Counter (Collection Counter Terminal)
- **Local Autonomy:** Contains complete local SQLite replicas of active customer records, cryptographic face embedding templates, assigned RFID card mappings, and effective rate charts.
- **Biometric Inference Sandbox:** Camera frames are evaluated in memory using a mobile-optimized embedding model (e.g. MobileFaceNet via ONNX Runtime). No external API calls are made during matching.
- **Intake Validation:** Validates Fat%, SNF%, and weight inputs against biological thresholds before allowing collection sessions to be finalized.
- **Atomic Local Persistence:** Inserts milk collection records, posts customer ledger balance adjustments, and appends sync journal events within a single local SQLite transaction.

### 2.2 Cloud Backend Service & Sync Gateway (Node.js + TypeScript)
- **Authoritative Identity:** Central source of truth for customer states (`DRAFT`, `ACTIVE`, `SUSPENDED`, `SOFT_DELETED`), permitted milk categories, and supervisor permissions.
- **Batch Idempotency Engine:** Ingests offline sync batches, verifies composite idempotency keys, prevents duplicate transaction insertions, and returns synchronization cursors.
- **Pricing Authority:** Manages the lifecycle of rate charts with effective date ranges, enforcing snapshot retention so updated charts do not alter historical collection payouts.
- **Double-Entry Financial Ledger:** Processes credits from milk collections, debits from cattle feed sales and cash advances, and computes periodic settlements.

### 2.3 Central Relational Store (Supabase PostgreSQL)
- **Data Integrity:** Strict foreign key constraints, check constraints (e.g., non-negative weights, valid Fat/SNF ranges), and unique constraints (mobile number per organization, card UID, transaction idempotency keys).
- **Row Level Security (RLS):** Isolates data across dairy collection centers and ensures mobile customer tokens can only read their own records.
- **Event Audit Logs:** Append-only event store capturing customer lifecycle transitions, supervisor overrides, rate changes, and billing actions.

---

## 3. Communication Protocols

| Interface | Protocol | Security | Payload Format |
| :--- | :--- | :--- | :--- |
| **Registration $\rightarrow$ Backend** | HTTPS / TLS 1.3 | JWT Bearer Token + AES Encrypted Templates | JSON / multipart |
| **Collection $\rightarrow$ Backend (Sync)** | HTTPS / TLS 1.3 | Device Mutual Auth / Signed Bearer Token | Compressed JSON Batch |
| **Admin Web $\rightarrow$ Backend** | HTTPS / WSS | Session Cookie / JWT + RBAC Headers | JSON / WebSockets |
| **Farmer Mobile $\rightarrow$ Backend** | HTTPS / TLS 1.3 | Customer Mobile JWT | JSON |
| **Backend $\rightarrow$ WhatsApp** | HTTPS REST | OAuth 2.0 Access Token | JSON |

