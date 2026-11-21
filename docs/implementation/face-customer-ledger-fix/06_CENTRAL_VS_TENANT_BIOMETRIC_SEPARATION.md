# DFARM — CENTRAL VS. TENANT BIOMETRIC SEPARATION AUDIT

**Execution Reference:** `DFARM-FACE-1N-RECOGNITION-CUSTOMER-LEDGER-FIX`  
**Document ID:** `06_CENTRAL_VS_TENANT_BIOMETRIC_SEPARATION`  
**Status:** FULLY COMPLIANT  

---

## 1. Architectural Mandate

In DFARM's multi-tenant architecture:
- **Central Database (`dfarm_central`):** Acts as the platform-level authority for cooperative registry, global authentication identities, hardware allocations, and routing.
- **Physical Tenant Databases (`dfarm_tenant_<code_hash>`):** Each dairy cooperative operates an isolated physical database on the PostgreSQL cluster holding its farmer records, milk collections, accounting ledgers, and biometric templates.

**Core Invariant:**
> *Biometric vector templates must NEVER exist in `dfarm_central`. Biometrics must be stored and evaluated solely within the physical tenant database belonging to the respective dairy.*

---

## 2. Separation Audit Matrix

```
                      +------------------------------------------+
                      |         CENTRAL DB (dfarm_central)       |
                      |  - users (id, phone, role)               |
                      |  - organizations (id, name, code)        |
                      |  - tenant_databases (dairy_id, db_name)  |
                      |                                          |
                      |  ❌ NO face_enrollments table             |
                      |  ❌ NO biometric vector columns           |
                      +------------------------------------------+
                                           │
                                           │ Resolves Tenant Routing
                                           ▼
          +────────────────────────────────┬────────────────────────────────+
          │                                                                 │
          ▼                                                                 ▼
+───────────────────────────────────+             +───────────────────────────────────+
|      TENANT DB: Warna Milk        |             |      TENANT DB: Rajhans Dairy     |
| (dfarm_tenant_df_war_1111_a111...) |             | (dfarm_tenant_df_raj_2222_b222...) |
|                                   |             |                                   |
| - customers (id, global_cust_id)  |             | - customers (id, global_cust_id)  |
| - face_enrollments (AES-256-GCM)  |             | - face_enrollments (AES-256-GCM)  |
| - milk_collections                |             | - milk_collections                |
| - customer_ledger_accounts        |             | - customer_ledger_accounts        |
+───────────────────────────────────+             +───────────────────────────────────+
```

---

## 3. Query Execution & Connection Routing Verification

1. When a client requests `GET /api/v1/identity/face/templates` or `POST /api/v1/identity/face/match`:
   - The middleware verifies the JWT and extracts `req.user.organizationId` (or validates `X-Dairy-Id` with caller authorization).
   - `TenantDatabaseManager.getTenantDb(organizationId)` connects to the physical tenant database:
     `dfarm_tenant_<code_hash>`
   - The query:
     ```sql
     SELECT fe.id, fe.customer_id, fe.encrypted_embedding, fe.embedding_iv, fe.embedding_auth_tag,
            c.farmer_code, c.full_name, c.global_customer_id
     FROM face_enrollments fe
     JOIN customers c ON c.id = fe.customer_id
     WHERE fe.status = 'ACTIVE';
     ```
     is executed strictly on that physical tenant database.
2. An operator belonging to Dairy B (`organizationId: dairyBId`) is physically and logically partitioned from Dairy A's templates.
3. Super Admin and cross-tenant API requests without explicit authorization are rejected with HTTP 403 Forbidden.

---

## 4. Verification Check

Subtest 8 of `face-1n-recognition-customer-ledger-e2e.test.js`:
- Operator of Dairy B attempts to match Dairy A's probe embedding against Dairy B: Returns `UNKNOWN_PERSON` (`isMatch: false`).
- Operator of Dairy B attempts to list Dairy A's templates by appending `organizationId=dairyAId`: Returns HTTP 403 Forbidden.

---
*Signed & Verified by DFARM Architectural Engineering Team*
