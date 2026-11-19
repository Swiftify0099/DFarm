# DFarm Implementation Dependency & Topological Order Map

## 1. Executive Summary

This document establishes the strict topological dependency graph for repairing and engineering the complete DFarm platform. To prevent circular dependencies, regressive bugs, and orphaned features, development must proceed strictly from lower-layer substrates (database engines, auth middleware, tenant routing) upward to user interfaces and hardware drivers.

---

## 2. Multi-Tier Dependency Architecture

```mermaid
graph TD
    subgraph Tier 0: Platform Substrate
        T0_1[PostgreSQL Database Clusters]
        T0_2[Environment & Configuration Engine]
        T0_3[Database Migration Runners]
    end

    subgraph Tier 1: Identity & Tenant Resolution
        T1_1[Central Control Plane Database]
        T1_2[Cryptographic Auth Engine & JWT]
        T1_3[Dynamic Tenant Resolver Middleware]
    end

    subgraph Tier 2: Tenant Provisioning & Admin Onboarding
        T2_1[Super Admin Dairy Creation Engine]
        T2_2[Automated Tenant DB Provisioner]
        T2_3[Dairy Admin Invitation & Activation Engine]
    end

    subgraph Tier 3: Customer Identity & Biometrics
        T3_1[Customer Registration & Geofence Discovery]
        T3_2[OpenCV YuNet & SFace Biometric Pipeline]
        T3_3[Dairy Admin Customer Approval Queue]
    end

    subgraph Tier 4: Hardware & Collection Kiosk
        T4_1[Web Serial Drivers: Analyzer & Scale]
        T4_2[Collection Shift Session State Machine]
        T4_3[Kiosk Customer Identification Engine]
    end

    subgraph Tier 5: Milk Intake & Atomic Ledger
        T5_1[FAT / SNF Rate Matrix Calculator]
        T5_2[Atomic Milk Intake Transaction Engine]
        T5_3[Double-Entry Ledger Invariant Engine]
    end

    subgraph Tier 6: Billing, Feed & Financial Settlement
        T6_1[Automated Billing Cycle Generator]
        T6_2[Feed Inventory & Credit Sales]
        T6_3[Farmer Passbook & Ledger History]
    end

    subgraph Tier 7: Payouts & Banking Reconciliations
        T7_1[Maker-Checker Payout Batch Engine]
        T7_2[SBI CMP NEFT / RTGS File Serializer]
        T7_3[Bank Statement CSV Reconciliation]
    end

    subgraph Tier 8: Governance & Platform Monetization
        T8_1[Immutable Audit Trail Ledger]
        T8_2[Controlled Support Access Portal]
        T8_3[Razorpay AMC Subscription & Licensing]
    end

    %% Dependency Connections
    T0_1 --> T1_1
    T0_2 --> T1_2
    T0_3 --> T1_1
    T1_1 --> T1_3
    T1_2 --> T1_3
    T1_3 --> T2_1
    T2_1 --> T2_2
    T2_2 --> T2_3
    T2_3 --> T3_1
    T3_1 --> T3_2
    T3_2 --> T3_3
    T3_3 --> T4_3
    T4_1 --> T4_2
    T4_3 --> T4_2
    T4_2 --> T5_2
    T5_1 --> T5_2
    T5_2 --> T5_3
    T5_3 --> T6_1
    T5_3 --> T6_2
    T5_3 --> T6_3
    T6_1 --> T7_1
    T7_1 --> T7_2
    T7_2 --> T7_3
    T7_3 --> T5_3
    T1_1 --> T8_1
    T1_3 --> T8_2
    T2_1 --> T8_3
```

---

## 3. Tier-by-Tier Invariants and Prerequisites

### Tier 0: Platform Substrate & Infrastructure
- **Prerequisites**: Functional local or cloud PostgreSQL instance (v15+) accessible via port 5432.
- **Invariants**: 
  - Zero reliance on in-memory `pg-mem` fallbacks for production or end-to-end integration tests.
  - Strict validation of environment variables on process boot (`Zod` / `Joi` schema).
  - Migration sequence collision on index `031` resolved.

