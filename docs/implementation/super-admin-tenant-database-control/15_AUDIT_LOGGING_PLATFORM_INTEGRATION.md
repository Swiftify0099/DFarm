# DFARM — Module 11: Audit Logging & Platform Activity Ledger

**Execution Reference:** `DFARM-SUPER-ADMIN-TENANT-DATABASE-CONTROL`  
**Central Table:** `platform_audit_logs` in `dfarm_central`  
**Migration Reference:** `032_central_super_admin_features.sql`  
**Status:** FULLY IMPLEMENTED AND VERIFIED  

---

## 1. Central Immutable Activity Ledger

All operations conducted in the Tenant Database Control Console generate immutable audit entries stored in `dfarm_central.platform_audit_logs`.

### Schema (`032_central_super_admin_features.sql`):
```sql
CREATE TABLE IF NOT EXISTS platform_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    actor_name VARCHAR(150),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 2. Logged Actions & Payloads

1. **`CONTROLLED_RECORD_INSERT`:** Captured when a Super Admin adds a record.
   - `details`: `{ dairyId, reason, before: null, after: <masked_row> }`
2. **`CONTROLLED_RECORD_UPDATE`:** Captured on record modifications.
   - `details`: `{ dairyId, reason, before: <before_state>, after: <after_state> }`
3. **`CONTROLLED_RECORD_DELETE`:** Captured on soft deletion.
   - `details`: `{ dairyId, reason, before: <row_snapshot>, after: { status: 'INACTIVE' } }`
4. **`TENANT_PROVISIONING_INITIATED`:** Captured when physical database creation begins.
5. **`TENANT_PROVISIONING_COMPLETED`:** Captured on migration success.
6. **`TENANT_SCHEMA_VALIDATION`:** Captured on schema compliance checks.

---

## 3. Immutability Guarantee

`platform_audit_logs` cannot be updated or truncated from the Super Admin console or application endpoints. It functions as a permanent audit trail for security audits and compliance certification.
