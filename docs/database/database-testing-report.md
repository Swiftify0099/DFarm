# DFarm: Database Testing & Verification Report
**Phase 04 Final Database Verification Gate: Real Supabase PostgreSQL & RLS Security Testing**

---

## 1. Test Suite Overview

- **Test Framework:** Node.js native test runner (`node:test`) and strict assertions (`node:assert/strict`).
- **Database Engine:** Real PostgreSQL 17.11 running via Supabase CLI in Docker (`127.0.0.1:54322/postgres`), plus in-memory fallback suite (`pg-mem`).
- **Test Suites Executed:**
  1. **Static Schema Validation Suite:** `packages/database/tests/schema-validation.test.js` (13 tests)
  2. **In-Memory PostgreSQL Runtime Emulation Suite:** `packages/database/tests/database-runtime.test.js` (9 tests)
  3. **Real PostgreSQL 17 + Supabase RLS Security Suite:** `packages/database/tests/real-postgres-verification.test.js` (20 tests)
- **Execution Script:** `npm test` (monorepo root) / `npm --workspace=@dfarm/database test`
- **Execution Timestamp:** `2026-11-13 14:28:00 IST`
- **Node Runtime:** `v22.20.0` (npm `10.9.3`)
- **Execution Result:** **42 OF 42 TESTS PASSED (100% PASS RATE)**

---

## 2. Test Execution Results Matrix

### Suite A: Static Schema & Migration AST Validation (13 Tests)

| # | Test Case Description | Assertion Verified | Result | Duration |
| :---: | :--- | :--- | :---: | :---: |
| **01** | Migration File Existence | Verifies all 10 migration files (`001` to `010`) exist in `supabase/migrations/` and have non-zero size ($> 200$ bytes). | **PASS** | 9.8 ms |
| **02** | Exact Table Count (43 Tables) | Confirms exactly 43 distinct `CREATE TABLE` definitions across all migrations with zero name collisions. | **PASS** | 10.9 ms |
| **03** | Primary Key Verification | Parses all 43 `CREATE TABLE` statements and asserts that every table declares a UUID `PRIMARY KEY`. | **PASS** | 7.9 ms |
| **04** | Exact Decimal Types | Scans `007`, `008`, and `009` ensuring zero usage of floating-point types (`FLOAT`, `REAL`, `DOUBLE PRECISION`) for monetary amounts and milk composition. | **PASS** | 5.1 ms |
| **05** | Organization-Scoped Mobile Uniqueness | Verifies `uq_customer_mobile_per_org UNIQUE (organization_id, normalized_mobile_number)` in `004_customer_identity.sql`. | **PASS** | 0.9 ms |
| **06** | Organization-Scoped Card UID Uniqueness | Verifies `uq_rfid_card_uid_per_org UNIQUE (organization_id, card_uid)` in `005_face_and_rfid.sql`. | **PASS** | 0.7 ms |
| **07** | Single-Active Card Partial Indexes | Verifies `uq_active_card_assignment` and `uq_active_customer_card` partial unique indexes in `005_face_and_rfid.sql`. | **PASS** | 0.6 ms |
| **08** | Single-Active Face Template Partial Index | Verifies `uq_active_customer_face_template` partial unique index in `005_face_and_rfid.sql`. | **PASS** | 1.0 ms |
| **09** | Idempotency Key Enforcements | Asserts `idempotency_key VARCHAR(128) NOT NULL UNIQUE` on `milk_collections` and `ledger_transactions`. | **PASS** | 1.5 ms |
| **10** | Multi-Delivery Shift Intake Support | Verifies no artificial unique constraint on `(customer_id, date, shift)` exists, permitting multiple legitimate milk deliveries per customer shift. | **PASS** | 1.8 ms |
| **11** | Financial Foreign Key Deletion Restrictions | Asserts `ON DELETE RESTRICT` on core ledger foreign keys (`customer_id`, `organization_id`, `center_id`). | **PASS** | 1.0 ms |
| **12** | Auth Helper Security Hardening | Verifies `SECURITY DEFINER` and safe `SET search_path = pg_catalog` in `001_extensions_and_common.sql` without overriding native Supabase `auth.uid()`. | **PASS** | 0.7 ms |
| **13** | Row Level Security (RLS) Policies | Asserts `ENABLE ROW LEVEL SECURITY` across all 43 tables, checking presence of granular organization, center, and customer policies. | **PASS** | 0.8 ms |

---

### Suite B: In-Memory PostgreSQL Runtime Emulation Tests (9 Tests)

