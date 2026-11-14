# DFarm Smart Dairy Management System — Final System Architecture
**Document Reference:** `docs/release/final-system-architecture.md`  
**Phase:** 20 of 20 (Production Release Readiness)  
**System Status:** RELEASE READY (Software Interfaces Verified; Hardware & Live External Gateways Deferred/Blocked)  

---

## 1. High-Level System Overview

The DFarm Smart Dairy Management System is an enterprise-grade multi-tier dairy operations platform designed for dairy cooperative unions, chilling centers, village collection centers, milk producers (farmers), and administrative staff. It unifies high-throughput offline milk intake, automated pricing calculations, transparent financial accounting, inventory management, employee payroll, customer self-service, and multi-channel notification automation.

```
                              ┌──────────────────────────────────────┐
                              │            Client Layer              │
                              ├──────────────────┬───────────────────┤
                              │ Android Native   │ Admin Web         │ Customer Mobile
                              │ (Collection App) │ (React Dashboard) │ (Expo / React Native)
                              │ (Registration)   │                   │
                              └─────────┬────────┴─────────┬─────────┴────────┬─────────┘
                                        │                  │                  │
                                        ▼                  ▼                  ▼
                              ┌─────────────────────────────────────────────────────────┐
                              │           API Gateway / Ingress & Middleware            │
                              │  - Strict TLS 1.3 Termination                           │
                              │  - Helmet Security Headers & Content-Security-Policy    │
                              │  - CORS Multi-Origin Whitelist                          │
                              │  - Sliding Window Distributed Rate Limiting             │
                              │  - JWT Bearer Authentication & HMAC Signature Auth      │
                              │  - Organization & Center Multi-Tenant Isolation         │
                              └────────────────────────────┬────────────────────────────┘
                                                           │
                                                           ▼
                              ┌─────────────────────────────────────────────────────────┐
                              │           Backend Application Core Services             │
                              │  - Customer Registration & Consent Engine               │
                              │  - Milk Collection & Two-Axis Grid Pricing Engine       │
                              │  - Bidirectional Offline Sync Engine (Tombstone Vector) │
                              │  - Double-Entry Customer Ledger & Financial Subsystem   │
                              │  - Feed Inventory, Stock Reorder & Billing Engine       │
                              │  - Employee Lifecycle & Attendance-Driven Payroll       │
                              │  - Multi-Channel Notification Engine (WhatsApp / Push)  │
                              └───────────────┬─────────────────────────┬───────────────┘
                                              │                         │
                                              ▼                         ▼
                    ┌───────────────────────────────────┐    ┌───────────────────────────────────┐
                    │      Storage & Persistence        │    │    External Boundary & Adapters   │
                    │  - PostgreSQL 17 / Supabase RLS   │    │  - Meta WhatsApp Cloud API (v21.0)│
                    │  - Atomic NUMERIC Transactions    │    │  - Firebase Cloud Messaging (FCM) │
                    │  - Immutable Financial Audit Trail│    │  - Software Serial Hardware Stubs │
                    │  - Client Sync Cursor Stores      │    │  - ONNX / TFLite Biometric Stub   │
                    └───────────────────────────────────┘    └───────────────────────────────────┘
```

---

## 2. Component Inventory

### 2.1 Backend Application Core (`services/backend`)
- **Runtime:** Node.js v22 (LTS) / Express ESM
- **Language:** TypeScript 5.7 (Strict Mode, `NodeNext` resolution)
- **Database Engine:** PostgreSQL 17 (Supabase Managed or Standard Self-Hosted)
- **Key Modules:**
  - `auth`: JWT issuance, multi-tenant RBAC enforcement, session lifecycle.
  - `customers`: Unique mobile enforcement, farmer code assignment, consent records.
  - `collection`: Intake session orchestration, measurement validation, rate computation.
  - `rates`: Grid-based, Total Solids formula, and Two-Axis formula pricing engines.
  - `sync`: Change-vector push/pull with soft-deletion tombstones and idempotency tokens.
  - `ledger`: Double-entry accounting, transaction-level debit/credit balance enforcement.
  - `billing`: Monthly/ten-day billing cycles, automated deduction netting, statement generation.
  - `feed`: Multi-warehouse stock tracking, weighted average valuation, POS counter sales.
  - `payroll`: Attendance-integrated earnings, statutory PF/tax deductions, advance recovery.
  - `notifications`: Durable outbox, Meta WhatsApp Business Cloud adapter, FCM adapter.

