# DFarm: Database Architecture Decision Records (DB-ADRs)
**Phase 03 of 20: Corrections to Assumptions & Authoritative Decisions**

---

## 1. Corrections to Prior Assumptions & Status Classification

This document formally records all architectural decisions, adjustments to Phase 02 assumptions, and classifications for the Phase 03 database design.

| Ref # | Decision Area | Phase 02 Assumption | Phase 03 Corrected Decision | Status |
| :---: | :--- | :--- | :--- | :---: |
| **DB-01** | **Face Embedding Dimension** | Hardcoded 512D vector assumed | **Metadata-Driven:** Stored in `face_model_versions.embedding_dimension` supporting 128D, 512D, etc. | **APPROVED** |
| **DB-02** | **Face Model Selection** | MobileFaceNet assumed final | **Configurable Catalog:** Models managed in `face_model_versions` with dynamic runtimes. | **APPROVED** |
| **DB-03** | **Similarity Threshold** | Hardcoded 0.80/0.82 assumed | **Calibrated Metric:** Configurable per model in `face_model_versions.recommended_threshold`. | **APPROVED** |
| **DB-04** | **Fat & SNF Bounds** | Universal fixed limits assumed | **Center Configurable:** Bounds stored in `center_settings` (`cow_fat_min`, `buffalo_fat_max`, etc.). | **APPROVED** |
| **DB-05** | **Biometric Retention Window**| Fixed 30–90 days assumed | **Policy-Driven:** Managed dynamically in `biometric_retention_records` per approved privacy policy. | **RECOMMENDED** |
| **DB-06** | **Billing Cycle Frequency** | 10-day cycle assumed approved | **Calendar Month Default:** Initial default is `CALENDAR_MONTH`, configurable in `center_settings`. | **RECOMMENDED** |
| **DB-07** | **Supervisor Restore Rights** | Supervisors restoring accounts | **Restricted Authorization:** Only `DAIRY_OWNER` or `SUPER_ADMIN` can restore deleted accounts. | **APPROVED** |
| **DB-08** | **Financial Sign Conventions** | Undefined balance formula | **Dairy Liability Standard:** Credit increases payable to farmer; Debit decreases payable; Positive = Net Payable. | **APPROVED** |
| **DB-09** | **Mobile Uniqueness Scope** | Global uniqueness risk | **Organization Scoped:** `UNIQUE (organization_id, normalized_mobile_number)`. | **APPROVED** |
| **DB-10** | **Multiple Legitimate Intake** | Hash of customer+shift+date | **Client Intake UUID:** Idempotency derived from `client_intake_uuid` allowing multiple deliveries per shift. | **APPROVED** |
| **DB-11** | **Physical Hardware Scope** | Premature driver development | **Strictly Deferred:** Pure software validation contracts; zero physical machine driver code. | **APPROVED** |

---

## 2. In-Depth Decision Records

### DB-ADR-001: Metadata-Driven Biometric Feature Dimension
- **Status:** **APPROVED**
- **Decision:** Do not hardcode a 512-dimensional vector constraint in the database. Store the encrypted embedding as PostgreSQL `BYTEA` and manage dimension, model architecture, and similarity metrics via `face_model_versions`.
- **Business Rationale:** Allows the dairy cooperative to upgrade to newer, more accurate on-device facial recognition models in future years without executing destructive database migrations across millions of historical records.

### DB-ADR-002: Dynamic Quality & Compositional Limits
- **Status:** **APPROVED**
- **Decision:** Move all chemical limits (Cow/Buffalo minimum/maximum Fat% and SNF%) into `center_settings` rather than hardcoding check constraints.
- **Business Rationale:** Indian state dairy cooperatives (e.g. AMUL, Nandini, Mahanand) have differing minimum standards and seasonal monsoon allowances. Hardcoding limits in code or DDL would break multi-state deployments.

### DB-ADR-003: Calendar Month as Initial Billing Default
- **Status:** **RECOMMENDED**
- **Decision:** Set `billing_cycle_type = 'CALENDAR_MONTH'` as the system default while maintaining architectural support for `TEN_DAY` cycles.
- **Business Rationale:** Calendar month billing aligns with bank statement cycles and cooperative accounting books. While 10-day cycles are common in some regional centers, they require explicit director approval before activation.

### DB-ADR-004: Organization-Level Phone Number Uniqueness
- **Status:** **APPROVED**
- **Decision:** Enforce `UNIQUE (organization_id, normalized_mobile_number)` in PostgreSQL.
- **Business Rationale:** Multi-tenant cooperatives in different states must be permitted to register farmers independently without cross-tenant mobile collisions.

### DB-ADR-005: Client-Generated Intake UUID for Idempotency
- **Status:** **APPROVED**
- **Decision:** Generate an RFC4122 v4 `client_intake_uuid` at the collection counter terminal the moment milk intake begins, deriving the idempotency key directly from this value.
- **Business Rationale:** Allows a farmer to deliver Cow milk and Buffalo milk in separate containers during the same morning shift without false duplicate rejections, while completely preventing duplicate financial postings during network retries.

### DB-ADR-006: Accounting Liability Sign Convention
- **Status:** **APPROVED**
- **Decision:** Adopt the standard double-entry liability convention:
  - Milk Collections = **CREDIT** (Increases Dairy's debt to farmer).
  - Cattle Feed / Advances / Payouts = **DEBIT** (Decreases Dairy's debt to farmer).
  - Positive Running Balance = **Net Payable** (Money dairy owes farmer).
  - Negative Running Balance = **Net Receivable** (Money farmer owes dairy).
- **Business Rationale:** Prevents catastrophic ledger miscalculations and aligns directly with formal cooperative accounting audits.

