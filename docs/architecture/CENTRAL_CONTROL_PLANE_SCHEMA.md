# DFarm — Central Control Plane Schema (`dfarm_central`)

**Document ID:** DFARM-ARCH-002  
**Version:** 1.0.0  
**Phase:** Prompt 01 Baseline Implementation  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION

---

## 1. Role and Boundaries of the Control Plane

The central control-plane database (`dfarm_central`) provides platform governance, tenant discovery, routing coordinates, global Super Admin operations, and auditability.

**Mandatory Isolation Boundary:**
- Operational dairy transactions (milk intake, daily fat/SNF logs, shift sessions, farmer ledger accounts, payroll) **MUST NEVER** be stored in `dfarm_central`.
- Tenant operational data belongs strictly within the tenant's dedicated database (`dfarm_tenant_<code_hash>`).

---

## 2. Core Tables and Schema Definitions

### 2.1 `organizations` (Dairy Tenants Registry)
Tracks registered dairy businesses across the platform.

```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE', -- 'PENDING', 'ACTIVE', 'SUSPENDED', 'EXPIRED'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.2 `dairy_database_mappings` (Authoritative Tenant Database Routing)
Maps each organization to its dedicated physical database and encrypted credentials.

```sql
CREATE TABLE dairy_database_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dairy_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE RESTRICT,
    dairy_code VARCHAR(30) NOT NULL,
    database_name VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'PHYSICAL_DATABASE',
    connection_uri_encrypted TEXT,
    schema_version VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
    provisioning_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    -- Values: 'PENDING', 'PROVISIONING', 'DATABASE_CREATED', 'MIGRATING', 'VERIFYING', 'ACTIVE', 'FAILED'
    provisioning_error TEXT,
    provisioned_at TIMESTAMPTZ,
    last_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dairy_db_mappings_dairy_id ON dairy_database_mappings(dairy_id);
```

### 2.3 `customer_tenant_lookup` (Cross-Tenant Routing Registry)
Permits fast, single-ID customer registration status lookups (`GET /api/v1/customers/:id/status`) without prohibited scatter-gather queries across tenant databases.

```sql
CREATE TABLE customer_tenant_lookup (
    customer_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_tenant_lookup_org ON customer_tenant_lookup(organization_id);
```

### 2.4 `dairy_locations` (Authoritative Coordinates & Premises)
Stores verified geographic coordinates, draggable pin points, and premises addresses for Dairies.

```sql
CREATE TABLE dairy_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    latitude NUMERIC(10, 8) NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
    longitude NUMERIC(11, 8) NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
    premises_address TEXT NOT NULL,
    district VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.5 `dairy_admin_activation_tokens` (Secure Activation & Verification)
Tracks email verification links and mobile OTP tokens for Dairy Primary Admins.

```sql
CREATE TABLE dairy_admin_activation_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    admin_email VARCHAR(255) NOT NULL,
    admin_mobile VARCHAR(20) NOT NULL,
    email_token_hash VARCHAR(128) NOT NULL UNIQUE,
    mobile_otp_hash VARCHAR(128) NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    mobile_verified BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_at TIMESTAMPTZ
);
```

### 2.6 `schema_migrations` (Control Plane Migration Journal)
Tracks applied migrations with cryptographic SHA-256 checksums.

```sql
CREATE TABLE schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    execution_time_ms INTEGER NOT NULL
);
```
