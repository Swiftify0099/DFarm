# 15 — SECURITY AND TENANT ISOLATION VERIFICATION

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Security Boundary:** Multi-Tenant Database Architecture & Session Management

---

## 1. Security Threat Model

The multi-dairy architecture defends against five primary threat vectors:

| Threat Vector | Mechanism | Architectural Defense |
|---|---|---|
| **Identity Hijacking** | Malicious user attempts to register someone else's phone number | Cryptographic 6-digit OTP verified via Dove SMS Gateway. Real SMS delivery. |
| **Session Spoofing** | Attacker tampers with `organizationId` header to read another dairy's ledger | `authenticate` middleware derives `organizationId` from HMAC-SHA256 JWT claims signed by server secret. Headers are ignored for customer endpoints. |
| **Cross-Tenant Leakage** | Customer switches dairy; cached milk collection data is viewed | In-app React Query cache is completely flushed (`queryClient.clear()`) on dairy switch. Client connection pool is physically routed to target tenant DB. |
| **Database Colocation Bypass** | Direct SQL query injection attempting to cross database boundaries | Physical database per tenant (`dfarm_tenant_<code_hash>`). Cross-database queries are physically prevented by PostgreSQL cluster boundary. |
| **Biometric Compromise** | Central breach compromising farmer biometric templates | Biometric embeddings are encrypted with AES-256-GCM and stored strictly inside the tenant database. Control plane contains zero biometric data. |

---

## 2. Cryptographic JWT Token Claims

Upon dairy selection or switching, the issued token contains:
```json
{
  "userId": "c0000000-0000-0000-0000-000000000001",
  "globalCustomerId": "a0000000-0000-0000-0000-000000000001",
  "organizationId": "00000000-0000-0000-0000-000000000010",
  "role": "FARMER_CUSTOMER",
  "actorType": "CUSTOMER",
  "fullName": "Balasaheb Patil",
  "phoneNumber": "+919876543210",
  "iat": 1731952400,
  "exp": 1732038800
}
```

The signature is computed via `HMAC-SHA256` using the high-entropy environment secret. Any modification to `organizationId` invalidates the signature and yields immediate `401 Unauthorized`.