### Tier 1: Identity & Tenant Resolution
- **Prerequisites**: Tier 0 operational.
- **Invariants**:
  - `JWT_SECRET` must be cryptographically generated; hardcoded string defaults removed.
  - Elimination of `x-dev-*` bypass headers in non-local environments.
  - Tenant Resolver Middleware must intercept all incoming REST requests, resolving `req.tenantClient` from `req.user.dairyId`.

### Tier 2: Tenant Provisioning & Admin Onboarding
- **Prerequisites**: Tier 1 operational.
- **Invariants**:
  - Super Admin dairy creation must be an atomic transaction: writing to `central.dairies`, creating the tenant database/schema, and generating the Primary Dairy Admin activation token.
  - Dairy Admin activation requires verified mobile OTP and email token before account status transitions to `ACTIVE`.

### Tier 3: Customer Identity, Geofencing & Biometrics
- **Prerequisites**: Tier 2 operational.
- **Invariants**:
  - Customer registration must enforce geolocation boundaries (customer must be within configured radius of the selected dairy center).
  - Biometric pipeline: YuNet detects face, SFace generates 128D embedding. Vector must be validated for unit length ($L_2 \text{ norm} \approx 1.0$).
  - Farmer account remains `PENDING_APPROVAL` until Dairy Admin explicitly approves or rejects.

### Tier 4: Hardware Interfaces & Kiosk Session Management
- **Prerequisites**: Tier 3 operational.
- **Invariants**:
  - Collection App connects to weighing scales and milk analyzers via standard Web Serial API streams.
  - Collection shift must be opened with operator authentication before any milk intake can occur.
  - Kiosk identification verifies face against tenant vector database with cosine similarity threshold $\ge 0.65$.

### Tier 5: Milk Intake & Atomic Ledger Engine
- **Prerequisites**: Tier 4 operational.
- **Invariants**:
  - Milk rate lookup must be deterministic based on the active rate chart version for that shift date.
  - Intake record insertion and double-entry ledger posting (`CUSTOMER_PAYABLE` credit, `MILK_PURCHASE_EXPENSE` debit) must occur within an atomic database transaction.
  - Ledger entries are strictly immutable via database triggers.

### Tier 6: Billing Cycles, Feed Inventory & Settlements
- **Prerequisites**: Tier 5 operational.
- **Invariants**:
  - Billing cycles (10-day / 15-day / monthly) aggregate finalized milk collections, deduct active advance recovery, and deduct feed store credit purchases.
  - Eligible payout balance is computed using `compute_eligible_payout_balance()`.

### Tier 7: Farmer Payouts & Banking Reconciliations
- **Prerequisites**: Tier 6 operational.
- **Invariants**:
  - Maker-checker separation: Dairy Staff generates draft batch; Dairy Admin approves.
  - Output files generated according to SBI Corporate Banking (CMP) specifications.
  - Bank statement CSV import updates payout records and posts double-entry bank clearing ledger rows.

### Tier 8: Governance, Audit & AMC Monetization
- **Prerequisites**: Tiers 1 through 7 operational.
- **Invariants**:
  - All Super Admin actions recorded in append-only administrative ledger.
  - Support access is strictly time-bound and requires dual-key approval.
  - Platform AMC managed via Razorpay webhook listeners; expired dairies transition to grace period and then suspension.

---

## 4. Circular Dependency Mitigation Strategy

1. **Avoid Circular Imports in TypeScript**:
   - Shared interfaces and DTOs are isolated in `@dfarm/shared-types`.
   - Domain models never import from controllers or routes.
   - `TenantDatabaseManager` does not import business services; it receives connection parameters and returns database clients.
2. **Database Cross-Schema Foreign Keys**:
   - Operational tenant databases (`dfarm_tenant_<id>`) NEVER contain foreign key constraints pointing to the central control plane database (`dfarm_central`). Cross-database foreign keys are not supported in PostgreSQL.
   - Cross-database integrity is enforced by application-level domain services using UUID references.
