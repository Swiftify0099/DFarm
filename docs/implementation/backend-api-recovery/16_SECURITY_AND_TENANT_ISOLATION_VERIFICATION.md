# Security and Tenant Isolation Verification

**Execution Reference:** DFARM-MASTER-BACKEND-API-RECOVERY

---

## 1. Tenant Isolation Verification

1. **Database-per-Dairy:** Verified that tenant data is physically written to `dfarm_tenant_<code_hash>` databases with zero shared tables.
2. **Search Path Hardening:** All stored procedures and triggers enforce `SET search_path = pg_catalog` to prevent search-path hijacking.
3. **Biometric Security:** 128-dimensional OpenCV SFace embeddings are encrypted using AES-256-GCM before database insertion. Raw vectors are never stored in plain text.
4. **JWT Security:** Strict HMAC-SHA256 signatures with 32-character secret minimum. Zero bypasses.
