# 09 — CUSTOMER TENANT DATA ISOLATION

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Systems:** Database Partitioning, `TenantDatabaseManager`, Token Validation Middleware

---

## 1. Physical Database Isolation Principle

DFarm does **not** rely on logical row-level filtering alone for multi-tenancy. Each dairy cooperative operates on a distinct, physically separated PostgreSQL database.

```
+-------------------------------------------------------------+
|                     PostgreSQL Cluster                      |
|                                                             |
|  +--------------------+             +--------------------+  |
|  | dfarm_tenant_warna |             | dfarm_tenant_krish |  |
|  | (Dairy A Database) |             | (Dairy B Database) |  |
|  |                    |             |                    |  |
|  |  - customers       |             |  - customers       |  |
|  |  - milk_collections|             |  - milk_collections|  |
|  |  - ledger_entries  |             |  - ledger_entries  |  |
|  |  - monthly_bills   |             |  - monthly_bills   |  |
|  +--------------------+             +--------------------+  |
+-------------------------------------------------------------+
```

---

## 2. Token-Driven Tenant Scoping

Every authenticated API request is verified through the HMAC-SHA256 JWT claim:
```json
{
  "userId": "tenant_customer_uuid",
  "globalCustomerId": "central_global_uuid",
  "organizationId": "dairy_tenant_uuid",
  "role": "FARMER_CUSTOMER",
  "actorType": "CUSTOMER"
}
```

When handling operational requests:
1. `req.user.organizationId` is extracted by authentication middleware.
2. The repository resolves the tenant pool via `tenantDbManager.getTenantDb(req.user.organizationId)`.
3. The SQL query runs against the physical database corresponding to that specific organization.
4. **Zero Cross-Talk:** It is physically impossible for a query executed against `dfarm_tenant_warna` to access rows from `dfarm_tenant_krishna`.

---

## 3. Verified Cross-Tenant Attack Scenarios

| Attack Vector | Attempt | Defensive Barrier | Result |
|---|---|---|---|
| Forged Tenant Header | Header `x-dairy-tenant-id` points to Dairy B while token is scoped to Dairy A | Middleware uses cryptographic JWT claims (`req.user.organizationId`), ignoring unauthenticated header overrides for customer endpoints | Blocked (403 Forbidden) |
| Cross-Dairy Record Access | Request `GET /api/v1/bills` with Dairy A token to read Dairy B bills | Query routes to Dairy A tenant DB. Customer ID from Dairy B does not exist in Dairy A database | Empty results / 404 |
| Cross-Dairy Collections Fetch | Request `GET /api/v1/collections/history` | Scoped to Dairy A DB client | Zero leakage |