| # | Test Case Description | Database Engine Behavior Verified | Result | Duration |
| :---: | :--- | :--- | :---: | :---: |
| **01** | Full Catalog Creation | Executes complete DDL across migrations 002–010; verifies all 43 tables exist in `information_schema.tables`. | **PASS** | 18.4 ms |
| **02** | Organization & Center Insertion | Inserts parent organization and child center; validates foreign key referential integrity. | **PASS** | 25.4 ms |
| **03** | Organization-Scoped Mobile Uniqueness | Inserting duplicate mobile in same org throws unique violation; inserting same mobile across different orgs succeeds. | **PASS** | 46.5 ms |
| **04** | Single-Active RFID Partial Unique Index | Assigning active card to customer succeeds; duplicate active card assignment to same card or same customer throws unique violation; revoking card allows re-assignment. | **PASS** | 62.8 ms |
| **05** | Single-Active Face Template Partial Index | Inserting active template for model v1 succeeds; second active template throws unique violation; superseded template succeeds. | **PASS** | 37.6 ms |
| **06** | Multi-Delivery Shift & Idempotency | Customer delivers Can 1 and Can 2 in same MORNING shift with distinct intake UUIDs; both succeed; replaying duplicate idempotency key throws unique violation. | **PASS** | 99.4 ms |
| **07** | CHECK Constraints Enforcement | Negative weight ($< 0.00$) and invalid shift types (`AFTERNOON`) throw CHECK constraint violations. | **PASS** | 7.9 ms |
| **08** | Subledger Running Balance & Journal Balancing | Milk credit (+₹596.75) increases balance; advance debit (-₹200.00) decreases balance; journal entries satisfy $\sum \text{Debits} = \sum \text{Credits} = ₹596.75$. | **PASS** | 49.2 ms |
| **09** | Soft-Deletion Integrity | Customer soft-deleted (`is_deleted = TRUE`); existing collections and ledger records remain intact and queryable without data loss. | **PASS** | 26.9 ms |

---

### Suite C: Real PostgreSQL 17 + Supabase RLS Security Verification Suite (20 Tests)

- **Target Connection:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **Catalog Verified:** Real PostgreSQL 17.11 Server running via Docker container `supabase_db_DFarm`

| # | Test Case Description | Real PostgreSQL Engine & RLS Assertion Verified | Result | Duration |
| :---: | :--- | :--- | :---: | :---: |
| **01** | Real Catalog 43 Tables Verification | Queries `information_schema.tables` in real PostgreSQL; confirms all 43 tables exist with correct schema ownership. | **PASS** | 11.8 ms |
| **02** | Multi-Organization Synthetic Seeding | Seeds two independent organizations, centers, and administrative users with UUID primary keys and foreign keys. | **PASS** | 51.9 ms |
| **03** | Organization-Scoped Mobile Uniqueness | Inserting duplicate normalized mobile in Org 1 throws `23505 (uq_customer_mobile_per_org)`; identical mobile in Org 2 succeeds. | **PASS** | 27.3 ms |
| **04** | Single-Active RFID Partial Unique Indexes | Enforces `uq_active_card_assignment` and `uq_active_customer_card`; multiple historical revoked cards allowed, but only one active card per customer and per card UID. | **PASS** | 38.2 ms |
| **05** | Single-Active Face Template Partial Index | Enforces `uq_active_customer_face_template`; allows superseded/archived templates but rejects duplicate active biometric templates per customer and model version. | **PASS** | 26.5 ms |
| **06** | Multi-Delivery per Shift & Idempotency | Inserts 2 legitimate deliveries for same customer in MORNING shift with distinct idempotency keys; replaying identical idempotency key is rejected with `23505`. | **PASS** | 58.2 ms |
| **07** | Exact NUMERIC Arithmetic & Double-Entry | Asserts milk credit (+₹1,047.70) and feed advance debit (-₹300.00); verifies balance and balanced ledger entries ($\sum \text{Dr} = \sum \text{Cr}$). | **PASS** | 35.1 ms |
| **08** | Soft Deletion & Restore Rules | Soft-deletes customer (`is_deleted = TRUE`); verifies child milk collections and ledger entries are preserved; restores customer successfully. | **PASS** | 20.7 ms |
| **09** | Cross-Organization RLS Isolation | Authenticates as Org 1 Owner via `request.jwt.claims`; queries `customers` and `organizations`; sees Org 1 records only; returns ZERO records from Org 2. | **PASS** | 52.5 ms |
| **10** | Customer Self-Service RLS Isolation | Authenticates as Farmer Customer via `request.jwt.claims`; queries profile, milk collections, and ledger; returns ONLY self records; ZERO records of other farmers. | **PASS** | 46.9 ms |
| **11** | Biometric Security RLS Restrictions | Authenticates as Milk Collector / Operator; querying `face_enrollments` returns 0 rows (biometric vector data restricted to Dairy Admin and System). | **PASS** | 44.3 ms |
| **12** | Ledger Immutability (Append-Only) RLS | Authenticates as Milk Collector; attempting `UPDATE` or `DELETE` on `ledger_transactions` affects 0 rows, preserving immutable financial ledger. | **PASS** | 49.1 ms |
| **13** | Center Operator Collection RLS Isolation | Authenticates as Collector at Center 1A; inserting milk collection with `center_id = Center 1B` is blocked by RLS check. | **PASS** | 43.3 ms |
| **14** | Role Escalation Prevention RLS | Authenticates as Center Operator; attempting to update own role to `SUPER_ADMIN` in `users` table affects 0 rows. | **PASS** | 52.0 ms |
| **15** | Unauthenticated (anon) RLS Block | Unauthenticated requests (`SET LOCAL ROLE anon`) attempting to query `customers`, `milk_collections`, or `ledger_transactions` are rejected by table-level permissions and RLS. | **PASS** | 49.3 ms |
| **16** | Cross-Customer Direct ID Leak Prevention | Farmer Customer A querying directly for Customer B by ID on `customers`, `milk_collections`, and `ledger_transactions` returns 0 rows. | **PASS** | 65.3 ms |
| **17** | Customer Financial Modification Prevention | Farmer Customer attempting `INSERT` into `ledger_transactions` or `milk_collections` is rejected with `new row violates row-level security policy`. | **PASS** | 53.4 ms |
| **18** | Customer Face Template Access Block | Farmer Customer querying `face_enrollments` returns 0 rows, preventing customer retrieval of raw biometric vector templates. | **PASS** | 38.5 ms |
| **19** | Unauthorized Customer Restore Block | Center Operator attempting to un-delete a soft-deleted customer affects 0 rows (only Super Admin, Dairy Owner, Center Manager, Supervisor, Registration Officer can modify status). | **PASS** | 55.5 ms |
| **20** | Untrusted Client Claims Protection | Setting forged claims in `user_metadata` yields `NULL` for `public.current_org_id()` and `public.current_user_role()`, resulting in 0 accessible records. | **PASS** | 53.2 ms |

