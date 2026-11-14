# DFarm Cross-Phase Integration Architecture & Stabilization Matrix (P04–P11)

## 1. Executive Summary & Integration Baseline

Phase 11 establishes architectural stabilization across all preceding phases of DFarm (P04 through P10), resolving data model mismatches, biometric threshold discrepancies, measurement unit divergence, and incomplete persistence patterns. It also delivers the backend-authoritative Milk Rate Management System with strict NUMERIC financial computation, version immutability, and offline synchronization capabilities.

---

## 2. Cross-Phase Compatibility Matrix

| Phase | Subsystem | Contract Invariants & Status | Verification Mechanism | Status |
| :--- | :--- | :--- | :--- | :--- |
| **P04** | PostgreSQL Schema | Strict UUID primary keys, multi-tenant isolation by `organization_id`, exact NUMERIC arithmetic for money/weights, single-active partial unique indexes on RFID and Biometrics. | Migration 001–014 validation, 42 TAP tests. | **STABLE & VERIFIED** |
| **P05** | Backend API Service | Central Express API, PostgreSQL RLS security context via JWT claim extractors, Supabase client delegation with `authenticated` role inheritance. | 22/22 Phase 11 TAP tests, 54/54 P05 TAP tests. | **STABLE & VERIFIED** |
| **P06** | Registration App | Mobile registration wizard with data minimization. Transitions customer through registration lifecycle stages; supports DRAFT customer consent and face enrollment. | RemoteRfidRepository integration, 24 unit tests pass. | **STABLE & VERIFIED** |
| **P07** | Face Biometrics | MobileFaceNet 128-D embeddings, Cosine similarity metric, canonical threshold `0.720`. Detects unverified empty digest (`e3b0c44...`) and enforces fail-safe fallback to RFID. | ModelService unit tests, TAP subtests 1–3. | **STABLE & VERIFIED** |
| **P08** | Customer Identification | Replaced test-only `InMemoryRfidRepository` with production `PostgreSQLRfidRepository`. Enforces atomic card assignment, duplicate card prevention, and audit history. | Atomic DB transactions, TAP subtests 6–7. | **STABLE & VERIFIED** |
| **P09** | Offline Sync Engine | Synchronizes only PUBLISHED and active rate versions. Preserves historical collection rate snapshots. Rejects unapproved offline device authorization policies. | Sync API contracts, TAP subtests 17–18. | **STABLE & VERIFIED** |
| **P10** | Milk Collection App | Canonical quantity representation in KILOGRAM (`KG`), pricing in `PER_KG`. Authoritative backend calculation fallback. Explicit fail-safe when biometric unapproved. | Android Unit Test Suite (24 tests), TAP subtest 8, 20. | **STABLE & VERIFIED** |
| **P11** | Milk Rate Management | Multi-category support (COW / BUFFALO), Fat/SNF matrix with 0.1 precision, draft-to-published lifecycle, database trigger immutability, center-scoped applicability rules. | Migration 014, 10 REST endpoints, TAP subtests 10–20. | **STABLE & VERIFIED** |

---

## 3. Shared Identifiers and Contracts

### 3.1 Customer UUID Contract
- All phases represent the customer exclusively by an immutable RFC 4122 UUID (`id UUID PRIMARY KEY DEFAULT gen_random_uuid()`).
- `farmer_code` (e.g., `FARM-P11-001`) serves solely as a human-readable identifier and is unique per organization.
- Foreign keys across `customer_milk_categories`, `customer_consent_records`, `face_enrollments`, `rfid_card_assignments`, `milk_collections`, and `customer_ledger_accounts` strictly reference `customers(id)`.

### 3.2 Registration Status Lifecycle
```
DRAFT
  │  (Biometric Consent Recorded)
  ▼
PENDING_FACE_ENROLLMENT
  │  (128-D Template Enrolled & Approved)
  ▼
PENDING_RFID_ASSIGNMENT
  │  (MIFARE / NFC Tag Assigned in PostgreSQL)
  ▼
PENDING_SYNC  (If created on offline mobile client)
  │  (Synchronized to Central Backend)
  ▼
ACTIVE
```

- **Invariant 1**: A customer in `DRAFT` or `PENDING_FACE_ENROLLMENT` status with active, unrevoked consent (`BIOMETRIC_FACE_ENROLLMENT = TRUE`) is explicitly allowed to enroll face biometric templates.
- **Invariant 2**: Transition to `ACTIVE` status requires that both approved prerequisites (active Face Enrollment and active RFID card assignment) are satisfied in PostgreSQL before the customer can deliver milk.

---

## 4. Hardware Boundary Decoupling

In strict compliance with architectural directives:
- All physical devices—including physical RFID readers, optical milk analyzers (Fat/SNF spectrometers), digital weighing scales, and thermal receipt printers—remain deferred.
- No physical drivers or native serial/USB device wrappers have been created.
- Hardware interaction boundaries are abstracted behind domain DTOs and software repository interfaces.

