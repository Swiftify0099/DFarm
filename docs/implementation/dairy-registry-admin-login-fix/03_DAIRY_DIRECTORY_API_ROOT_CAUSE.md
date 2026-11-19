# 03 - Dairy Tenant Directory List API Root Cause Analysis & Resolution

**Execution Reference:** `DFARM-DAIRY-REGISTRY-ADMIN-LOGIN-RECOVERY`  
**Target:** `apps/dfarm-super-admin` → `services/backend/src/presentation/routes/dairies.routes.ts`

---

## 1. Full Execution Trace

The Dairy Tenant Directory request follows an 11-step execution pipeline:

```
[React View: DairyListPage.tsx]
       │
       ▼ (1) useQuery: queryKeys.dairies.list({ search, status, state })
[API Client: client.ts -> getDairies()]
       │
       ▼ (2) safeFetch: GET http://localhost:4000/api/v1/dairies?search=Warna&status=all&state=all
[Express HTTP Layer: server.ts]
       │
       ▼ (3) dairies.routes.ts -> router.get('/')
[Database Layer: PostgresPool.ts]
       │
       ▼ (4) SQL Query: SELECT ... FROM organizations o LEFT JOIN users u ...
[Tenant DB Manager: TenantDatabaseManager.ts]
       │
       ▼ (5) Attach provisioningStatus, databaseName, provisioningError
[Response Serializer]
       │
       ▼ (6) HTTP 200 JSON: { success: true, count: N, data: [...] }
[API Client Cache Synchronizer]
       │
       ▼ (7) mockBackend.syncDairiesFromBackend(body.data)
[React State & Table Renderer]
       │
       ▼ (8) ClayTable.tsx renders rows
```

---

## 2. Root Cause Analysis (Why Warna Milk's was Not Displayed)

Three distinct root causes prevented "Warna Milk's" from consistently appearing in the Directory table:

### Cause 1: Backend Ignored Query Parameters (`search`, `status`, `state`)
In `services/backend/src/presentation/routes/dairies.routes.ts`, the list route `router.get('/', ...)` ran a static query without reading `req.query['search']`, `req.query['status']`, or `req.query['state']`.
When the frontend sent filter queries or when client-side logic expected filtered backend datasets, mismatched expectations caused unexpected display discrepancies.

### Cause 2: Restrictive Join on `users` Table
The central SQL query used:
```sql
FROM organizations o
LEFT JOIN users u ON u.organization_id = o.id AND u.user_role = 'DAIRY_ADMIN'
```
In DFarm's PostgreSQL schema:
- The authoritative role column in `users` is `role`, with `user_role` added later for secondary classification.
- Primary dairy administrators often have `role = 'DAIRY_ADMIN'` and `user_role = 'PRIMARY_DAIRY_ADMIN'`.
- The strict clause `u.user_role = 'DAIRY_ADMIN'` caused the join to fail for primary administrators, returning `NULL` for `primary_admin_id`, `primary_admin_name`, and `primary_admin_mobile`.

### Cause 3: Disconnected Storage & Memory Store
When physical PostgreSQL fell back to in-memory mode, or when `safeFetch` encountered transient network timeouts, the frontend fell back to `mockBackend.getDairies()`.
In `mockBackend.ts`, storage defaulted to `INITIAL_DAIRIES` from `seedData.ts`, which contained 7 mock dairies but **never contained "Warna Milk's"**.
Furthermore, on the backend, if an entity existed in `inMemoryDairies`, it was bypassed if the database returned any rows.

---

## 3. Implemented Fixes

1. **Query Parameter Filtering in Backend:**
   Implemented unified filtering supporting `search` (matching name, code, admin, district, state), `status` (case-insensitive `active`, `draft_onboarding`, `suspended`), and `state`.
2. **Inclusive Admin Join:**
   Updated join condition to ANSI-standard multi-role matching:
   ```sql
   LEFT JOIN users u ON u.organization_id = o.id AND (
     u.role IN ('DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN') OR 
     u.user_role IN ('DAIRY_ADMIN', 'PRIMARY_DAIRY_ADMIN')
   )
   ```
3. **Deduplicated Merge of Database and In-Memory Stores:**
   The backend route now merges database records and fail-safe memory records deduplicated by ID and tenant code.
4. **Provisioning Metadata Attachment:**
   Each dairy tenant object in the response now explicitly includes:
   - `databaseName`: Physical tenant database name.
   - `provisioningStatus`: Current state (`ACTIVE`, `PENDING`, `FAILED`).
   - `provisioningError`: Sanitized failure diagnostics if applicable.
5. **Frontend Filter Propagation:**
   `apps/dfarm-super-admin/src/api/client.ts` now passes `state` in addition to `search` and `status` in the request query string.
