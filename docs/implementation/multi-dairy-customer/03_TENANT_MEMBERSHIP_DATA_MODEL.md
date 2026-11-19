# 03 — TENANT MEMBERSHIP DATA MODEL

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Systems:** Central Database (`customer_dairy_memberships`), Tenant Databases (`customers`)

---

## 1. Central vs. Tenant Schema Architecture

The membership data model links the central global identity to physical tenant databases through clean foreign keys without cross-database JOINs:

```
+------------------------------------+
|  dfarm_central                     |
|  ----------------                  |
|  global_customer_identities (id)   |
|         |                          |
|         v (1:N)                    |
|  customer_dairy_memberships        |
|    - global_customer_id            |
|    - organization_id (dairy_id)    |
|    - tenant_customer_id  --------+ |
|    - membership_status           | |
|    - farmer_code                 | |
+----------------------------------|-+
                                   |
                                   | (Routes via TenantDatabaseManager)
                                   v
             +---------------------------------------------+
             | dfarm_tenant_<code_hash>                    |
             | -----------------------                     |
             | customers                                   |
             |   - id (UUID PK = tenant_customer_id)       |
             |   - organization_id                         |
             |   - primary_center_id                       |
             |   - global_customer_id (FK to Central UUID) |
             |   - farmer_code                             |
             |   - full_name                               |
             |   - normalized_mobile_number                |
             |   - registration_status                     |
             |   - status                                  |
             +---------------------------------------------+
```

---

## 2. Central Multi-Dairy Routing Index Schema

```sql
CREATE TABLE IF NOT EXISTS customer_dairy_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    global_customer_id UUID NOT NULL REFERENCES global_customer_identities(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    tenant_customer_id UUID NOT NULL,
    farmer_code VARCHAR(30),
    membership_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL',
    dairy_name VARCHAR(150),
    dairy_code VARCHAR(30),
    dairy_address TEXT,
    center_id UUID,
    center_name VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_synchronized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_customer_dairy_membership UNIQUE (organization_id, global_customer_id),
    CONSTRAINT chk_customer_membership_status CHECK (membership_status IN (
        'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED', 'UNREGISTERED'
    ))
);

CREATE INDEX IF NOT EXISTS idx_memberships_global_cust ON customer_dairy_memberships(global_customer_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org_status ON customer_dairy_memberships(organization_id, membership_status);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_cust ON customer_dairy_memberships(organization_id, tenant_customer_id);
```

---

## 3. Tenant Database Extensions (`customers`)

```sql
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS global_customer_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_global_identity_per_org
ON customers (organization_id, global_customer_id)
WHERE global_customer_id IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_customers_global_id
ON customers(global_customer_id)
WHERE global_customer_id IS NOT NULL;
```

---

## 4. Key Integrity Guarantees

1. `uq_customer_dairy_membership` prevents the same human identity (`global_customer_id`) from registering more than once with a given cooperative (`organization_id`).
2. `uq_customer_global_identity_per_org` guarantees tenant-level deduplication directly in the operational database.
3. Central lookup provides $O(1)$ discovery of all member cooperatives upon OTP login without querying multiple physical databases (eliminating slow, failure-prone scatter-gather queries).
