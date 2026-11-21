# DFarm — Priority 0: Authentication and Tenant Context Check

**Execution Reference:** DFARM-PRIORITY-00-BACKEND-NETWORK-RECOVERY  
**Document:** `06_AUTHENTICATION_AND_TENANT_CONTEXT_CHECK.md`  
**Timestamp:** 2026-11-19T13:33:00+05:30  
**Security & Context Status:** VERIFIED & HARDENED  

---

## 1. Authentication Architecture

DFarm utilizes an HMAC-SHA256 zero-backdoor JWT mechanism with isolated claims per actor type:

```typescript
export interface AuthenticatedUser {
  userId: string;
  organizationId?: string;
  centerId?: string;
  globalCustomerId?: string;
  role: string;
  actorType: 'STAFF' | 'CUSTOMER';
  fullName?: string;
  phoneNumber?: string;
}
```

### Verification Pipeline
1. `authenticate` middleware extracts `Authorization: Bearer <token>` or `x-access-token`.
2. Asserts signature with `config.JWT_SECRET` (at least 32 characters long).
3. Attaches validated claims to `req.user`.
4. Rejects tampered, expired, or malformed tokens with `401 Unauthorized`.

---

## 2. Server-Side Tenant Context Resolution (`tenant-resolver.ts`)

- **Security Enforcement:** Client-supplied headers (`X-Dairy-Id`, `X-Tenant-ID`, query/body params) are **strictly validated against the cryptographic token claims** to prevent Insecure Direct Object References (IDOR).
- **Rule Verification:**
  - If a client provides `X-Dairy-Id: 00000000-0000-0000-0000-000000000001` that conflicts with the user's token `organizationId`, the request is rejected with `403 Forbidden` (`CROSS_TENANT_FORBIDDEN`).
  - The physical database mapping is resolved via `dairy_database_mappings` in the central database.
  - The bounded client `req.tenantDb` is attached for downstream domain isolation.

---

## 3. Test Verification Results

| Actor | Flow | Expected Role | Context Derivation | Result |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | `POST /auth/admin/otp/verify` | `SUPER_ADMIN` | Global Federation Org | **PASSED (200)** |
| **Dairy Admin** | `POST /auth/admin/otp/verify` | `PRIMARY_DAIRY_ADMIN` | Org `00000000-0000-0000-0000-000000000001` | **PASSED (200)** |
| **Collection Operator**| `POST /auth/operator/otp/verify` | `COLLECTION_OPERATOR` | Kiosk Center & Dairy | **PASSED (200)** |
| **Customer** | `POST /auth/verify-otp` | `CUSTOMER` | Multi-Dairy Memberships List | **PASSED (200)** |
