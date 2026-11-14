# DFarm — Smart Dairy Management System

[![Architecture: Greenfield](https://img.shields.io/badge/Status-Phase_02_Foundation-blue.svg)](docs/development/development-roadmap.md)
[![Security: Zero_Secrets_in_Client](https://img.shields.io/badge/Security-Enforced-green.svg)](docs/security/security-architecture.md)
[![Hardware: Strictly_Deferred](https://img.shields.io/badge/Hardware-Software_Contracts_Only-orange.svg)](docs/architecture/hardware-deferred-boundary.md)

DFarm is an automated, enterprise-grade Smart Dairy Management System designed for dairy milk collection centers handling **Cow Milk**, **Buffalo Milk**, and combined operations.

The system eliminates manual ledger errors, prevents identity misattribution during high-throughput collection sessions, validates milk composition and weights against configurable business rules, computes real-time pricing via dynamic rate matrices, updates double-entry customer ledgers atomically, and operates seamlessly offline with automatic cloud synchronization.

---

## 1. Core Applications in Ecosystem

The system consists of four independent software products sharing unified domain contracts:

1. **Admin Web Dashboard (`apps/admin-web/`):** React & TypeScript responsive application for dairy directors, accounting teams, and operations managers. Covers rate chart matrices, billing cycles, customer accounts, feed inventory, payroll, and audit logs.
2. **Customer Registration Android App (`apps/registration-android/`):** Dedicated administrative mobile application for onboarding dairy farmers. Captures KYC, verifies unique phone numbers, generates canonical UUIDs, assigns Cow/Buffalo permissions, records biometric consent, enrolls facial templates, and binds RFID cards.
3. **Milk Collection & Security Application (`apps/collection-app/`):** High-speed intake application deployed at dairy collection counters. Orchestrates the triple-identification chain (**Face Recognition $\rightarrow$ RFID Card $\rightarrow$ Supervisor Manual Override**), validates Fat/SNF/Weight software inputs, applies active rate charts, prints slips, and records ledger credits offline-first.
4. **Customer Mobile Application (`apps/customer-mobile/`):** React Native / Expo application for registered farmers to monitor daily milk deliveries, fat/SNF trends, collection amounts, digital passbooks, feed purchase debits, advances, and monthly settlement statements.

---

## 2. Directory Architecture

```
DFarm/
├── apps/
│   ├── admin-web/              # React + TypeScript administrative web portal
│   ├── registration-android/   # Dedicated Android app for customer KYC, Face & RFID enrollment
│   ├── collection-app/         # Fast intake counter terminal (Triple-method ID & collection)
│   └── customer-mobile/        # React Native / Expo self-service portal for farmers
├── services/
│   └── backend/                # Node.js + TypeScript central REST API & Sync Gateway
├── packages/
│   ├── database/               # Supabase PostgreSQL migrations, seeds, and schema definitions
│   ├── shared-types/           # Shared TypeScript interfaces, DTOs, and domain models
│   └── shared-validation/      # Zod validation schemas for inputs, rates, and collections
├── docs/                       # Complete architectural specifications and decision records
│   ├── architecture/           # System, application, accounting, and hardware boundary docs
│   ├── database/               # Relational schemas, sync protocol, and soft-delete specs
│   ├── security/               # Security architecture, RLS matrix, and environment configs
│   ├── workflows/              # Customer registration, identification, and collection flows
│   └── development/            # 20-phase roadmap and engineering guidelines
├── scripts/                    # Development, verification, and migration utility scripts
├── .env.example                # Safe environment variable template (No actual secrets)
├── .gitignore                  # Comprehensive secret and build artifact exclusion rules
└── README.md                   # This project root document
```

---

## 3. Strict Architectural Principles

- **Single Canonical Customer UUID:** A farmer's personal identity, biometric enrollment vector, and physical RFID card UID are strictly linked to a single, immutable Customer UUID generated at initial registration.
- **Biometric Security & Privacy:** Raw facial images are processed in-memory and discarded. Only mathematical embedding vectors are encrypted and retained under explicit biometric consent.
- **Triple Identification Hierarchy:** Collection intake enforces:
  $$\text{Face Recognition} \longrightarrow \text{RFID Card Tap} \longrightarrow \text{Supervisor Manual Override (Documented Reason)}$$
- **Offline-First Resilience:** Collection centers operate autonomously on local SQLite databases during internet outages. Sync journals track transactions with composite idempotency keys, preventing duplicate ledger credits when connectivity resumes.
- **Double-Entry Financial Isolation:** Customer milk credits, feed debits, and advances are maintained in an immutable financial ledger, strictly isolated from internal employee payroll.
- **Hardware Integration Deferred:** All physical hardware integrations (serial port analyzers, weighing scales, hardware RFID reader firmware) are strictly deferred. In Phase 02, only robust software validation interfaces and data contracts are defined.

---

## 4. Documentation Index

Detailed architectural blueprints are available under [`docs/`](docs/):
- [Project Overview](docs/project-overview.md)
- [System Architecture](docs/architecture/system-architecture.md)
- [Application Architecture](docs/architecture/application-architecture.md)
- [Customer Registration Flow](docs/workflows/customer-registration-flow.md)
- [Customer Identification Flow](docs/workflows/identification-flow.md)
- [Milk Collection Workflow](docs/workflows/milk-collection-flow.md)
- [Database Architecture & Schema](docs/database/database-architecture.md)
- [Local + Cloud Offline Sync](docs/database/local-cloud-sync.md)
- [Soft Delete & Biometric Erasure](docs/database/soft-delete-restore.md)
- [Financial & Accounting Architecture](docs/architecture/accounting-architecture.md)
- [Role & Permission Matrix](docs/security/role-permission-matrix.md)
- [Security Architecture](docs/security/security-architecture.md)
- [Environment Variables Guide](docs/security/environment-variables.md)
- [Hardware Deferred Boundary](docs/architecture/hardware-deferred-boundary.md)
- [Development Roadmap (20 Phases)](docs/development/development-roadmap.md)
- [Architecture Decision Records (ADRs)](docs/architecture/architecture-decisions.md)

