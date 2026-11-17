# DFARM — MULTI-DATABASE SECURITY & BIOMETRIC DATA PROTECTION REPORT

**Authoritative Security Architecture & Audit Report**  
**Evaluation Scope**: Tenant Isolation, Database Provisioning Security, Biometric Envelope Protection, Cryptographic Key Management, API Authorization Boundaries  
**Compliance Baseline**: Indian Digital Personal Data Protection Act (DPDPA 2023) & ISO/IEC 27001 / OWASP Top 10 API Security

---

## 1. Executive Summary

DFarm enforces strict multi-database isolation across all milk collection cooperatives. Unlike vulnerable multi-tenant designs that rely on a shared database with soft `WHERE organization_id = ...` filters, DFarm assigns **physically or logically discrete PostgreSQL database instances** to each cooperative.

This architecture ensures:
1. Complete isolation of financial balances, milk collection transactions, and farmer directories.
2. Independent backup, encryption-at-rest keys, and retention schedules per dairy.
3. Cryptographic protection of facial biometric templates preventing credential transplant or misuse across cooperatives.
4. Total elimination of backdoors, hardcoded development tokens, or mock fallback credentials.

---

## 2. Multi-Database Isolation Architecture

```
                       [Central Platform Control Plane]
                       Database: dfarm_platform_control
                       Tables:
                         - organizations (Registry)
                         - dairy_database_mappings (Encrypted DSN references)
                         - users (Global identities)
                         - platform_audit_logs
                                      │
         ┌────────────────────────────┴────────────────────────────┐
         ▼                                                         ▼
[Tenant DB: Gokul Cooperative]            [Tenant DB: Warna Cooperative]
Database: dfarm_tenant_gokul_01_...       Database: dfarm_tenant_warna_01_...
Tables:                                   Tables:
  - customers                               - customers
  - face_enrollments                        - face_enrollments
  - kiosk_shift_sessions                    - kiosk_shift_sessions
  - collection_transactions                 - collection_transactions
  - customer_ledger_accounts                - customer_ledger_accounts
  - ledger_transactions                     - ledger_transactions
  - rate_charts                             - rate_charts
```

### Security Controls:
1. **Server-Side Tenant Routing (`TenantDatabaseManager`)**:
   - Connection credentials and database URIs reside strictly in protected environment secrets.
   - Neither the Customer App, Dairy Admin browser, nor Collection Kiosk browser ever receives tenant database credentials.
   - When an API request arrives, the server extracts the tenant identifier from the cryptographically verified JWT claim.
2. **Denial of Cross-Tenant Forgery**:
   - If an authenticated Dairy Admin from Dairy A injects `X-Dairy-Id: Dairy-B`, the middleware cross-checks the header against the verified JWT payload:
     ```typescript
     if (user.role !== 'SUPER_ADMIN' && user.dairyId !== requestedDairyId) {
       throw new ForbiddenError('Tenant context mismatch: cross-tenant access denied');
     }
     ```
   - Cross-tenant tampering fails with `403 Forbidden`.

---

## 3. Biometric Security & Envelope Protection

Facial biometric templates represent sensitive personal data under DPDPA 2023. DFarm enforces defense-in-depth across the biometric lifecycle:

### A. Zero Raw Image Persistence
- Raw facial camera frames are ingested strictly into temporary volatile memory (RAM).
- Frames are aligned (112x112) and passed to the INT8 ONNX execution engine.
- Upon 128-D vector extraction, the raw frame buffer is immediately zeroized and released for garbage collection.
- No JPEG, PNG, or raw pixel data is written to disk, cache, or cloud storage.

### B. AES-256-GCM Envelope with Authenticated Additional Data (AAD)
- Each 128-D Float32 vector (512 raw bytes) is encrypted using **AES-256-GCM**.
- A cryptographically random 12-byte Initialization Vector (IV) is generated per enrollment (`crypto.randomBytes(12)`).
- **AAD Binding**:
  $$\text{AAD} = \text{customerId} \,\|\, \text{modelVersionId}$$
- **Impact of AAD Binding**:
  - The ciphertext cannot be detached and mapped to another customer identity.
  - If an attacker tampers with the database to point Farmer A's face ciphertext to Farmer B's customer ID, the GCM authentication tag verification fails immediately with `Error: Unsupported state or unable to authenticate data`.

### C. Isolated Kiosk Gallery Sync
- When a Collection Kiosk synchronizes templates for edge recognition, the query is parameterized strictly to its own tenant database.
- Automated tests in Phase 5 demonstrated that querying Dairy B's kiosk sync endpoint yielded **zero templates** from Dairy A, confirming zero biometric leakage.

---

## 4. Financial & Double-Entry Ledger Security

To prevent financial fraud, balance tampering, or double-counting:

1. **Immutable Double-Entry Ledger**:
   - `ledger_transactions` rows are append-only. No `UPDATE` or `DELETE` statements exist in the repository.
   - Every transaction requires balanced debits and credits.
2. **Database-Level Idempotency Constraints**:
   - Milk collection intake enforces a unique constraint on `idempotency_key` in `collection_transactions`.
   - Repeated HTTP requests (caused by intermittent mobile connectivity in rural areas) return the existing transaction record without duplicate balance accruals.
3. **Atomic Unit-of-Work Execution**:
   - Transaction insertion, session accumulator updates, and ledger balance adjustments execute within a single PostgreSQL transaction (`BEGIN ... COMMIT`).
   - If network drops or database errors occur mid-operation, the entire transaction rolls back cleanly.

---

## 5. Security Audit Checklist

| Security Control | Verification Standard | Implementation Status | Evidence / Audit Result |
| :--- | :--- | :--- | :--- |
| **Multi-Tenant Separation** | No shared tables for tenant business data | **ENFORCED** | Discrete databases provisioned per dairy; verified in automated tests. |
| **Tenant Forgery Defense** | JWT claim cross-check with request context | **ENFORCED** | Mismatches rejected with `403 Forbidden`. |
| **Biometric Encryption** | AES-256-GCM with customer AAD binding | **ENFORCED** | Enrolled vectors stored with 12-byte IV and 16-byte tag. |
| **Raw Biometric Images** | No facial image files written to storage | **ENFORCED** | 0 image files stored; verified in filesystem audit. |
| **Financial Immutability** | Append-only double-entry ledger | **ENFORCED** | No `UPDATE` or `DELETE` methods in `PostgresLedgerRepository`. |
| **Intake Idempotency** | Protection against network retries | **ENFORCED** | Replay tests confirm zero balance doubling. |
| **Hardcoded Secrets** | Zero static tokens or backdoors | **ENFORCED** | Verified via static analysis and automated clean architecture tests. |