### 2.2 Admin Web Console (`apps/admin-web`)
- **Framework:** React 18 / Vite / TypeScript
- **State Management:** Reactive Context & Modular API client hooks
- **Security Boundaries:** Strict client bundle isolation (no Supabase `SERVICE_ROLE_KEY` embedded; strictly Bearer token API communication).
- **Primary Dashboards:** Operational KPIs, Customer Directory, Milk Collection Shifts, Rate Chart Authoring & Matrix Simulation, Accounting & Settlements, Device Fleet Management, Reports & Export Engine.

### 2.3 Android Registration App (`apps/registration-android`)
- **Platform:** Native Android (Min SDK: 26, Target SDK: 36)
- **Toolchain:** Kotlin 2.2.0, Jetpack Compose, Gradle 9.1.0
- **Primary Capabilities:** On-boarding wizard, mobile normalization, consent capture, safe RFID / Supervisor fallback identification, local encrypted credential cache.

### 2.4 Android Milk Collection POS (`apps/collection-app`)
- **Platform:** Native Android (Min SDK: 24, Target SDK: 36)
- **Toolchain:** Kotlin 2.2.0, Jetpack Compose, Room SQLite with SQLCipher encryption, Gradle 9.1.0
- **Primary Capabilities:** Offline-first intake state machine, category selection (COW/BUFFALO), measurement validation, offline rate calculations, receipt printing preparation, background sync queue.

### 2.5 Farmer Customer Mobile App (`apps/customer-mobile`)
- **Platform:** React Native 0.76.6 / Expo 52.0.0 / TypeScript
- **Primary Capabilities:** Milk delivery passbook, financial ledger statement, deduction visibility, payment receipt viewing, multi-lingual in-app inbox.

### 2.6 Shared Packages
- `@dfarm/shared-types`: Canonical TypeScript interfaces, enums, DTOs, and event contracts.
- `@dfarm/shared-validation`: Zod schemas for all network requests, hardware payloads, and sync entities.
- `@dfarm/database`: PostgreSQL migrations, RLS policies, indexing scripts, and seed fixtures.

---

## 3. Communication & Data Flow

### 3.1 Milk Collection & Financial Credit Workflow
1. **Intake Event:** Farmer presents RFID card or Supervisor selects Farmer profile.
2. **Measurement Capture:** Weight (KG), Fat %, and SNF % captured.
3. **Local Validation:** Quantity within `[0.5, 100.0]` KG, Fat within `[2.0, 15.0]` %, SNF within `[6.0, 12.0]` %.
4. **Rate Application:** Rate engine matches active rate chart by `(organization_id, milk_category, effective_date)`.
5. **Intake Persisted:** Local SQLite creates immutable intake transaction with client UUID.
6. **Sync Push:** Event synced to backend via `/api/v1/sync/push`.
7. **Authoritative Posting:** Backend verifies idempotency key, posts milk collection row, inserts credit to `ledger_transactions`, updates `customer_ledger_accounts.current_balance`, and creates balanced `ledger_entries` (Debit Milk Inventory, Credit Customer Payable).
8. **Outbox Notification:** Enqueues WhatsApp/Push notification in `notification_records`.

---

## 4. Hardware & External Service Boundary

| Subsystem | Production Implementation Status | Safe Fallback / Boundary |
|:---|:---|:---|
| **RFID Physical Readers** | Deferred (Software Serial Stub) | Manual numeric keyboard / Supervisor selection |
| **Milk Analyzers / Scales** | Deferred (RS-232 / USB Stubs) | Manual numeric keypad validation |
| **Thermal Receipt Printers** | Deferred (ESC/POS Driver Stub) | In-app digital receipt & WhatsApp receipt |
| **Face Recognition Engine** | BLOCKED (Model weights missing) | Safe RFID & Supervisor PIN fallback |
| **WhatsApp Business API** | Ready (Cloud Graph API v21.0) | Graceful BLOCKED log if credentials omitted |
| **Firebase Cloud Messaging** | Ready (HTTP v1 API Adapter) | Graceful queue & retry if unconfigured |

