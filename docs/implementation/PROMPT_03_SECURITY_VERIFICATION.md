# DFARM — PROMPT 03 SECURITY VERIFICATION
## TENANT ISOLATION, ACCESS CONTROL, CRYPTOGRAPHY & AUDIT TRAIL VERIFICATION

**Document Reference:** `DFARM-SECURITY-PROMPT-03`  
**Execution Phase:** Prompt 03  
**Status:** FULLY COMPLIANT  
**Target Environment:** `services/backend`, `apps/dfarm-dairy-admin`, Database Layer  

---

## 1. CROSS-DAIRY TENANT ISOLATION VERIFICATION

DFarm enforces strict physical multi-database isolation:
- Central control plane: `dfarm_central` (organizations, database mappings, Super Admin features).
- Tenant operational databases: `dfarm_tenant_<code_hash>` (customers, shifts, transactions, rate charts, ledgers, devices).

### 1.1 Tenant Context Resolution Invariants
1. **Authenticated Context Precedence**: In all operational routes, `req.user.organizationId` takes absolute precedence over client-supplied query parameters or headers.
2. **Cross-Dairy Query Defense**: If a client supplies `organizationId` in query/body that differs from `req.user.organizationId`, the request is immediately rejected with `403 Forbidden` (`Cross-dairy query blocked: authenticated user does not have permission for organization`).
3. **Tenant Header Spoofing Defense**: If `x-dairy-tenant-id` header conflicts with `organizationId` query parameter, `403 Forbidden` is triggered immediately.
4. **Isolated Database Client Binding**: Repositories invoke `tenantDbManager.getTenantDb(organizationId)`. The returned client points strictly to that dairy's isolated PostgreSQL pool or test instance.
5. **No Cross-Tenant Data Leakage**: Even if a malicious actor acquires a valid token for Dairy A, they cannot read or write records in Dairy B's database because the pool connection string points solely to Dairy A's database.

---

## 2. ROLE-BASED ACCESS CONTROL (RBAC)

DFarm Dairy Admin operations enforce explicit role boundaries:

| User Role | Permitted Actions | Prohibited Actions |
|---|---|---|
| `PRIMARY_DAIRY_ADMIN` / `DAIRY_ADMIN` | Approve/Reject farmers, create rate charts, open/close shifts, manage feed inventory, view financial ledgers, issue batch payments | Access Super Admin platform routes, access other dairies' data |
| `COLLECTION_OPERATOR` | Open/close center shift sessions, post milk intake weighments, query center rate charts | Approve/reject farmers, edit rate chart matrices, issue payout disbursements |
| `FARMER_CUSTOMER` | Query own ledger, passbook, bills, registration status | Access any administrative, collection, or other customer data |
| `SUPER_ADMIN` | Platform metrics, tenant provisioning, hardware allocation, AMC management | Direct operational milk intake (must operate via diagnostic support session) |

---

## 3. DATA ENCRYPTION & SECRECY AT REST

### 3.1 Biometric Facial Templates (OpenCV SFace 128-dim INT8)
- **Encryption Algorithm**: AES-256-GCM authenticated encryption.
- **Key Derivation**: Root encryption key `CREDENTIAL_ENCRYPTION_KEY` via `CredentialEncryption`.
- **Integrity Tag**: 16-byte authentication tag prevents tampering.
- **Storage**: Hex-encoded IV, ciphertext, and tag stored in `face_enrollments` / `customers`. Raw embedding vectors are never stored in plaintext.

### 3.2 Bank Beneficiary Account Details
- **Sensitive Fields**: `account_number`, `ifsc_code`, `account_holder_name`.
- **Encryption Algorithm**: AES-256-GCM.
- **Masking on Read**: When returned via API, account numbers are masked (`XXXX-XXXX-1234`) unless explicitly requested in an authorized bank batch disbursement export.

### 3.3 Tenant Database Connection Strings
- Encrypted using AES-256-GCM in `dfarm_central.dairy_database_mappings.connection_uri_encrypted`.
- Decrypted in memory only when establishing the connection pool in `TenantDatabaseManager`.

---

## 4. AUDIT TRAIL COVERAGE

All administrative and high-value operational actions generate immutable audit log records:
1. **Farmer Approval / Rejection**: Logs admin user ID, customer UUID, timestamp, previous status, new status, and rejection reason (if applicable).
2. **Shift Session Open / Close**: Logs operator ID, center ID, timestamp, initial status, closing totals, and device ID.
3. **Rate Chart Creation / Activation**: Logs admin user ID, version ID, effective dates, and change diff.
4. **Double-Entry Financial Postings**: Every milk intake and disbursement records immutable rows in `customer_ledger_entries` with referencing transaction UUIDs and audit timestamps.
5. **Security Events**: Cross-dairy attempts and failed authentication attempts are logged via Pino structured logger with IP, User-Agent, and Request ID.

---

## 5. HARDENING AGAINST KNOWN ATTACK VECTORS

| Attack Vector | Countermeasure Implemented | Verification Result |
|---|---|---|
| **SQL Injection** | 100% Parameterized queries ($1, $2...) across all services and repositories. | PASSED |
| **Idempotency Replay Attacks** | `idempotency_key` unique constraints on transactions and collections. Replays return cached responses without duplicate side effects. | PASSED |
| **Privilege Escalation** | Strict JWT role checking and middleware route guards (`authenticate`, `requireRole`). | PASSED |
| **Farmer Payout Interception** | Elimination of third-party payment gateways for farmers; strict ledger-backed bank batch payouts. | PASSED |
| **Unapproved Milk Delivery** | `Customer.validateCanDeliver()` checks `status === 'ACTIVE'` and category authorization before processing weighments. | PASSED |
