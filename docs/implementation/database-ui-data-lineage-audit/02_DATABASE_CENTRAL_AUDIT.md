# DFARM — CENTRAL DATABASE AUDIT (`dfarm_central`)
## CONTROL PLANE SCHEMA, DICTIONARY, OBJECT INVENTORY & SECURITY

**Audit Reference:** `DFARM-AUDIT-DB-CENTRAL-001`  
**Target Database:** `dfarm_central` (Control Plane)  
**Schema:** `public`  
**Date:** 2026-11-18  

---

### 1. Central Control Plane Overview

The Central Database (`dfarm_central`) serves as the administrative control plane of the DFarm platform. It maintains authoritative platform master registries and metadata required to route requests to tenant databases.

#### Table Count & Object Metrics
- **Total Tables:** 21 tables
- **Total Indexes:** 35 indexes
- **Total Database Functions:** 5 functions
- **Total Database Triggers:** 4 triggers
- **Views:** 0 (direct parameterized relational queries enforced)

---

### 2. Comprehensive Central Table Dictionary

| Table Name | Primary Key | Defined In Migration | Target Classification | Business Responsibility |
|---|---|---|---|---|
| `organizations` | `id` (UUID) | 002 | SHARED / CONTROL_PLANE | Cooperative Dairy Union master registry |
| `dairy_centers` | `id` (UUID) | 002 | SHARED / CONTROL_PLANE | Chilling & collection centers per Dairy |
| `users` | `id` (UUID) | 003 | SHARED / CONTROL_PLANE | Platform users, Super Admins, Dairy Owners |
| `user_center_assignments` | `id` (UUID) | 003 | SHARED / CONTROL_PLANE | Center-to-operator binding |
| `center_settings` | `id` (UUID) | 002 | SHARED / CONTROL_PLANE | Operational parameters per chilling center |
| `collection_shifts` | `id` (UUID) | 002 | SHARED / CONTROL_PLANE | Standard shift timing definitions (Morning/Evening) |
| `dairy_admin_invitations` | `id` (UUID) | 029 | CONTROL_PLANE | Onboarding invitation tokens for Dairy Admins |
| `dairy_database_mappings` | `id` (UUID) | 031 | CONTROL_PLANE | Authoritative physical database routing table |
| `central_hardware_inventory` | `id` (UUID) | 032 | CONTROL_PLANE | Hardware serial master, scales, analyzers |
| `hardware_assignment_history` | `id` (UUID) | 032 | CONTROL_PLANE | Historical tracking of hardware allocation |
| `amc_plans` | `id` (UUID) | 032 | CONTROL_PLANE | SaaS Annual Maintenance Contract pricing tiers |
| `amc_subscriptions` | `id` (UUID) | 032 | CONTROL_PLANE | Active subscription status and billing periods |
| `platform_alerts` | `id` (UUID) | 032 | CONTROL_PLANE | System security, tampering and operational alerts |
| `platform_audit_logs` | `id` (UUID) | 032 | CONTROL_PLANE | Immutable platform administrator action log |
| `dairy_bank_details` | `id` (UUID) | 032 | CONTROL_PLANE | Cooperative corporate bank account details |
| `otp_rate_limits` | `phone` (VARCHAR) | 033 | CONTROL_PLANE | Distributed atomic OTP cooldown & rate limits |
| `support_diagnostic_sessions`| `id` (UUID) | 033 | CONTROL_PLANE | Time-bounded scoped diagnostic support access |
| `global_rate_policies` | `id` (UUID) | 033 | CONTROL_PLANE | Statutory minimum rate policy definitions |
| `global_rate_policy_versions`| `id` (UUID) | 033 | CONTROL_PLANE | Versioned parameters for rate policies |
| `global_fat_snf_adjustment_policies` | `id` (UUID) | 033 | CONTROL_PLANE | Quality incentive and deduction policies |
| `global_fat_snf_adjustment_policy_versions` | `id` (UUID) | 033 | CONTROL_PLANE | Versioned formula parameters for adjustments |

---

### 3. Detailed Schema Specification of Critical Central Tables

#### 3.1 `dairy_database_mappings` (Authoritative Routing Registry)
```sql
CREATE TABLE IF NOT EXISTS dairy_database_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dairy_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE RESTRICT,
    dairy_code VARCHAR(30) NOT NULL,
    database_name VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'PHYSICAL_DATABASE',
    connection_uri_encrypted TEXT,
    schema_version VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
    provisioning_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    provisioning_error TEXT,
    provisioned_at TIMESTAMPTZ,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dairy_db_mappings_dairy_id ON dairy_database_mappings(dairy_id);
```
- **Data Invariant:** `ON DELETE RESTRICT` guarantees an organization cannot be deleted while a physical database mapping exists.
- **Encryption:** `connection_uri_encrypted` stores the full connection string encrypted with AES-256-GCM.

#### 3.2 `support_diagnostic_sessions` (Controlled Diagnostic Access)
```sql
CREATE TABLE IF NOT EXISTS support_diagnostic_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dairy_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_token_hash VARCHAR(64) NOT NULL,
    justification_reason TEXT NOT NULL,
    support_ticket_ref VARCHAR(100),
    authorized_scope VARCHAR(100) NOT NULL DEFAULT 'READ_ONLY',
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID,
    revocation_reason TEXT,
    created_by UUID,
    created_by_name VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_support_scope CHECK (authorized_scope IN ('READ_ONLY', 'OPERATIONAL_DIAGNOSTIC', 'EMERGENCY_SUPPORT'))
);
```

---

### 4. Central Database Constraints & Security Invariants

1. **Strict Tenant Database Boundary:** `dfarm_central` contains zero customer financial ledger tables (`customer_ledger_accounts`), zero milk intake transaction lines (`milk_collections`), and zero farmer bank account records.
2. **Single-Active Dairy Admin Constraint:** Migration 033 enforces a partial unique index:
   `CREATE UNIQUE INDEX uidx_primary_dairy_admin_active ON users (organization_id) WHERE (role = 'PRIMARY_DAIRY_ADMIN' OR role = 'DAIRY_OWNER') AND status = 'ACTIVE';`
   Preventing conflicting ownership claims over a cooperative dairy.
