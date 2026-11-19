# DFARM — DATA SECURITY AND PRIVACY AUDIT
## ENCRYPTION AT REST, PII MASKING, RBAC & TENANT ISOLATION BOUNDARIES

**Audit Reference:** `DFARM-AUDIT-SECURITY-001`  
**Date:** 2026-11-18  

---

### 1. Sensitive Data Identification & Cryptographic Controls

| Data Class | Table / Column | Storage Representation | Cryptographic Mechanism | Masking in UI / API |
|---|---|---|---|---|
| **Farmer Bank Account** | `customers.bank_account_number_encrypted` | Ciphertext (hex) | AES-256-GCM | Masked to last 4 digits (`••••••••1234`) |
| **Tenant DB Credentials**| `dairy_database_mappings.connection_uri_encrypted`| Ciphertext (hex) | AES-256-GCM | Never returned in client APIs |
| **Farmer Biometric Embedding**| `face_enrollments.embedding_encrypted` | Ciphertext (hex) | AES-256-GCM (Zero Raw JPEGs) | Never exposed; local Euclidean comparison |
| **User Password / PIN** | `users.password_hash` | Salted Hash | Bcrypt (12 rounds) | Write-only |
| **Support Session Token**| `support_diagnostic_sessions.session_token_hash` | SHA-256 Hash | SHA-256 Digest | Raw token returned once at creation |

---

### 2. Tenant Isolation & IDOR Prevention

- **Server-Side Enforcement:** `tenant-resolver.ts` extracts `req.user.organizationId` from verified JWT tokens.
- **Route / Body Parameter Parity:** If a client provides a route parameter (`organizationId` or `dairyId`) or body parameter that does not equal `req.user.organizationId`, the server immediately throws `403 Forbidden` (`CROSS_TENANT_FORBIDDEN`).
- **Zero Razorpay in Farmer Paths:** Razorpay is restricted to AMC SaaS subscriptions. Farmer milk payouts are executed through direct RBI NEFT bank files without consumer gateway interception.
