# DFarm Existing Data Recovery & Migration Safety Strategy

**Scope:** Historical Record Preservation, Tenant Ownership Resolution, and Quarantine  

---

## 1. Zero Data Loss Mandate

When repairing the Collection App and establishing multi-dairy tenant boundaries, no existing database tables were dropped, truncated, or recreated.

### Core Principles Enforced:
1. **Never Drop Existing Tables:** Historical milk intakes, ledger balances, and patron registrations represent real financial and legal transactions.
2. **Never Guess Ownership:** If an unassigned or legacy record lacks a valid `organization_id`, it is never arbitrarily linked to a default dairy. It is placed into a quarantine partition for Dairy Admin manual audit.
3. **Additive Relational Migrations:** Any schema adjustments are purely non-destructive additions (`ADD COLUMN IF NOT EXISTS`, conditional foreign keys, and indexes).

---

## 2. In-Memory Resilient Database Fallback (`pg-mem`)

For workstations, local development, and CI environments where Docker Desktop or external PostgreSQL instances may be temporarily offline:
- `PostgresDatabase` in `PostgresPool.ts` includes an automatic `pg-mem` fallback.
- When `ECONNREFUSED` is encountered on port 5432, it seamlessly initializes an in-memory PostgreSQL engine, runs all 27 DDL migration files in order, and seeds clean multi-tenant test records:
  - **Dairy A:** Gokul Primary (`00000000-0000-0000-0000-000000000001`) with active patrons (C-101 Patil, C-102 Shinde) and real encrypted SFace 128-D templates.
  - **Dairy B:** Warna Sahakari (`00000000-0000-0000-0000-000000000004`) with isolated patrons (W-201 Jadhav, W-202 Kadam).
- When a live PostgreSQL instance is connected, it switches automatically to the persistent network database.
