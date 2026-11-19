# 10 - Database Migration Track & Tenant Isolation

**Execution Reference:** `DFARM-DAIRY-REGISTRY-ADMIN-LOGIN-RECOVERY`  
**Database Infrastructure:** `packages/database` & `services/backend/src/infrastructure/database`

---

## 1. Migration Tracks

DFarm maintains two distinct database migration tracks:
1. **Control Plane Migrations (Central Database `dfarm_central`):**
   - Track numbers `028` through `037`.
   - Manages platform organizations, global customer identities, cross-dairy memberships, super admin audit trails, and physical tenant database mappings.
2. **Operational Tenant Migrations (Tenant Database `dfarm_tenant_*`):**
   - Track numbers `001` through `027`.
   - Manages local milk collection sessions, IoT fat/SNF quality readings, milk rate charts, customer ledgers, feed inventory, and local billing.

---

## 2. Cross-Tenant Isolation Enforcement

1. **Physical Connection Pooling:**
   `TenantDatabaseManager` maintains dedicated connection pools (`pg.Pool`) per dairy tenant UUID. A query intended for "Warna Milk's" executes solely against `dfarm_tenant_df_san_6632_*`.
2. **Zero Shared Tables:**
   Customer ledger entries, milk collection intake tickets, and hardware serial pairings are strictly stored in the physical tenant database.
3. **Tenant Resolver Middleware (`tenant-resolver.ts`):**
   Requests directed to `/api/v1/collection`, `/api/v1/rate-charts`, or `/api/v1/bills` extract the authenticated user's `organizationId` from the JWT token and route to the corresponding tenant pool. Cross-tenant access is rejected with `403 Forbidden`.
