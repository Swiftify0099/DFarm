# DFARM — CUSTOMER FACE BIOMETRIC UPDATE 404 & TEST FACE NETWORK ERROR
## 07. TENANT AND DATABASE VERIFICATION REPORT

**Execution Reference:** `DFARM-CUSTOMER-FACE-API-404-NETWORK-FIX`  
**Execution Timestamp:** 2026-11-20  

---

### 1. Multi-Tenant Physical Isolation Architecture

In strict adherence to DFARM's core architectural tenets, no tenant shares physical tables or biometric template storage with another tenant:

```
┌────────────────────────────────────────────────────────┐
│             dfarm_central (Control Plane)              │
│  - organizations (dairies, codes, hashes)              │
│  - tenant_databases (connection strings, status)       │
│  - users (primary dairy admins, central accounts)      │
│  - global_customers (phone, identity mapping)          │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│ dfarm_tenant_<hashA>    │ │ dfarm_tenant_<hashB>    │
│ (Sahyadri Cooperative)  │ │ (Krishna Valley Dairy)  │
│                         │ │                         │
│ - customers             │ │ - customers             │
│ - face_enrollments (ENC)│ │ - face_enrollments (ENC)│
│ - kiosk_shift_sessions  │ │ - kiosk_shift_sessions  │
│ - milk_transactions     │ │ - milk_transactions     │
│ - ledger_accounts       │ │ - ledger_accounts       │
│ - ledger_entries        │ │ - ledger_entries        │
└─────────────────────────┘ └─────────────────────────┘
```

---

### 2. Tenant Database Routing Verification

When a request arrives at the backend:
1. `TenantDatabaseManager.getTenantDb(dairyId)` resolves the organization ID from the request header (`X-Dairy-Tenant-Id`, `X-Organization-Id`, `X-Dairy-Id`) or authenticated JWT claims.
2. The connection pool dynamically checks out a client scoped to `dfarm_tenant_<hash>`.
3. Biometric templates, customer records, and ledger entries are written exclusively to that physical database.

---

### 3. Verification Test Evidence

The automated test suite `services/backend/tests/customer-face-api-404-network-fix.test.js` verified cross-tenant isolation:

#### 3.1 Template Isolation (Test 19 & 20)
- Enrolled Customer A in Dairy A (`a1111111-4444-1111-1111-111111111111`).
- Executed direct query on Dairy B's physical database:
  ```sql
  SELECT * FROM face_enrollments WHERE customer_id = '<customerA_id>';
  ```
  **Result:** `0 rows returned`. Zero template leakage into Dairy B.

#### 3.2 Cross-Tenant Face Match Isolation (Test 20)
- Submitted Customer A's face embedding to Dairy B's matching endpoint (`X-Organization-Id: b2222222-4444-2222-2222-222222222222`).
- **Result:** `matched: false, matchResult: "UNKNOWN_PERSON"`. Customer A's biometric identity does not exist in Dairy B.

#### 3.3 AES-256-GCM + AAD Encryption in Tenant DB (Test 27)
- Inspected the physical row in Dairy A's `face_enrollments` table:
  - `embedding_encrypted`: Non-null binary/hex cipher buffer.
  - `embedding_iv`: 12-byte initialization vector.
  - `embedding_auth_tag`: 16-byte authentication tag.
  - `model_version_id`: `sface_int8_2021dec`.
- Confirmed that raw vector floats are never stored in plaintext.

#### 3.4 Relational Integrity & Self-Healing
- Shift session opening, milk collection recording, and double-entry ledger posting automatically verify and self-heal relational dependencies (organization records, centers, operator staff users) inside the isolated tenant database before committing transactional rows.
