# DFarm: Architecture Decision Records (ADRs)

This document formalizes the technical and architectural decisions governing the DFarm system. Every record details the business context, technical rationale, alternatives evaluated, trade-offs, security implications, and approval status.

---

## ADR-001: Dedicated Git Repository Isolation

- **Status:** **APPROVED**
- **Decision:** Initialize a dedicated, independent Git repository inside `C:\Users\panka\OneDrive\Desktop\DFarm` and configure an exhaustive root `.gitignore`.
- **Business Reason:** Protects intellectual property and prevents accidental leakage of personal files, documents, or unrelated projects located in the developer's user home directory.
- **Technical Reason:** The developer's user profile `C:\Users\panka` contained a legacy `.git` directory. Executing Git operations in an uninitialized child folder defaults upward to the parent repository.
- **Alternatives Evaluated:** Deleting the parent `C:\Users\panka\.git` (rejected as high-risk to the developer's system).
- **Advantages:** Complete local version control isolation; clean branch history.
- **Limitations:** None.
- **Security Implications:** Eliminates the risk of committing personal user files.
- **Scalability Implications:** Clean monorepo foundation.

---

## ADR-002: Multi-Application Decoupled Ecosystem

- **Status:** **APPROVED**
- **Decision:** Architect the system as four distinct applications (`apps/admin-web`, `apps/registration-android`, `apps/collection-app`, `apps/customer-mobile`) sharing unified packages (`packages/database`, `packages/shared-types`, `packages/shared-validation`).
- **Business Reason:** Different stakeholders have fundamentally different physical environments, security requirements, and operational cadences. Mixing registration into the farmer mobile app or collection into the admin dashboard would create operational bottlenecks and security vulnerabilities.
- **Technical Reason:** Decoupled client builds permit independent release cycles, targeted platform optimizations (e.g., CameraX and NFC on Android vs. web responsive design for Admin), and reduced bundle sizes.
- **Alternatives Evaluated:** A single monolithic multi-role application (rejected due to excessive bundle size, conflicting hardware requirements, and poor operator ergonomics).
- **Advantages:** Maximum separation of concerns; granular role-based security.
- **Limitations:** Requires shared contract maintenance.
- **Security Implications:** Reduces attack surface per application.

---

## ADR-003: Canonical Customer UUID as Single Identity Anchor

- **Status:** **APPROVED**
- **Decision:** Generate an immutable RFC4122 v4 UUID at customer registration that serves as the permanent primary key across personal KYC, biometric face templates, physical RFID card bindings, milk collection records, and ledger credits.
- **Business Reason:** Prevents identity confusion and ensures that a customer's physical card, face, or slip number can never be misattributed to another farmer.
- **Technical Reason:** Avoids database foreign key cascading issues if a farmer changes their mobile phone number or replaces an RFID card.
- **Alternatives Evaluated:** Using mobile number or sequential farmer code as primary key (rejected because farmers occasionally change SIM cards, and sequential codes collide across multi-center mergers).
- **Advantages:** Globally unique, immutable, distributed generation without server roundtrips.
- **Limitations:** Less human-readable (mitigated by assigning a separate display `farmer_code`).
- **Security Implications:** Protects against enumeration attacks.

---

## ADR-004: Triple-Method Identification Priority Chain

- **Status:** **APPROVED**
- **Decision:** Enforce the identification priority:
  $$\text{Face Recognition} \longrightarrow \text{RFID Card Tap} \longrightarrow \text{Supervisor Manual Override (Mandatory Reason)}$$
- **Business Reason:** Minimizes intake counter queue times by prioritizing frictionless biometrics, provides an instant fallback with RFID cards, and ensures business continuity via audited manual override.
- **Technical Reason:** Prevents operator bias or arbitrary manual selection while providing robust fault tolerance against sensor or illumination issues.
- **Alternatives Evaluated:** Allowing operators to freely choose manual search first (rejected because operators default to manual search, re-introducing entry errors).
- **Advantages:** High throughput; audited exception tracking.
- **Limitations:** Requires camera and RFID reader at counter.
- **Security Implications:** Audited manual overrides prevent unauthorized collusion.

---

## ADR-005: On-Device Biometric Embedding Storage & Ephemeral Frame Disposal

- **Status:** **APPROVED**
- **Decision:** Process facial recognition frames strictly on-device in volatile RAM; extract 512D mathematical embedding vectors; encrypt vectors using AES-256-GCM; permanently discard raw camera photographs immediately.
- **Business Reason:** Strict compliance with biometric data protection laws and farmer privacy. Raw face photographs are high-risk assets susceptible to theft.
- **Technical Reason:** 512D float vectors require minimal storage (~2 KB per template) and enable sub-millisecond cosine similarity calculations across thousands of farmers without network latency.
- **Alternatives Evaluated:** Storing JPEG photos in cloud object storage and calling cloud vision APIs (rejected due to privacy liabilities, bandwidth costs, and complete failure during offline rural operations).
- **Advantages:** Zero photo leak liability; ultra-fast local inference; full offline operation.
- **Limitations:** Cannot visually display the farmer's stored photo on screen (mitigated by storing an optional non-biometric profile thumbnail if farmer consents).
- **Security Implications:** One-way embedding vectors cannot be reversed into original facial images.

---

## ADR-006: Hardware Integration Deferral & Software Contract Abstraction

- **Status:** **APPROVED**
- **Decision:** Defer all physical analyzer, weighing scale, and microcontroller driver development. Define strictly typed software input contracts, validation services, and simulation test harnesses.
- **Business Reason:** Eliminates hardware procurement and laboratory test bench dependencies from blocking software architecture and application development.
- **Technical Reason:** Clean separation of concerns via the Hardware Abstraction Layer (HAL). Core financial and intake workflows operate on domain contracts regardless of input source.
- **Alternatives Evaluated:** Attempting early hardware serial driver development (rejected as premature, unverified, and high risk of project paralysis).
- **Advantages:** Rapid software development; 100% testable via unit and simulator suites.
- **Limitations:** Final end-to-end hardware validation occurs in later deployment phases.
- **Security Implications:** Eliminates raw serial buffer overflow vulnerabilities in early phases.

---

## ADR-007: Supabase PostgreSQL for Authoritative Central Cloud Database

- **Status:** **RECOMMENDED**
- **Decision:** Adopt Supabase PostgreSQL as the primary central relational database engine, leveraging PostgreSQL transactions, constraints, and Row Level Security (RLS).
- **Business Reason:** High reliability, relational integrity for financial ledgers, built-in authentication, and managed cloud infrastructure.
- **Technical Reason:** Native support for ACID transactions, JSONB, foreign keys, and RLS policies separating multi-tenant organizations and farmer accounts.
- **Alternatives Evaluated:** MongoDB / Document DB (rejected due to lack of strict relational constraints for double-entry financial ledgers), Raw AWS RDS PostgreSQL (acceptable alternative, but Supabase provides faster integration for Auth and Edge APIs).
- **Advantages:** Robust SQL standards; direct compatibility with Prisma/Drizzle ORMs.
- **Limitations:** Requires Docker for local offline emulation.
- **Security Implications:** Strong database-enforced RLS.

---

## ADR-008: SQLite + Sync Journal for Edge Counter Offline Resilience

- **Status:** **RECOMMENDED**
- **Decision:** Implement embedded SQLite with an append-only `sync_journal` table on collection counter terminals and registration Android devices.
- **Business Reason:** Collection centers must never stop operating during daily rural power or internet outages.
- **Technical Reason:** Zero-latency local reads/writes, zero external daemon requirements, rock-solid transactional ACID compliance, and low memory footprint.
- **Alternatives Evaluated:** CouchDB / PouchDB (rejected due to sync complexity and large runtime overhead on low-end terminals).
- **Advantages:** Autonomous offline operations; deterministic sync replay.
- **Limitations:** Requires client-side schema migration management.
- **Security Implications:** Protected at rest using SQLCipher AES-256 encryption.

---

## ADR-009: Structural Isolation of Dairy Ledger and Employee Payroll

- **Status:** **APPROVED**
- **Decision:** Maintain separate relational table spaces and ledger models for Farmer Milk Accounts (`customer_ledger`, `monthly_bills`) and Employee Staff Payroll (`employees`, `payroll_runs`).
- **Business Reason:** Eliminates commingling of business operational payroll and trade customer milk settlements, adhering to standard accounting principles.
- **Technical Reason:** Farmer accounts involve high-frequency daily credits with dynamic compositional pricing and feed credit debits; staff payroll involves monthly fixed salaries, shifts, and allowances.
- **Alternatives Evaluated:** A single unified "accounts" table with role flags (rejected due to query complexity and high risk of accidental cross-debiting).
- **Advantages:** Clear audit trails; clean separation of financial statements.
- **Limitations:** Requires two distinct billing engines.
- **Security Implications:** Prevents staff from viewing farmer balances and vice versa.

---

## ADR-010: Technology Stacks for Applications

- **Status:** **RECOMMENDED**
- **Decisions:**
  - **Admin Web:** React, TypeScript, Vite, TailwindCSS.
  - **Customer Mobile App:** React Native, Expo, TypeScript.
  - **Backend API:** Node.js, TypeScript, Express / Fastify.
  - **Customer Registration App:** Android Native (Kotlin) or React Native Bare Workflow with CameraX.
  - **Collection Counter Terminal:** Cross-platform React / Electron desktop or Android tablet.
- **Technical Reason:** High code and type reusability across web, mobile, and backend using `packages/shared-types` and `packages/shared-validation`.
- **Alternatives Evaluated:** Flutter (evaluated, but TypeScript full-stack monorepo provides superior sharing of Zod validation schemas and DTOs).

---

## ADR-011: Development Workspace Location Regarding OneDrive

- **Status:** **PENDING OWNER APPROVAL**
- **Context:** The workspace `C:\Users\panka\OneDrive\Desktop\DFarm` is located inside Microsoft OneDrive.
- **Risk Assessment:** OneDrive background synchronization actively locks files during sync cycles. During Node.js package installations (`node_modules`), Android Gradle builds (`.gradle`, `build/`), and SQLite database operations (`*.db-wal`), OneDrive locks can trigger `EBUSY`, `EPERM`, and file corruption errors.
- **Recommendation:** Keep the repository in `C:\Users\panka\OneDrive\Desktop\DFarm` for documentation and design, but configure build artifact directories or consider relocating the active build workspace outside OneDrive (e.g., `C:\Projects\DFarm`) if file-locking collisions occur during Phase 03/04 development.
- **Status:** PENDING OWNER REVIEW (No files moved without authorization).