---

## 3. Summary of Overall Test Results

```
================================================================================
DFARM TEST SUITE RUN SUMMARY
================================================================================
Suite A (Static AST & Schema Validation):             13 Passed,  0 Failed
Suite B (In-Memory PostgreSQL Runtime Emulation):      9 Passed,  0 Failed
Suite C (Real PostgreSQL 17 + Supabase RLS Security): 20 Passed,  0 Failed
--------------------------------------------------------------------------------
TOTAL MONOREPO DATABASE TESTS:                         42 Passed,  0 Failed (100%)
================================================================================
```

---

## 4. TypeScript Monorepo Build Verification

- **Command:** `npm run build`
- **Workspaces Compiled:**
  - `@dfarm/shared-types`: Clean build (`tsc` $\rightarrow$ `dist/`)
  - `@dfarm/shared-validation`: Clean build (`tsc` $\rightarrow$ `dist/`)
  - `@dfarm/database`: Clean build (`tsc` $\rightarrow$ `dist/`)
  - `@dfarm/backend`: Clean build (`tsc` $\rightarrow$ `dist/`)
- **Compilation Output:** Exit code `0`, zero type errors, strict null checks enabled across all packages.

---

## 5. Local Supabase & PostgreSQL 17 Stack Status

- **Docker Version:** `Docker version 29.5.2` (running via Docker Desktop)
- **Supabase CLI:** `v3.1.0` (pinned in `package.json` devDependencies)
- **Database Endpoint:** `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- **PostgreSQL Version:** `PostgreSQL 17.11 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`
- **Applied Migrations (10 of 10 applied via `npx supabase db reset`):**
  1. `001_extensions_and_common.sql`
  2. `002_organizations_and_centers.sql`
  3. `003_user_identity_foundation.sql`
  4. `004_customer_identity.sql`
  5. `005_face_and_rfid.sql`
  6. `006_customer_identification_audit.sql`
  7. `007_rate_management.sql`
  8. `008_collection_sessions_and_transactions.sql`
  9. `009_customer_ledger.sql`
  10. `010_devices_sync_and_audit.sql`
- **PostgreSQL Catalog Metrics:**
  - **Business Tables:** Exactly 43 business tables created in `public` schema.
  - **RLS Enabled:** 43 of 43 tables (100%).
  - **RLS Security Policies:** 84 policies actively protecting multi-tenant, operator, customer, and biometric boundaries.
  - **Primary Keys:** 43 (every table has a UUID primary key).
  - **Foreign Keys:** 90 foreign key constraints enforcing referential integrity.
  - **Unique Indexes:** 72 unique indexes.
  - **Partial Unique Indexes:** 4 active invariant partial indexes.
  - **CHECK Constraints:** 416 domain check constraints.
  - **Triggers:** 8 active system triggers.
