# DFarm Security and Tenant Isolation Audit

## 1. Executive Summary

This audit assesses the DFarm multi-tenant platform against security, access control, tenant boundary enforcement, and data privacy criteria. 

The audit identified critical structural vulnerabilities categorized as **P0** (Critical) and **P1** (High):
1. **Fallback Hardcoded JWT Secret**: In `services/backend/src/config.ts` and `services/backend/src/middleware/auth.ts`, `process.env.JWT_SECRET` defaults to `'dev-secret'` / `'dfarm-super-secret-key-change-in-production'`. Any attacker knowing this default can forge Super Admin, Dairy Admin, or Farmer JWT tokens with arbitrary claims.
2. **Missing Backend Tenant Boundary Checks (IDOR)**: Multiple REST routes in `services/backend/src/modules/*` accept a URL parameter `dairyId` or `customerId` without validating that the authenticated caller's JWT token belongs to that dairy or owns that customer resource.
3. **Repository Cross-Tenant Scatter-Gather Queries**: In repository implementations relying on the shared control-plane database, queries frequently omit `dairy_id` in SQL `WHERE` clauses or retrieve all records into Node.js memory before filtering.
4. **Dev-Mode Bypass Headers**: In `services/backend/src/middleware/auth.ts`, if `NODE_ENV !== 'production'`, headers such as `x-dev-user-id`, `x-dev-role`, and `x-dev-dairy-id` bypass cryptographic JWT signature verification and directly populate `req.user`. If `NODE_ENV` is unset or misconfigured in staging/production, complete authentication bypass occurs.
5. **Simulated Role-Based Access Control (RBAC)**: In `apps/dfarm-super-admin` and `apps/dfarm-dairy-admin`, granular permission checks (e.g. `dairies:create`, `support:access`, `billing:approve`) are evaluated only in frontend React components based on static claim arrays. The backend has no fine-grained permission middleware.

---

## 2. Authentication Architecture & Token Security

### 2.1 JWT Secret Handling and Token Signing

| Component | File Path | Line Range | Mechanism | Security Finding | Severity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Auth Config** | `services/backend/src/config.ts` | L18–L25 | `JWT_SECRET = process.env.JWT_SECRET \|\| 'dfarm-dev-secret-key'` | Hardcoded fallback secret allows offline token forgery if env var is missing. | **P0** |
| **Auth Middleware** | `services/backend/src/middleware/auth.ts` | L14–L35 | `jwt.verify(token, process.env.JWT_SECRET \|\| 'dev-secret')` | Divergent fallback string (`'dev-secret'` vs `'dfarm-dev-secret-key'`) causes random auth failures or exploitability. | **P0** |
| **Clean Auth Service** | `services/backend/src/clean/auth/AuthService.ts` | L88–L112 | Signs JWT with 24h expiration, payload `{ userId, role, dairyId }` | Token contains no tenant fingerprint, device hash, or IP binding. Revocation (blocklisting) is not implemented. | **P1** |

### 2.2 Dev-Mode Authentication Bypass Analysis

In `services/backend/src/middleware/auth.ts` (L38–L55):
```typescript
if (process.env.NODE_ENV !== 'production') {
  const devUserId = req.headers['x-dev-user-id'] as string;
  const devRole = req.headers['x-dev-role'] as string;
  const devDairyId = req.headers['x-dev-dairy-id'] as string;
  if (devUserId && devRole) {
    req.user = { id: devUserId, role: devRole, dairyId: devDairyId };
    return next();
  }
}
```

#### Vulnerability Assessment:
- **Risk**: In Docker containers where `NODE_ENV` is inadvertently set to `staging`, `test`, or left unset (defaulting to undefined, which is `!== 'production'`), any external client can inject HTTP request headers:
  ```http
  x-dev-user-id: 00000000-0000-0000-0000-000000000001
  x-dev-role: SUPER_ADMIN
  x-dev-dairy-id: 00000000-0000-0000-0000-000000000001
  ```
- **Consequence**: Complete administrative takeover of all dairies and central platform controls without cryptographic credentials.
- **Remediation**: Remove header-based auth bypass entirely from production binaries. Dev mode must be an explicitly configured, segregated mock server or require a secure ephemeral development secret.

---

## 3. Insecure Direct Object Reference (IDOR) Audit

The platform exposes several API endpoints that take resource identifiers in URL parameters without validating tenant affiliation against `req.user.dairyId`:

### 3.1 Customer Profile & Ledger Exposure

- **Endpoint**: `GET /api/v1/customers/:id`
  - **Controller**: `services/backend/src/modules/customer/customer.controller.ts` (L45–L62)
  - **Issue**: The handler reads `req.params.id` and queries `customerRepository.findById(id)`. It does not verify whether `customer.dairy_id === req.user.dairyId`.
  - **Impact**: Any authenticated Dairy Admin (e.g., Dairy A) can request customer profiles, addresses, bank details, and biometric enrollment status of Dairy B simply by enumerating customer UUIDs.

- **Endpoint**: `GET /api/v1/ledger/farmer/:farmerId`
  - **Controller**: `services/backend/src/modules/ledger/ledger.controller.ts` (L78–L95)
  - **Issue**: Queries financial transactions for `:farmerId` directly from the ledger database without enforcing `req.user.dairyId`.
  - **Impact**: Cross-dairy ledger leakage. Competitor dairies can inspect milk volumes, payouts, and balances of rival dairy farmers.

### 3.2 Milk Collection Record Tampering

- **Endpoint**: `POST /api/v1/collection/record`
  - **Controller**: `services/backend/src/clean/collection/CollectionController.ts` (L110–L145)
  - **Issue**: The payload includes `farmerId`, `shiftId`, `liters`, `fat`, `snf`. While `shiftId` is checked, the controller does not verify that `farmerId` actually belongs to the dairy associated with the logged-in operator.
  - **Impact**: An operator could record fraudulent milk deliveries against arbitrary farmer accounts across the platform.

### 3.3 Dairy Tenant Data Modification

- **Endpoint**: `PUT /api/v1/dairies/:dairyId/rates`
  - **Controller**: `services/backend/src/modules/dairy/dairy.controller.ts` (L140–L175)
  - **Issue**: Route expects `req.params.dairyId`. If an authenticated Dairy Admin from Dairy A changes the URL parameter to Dairy B's UUID, the update succeeds because the controller checks `req.user.role === 'DAIRY_ADMIN'` but omits `req.user.dairyId === req.params.dairyId`.
  - **Impact**: Malicious or accidental modification of competitor milk rate charts.

---

## 4. Multi-Tenant Database Boundary Enforcement

### 4.1 Topology Overview

DFarm is designed around a hybrid isolation architecture:
- **Central Control Plane (`dfarm_central`)**: Manages tenant registrations, super admins, hardware catalogs, global rate policies, and support access logs.
- **Tenant Databases (`dfarm_tenant_<dairy_id>`)**: Each registered dairy has an independent PostgreSQL database housing operational data:
  - Customers (`farmers`)
  - Milk Collections (`milk_collections`, `collection_shifts`)
  - Financial Ledger (`farmer_ledger_accounts`, `farmer_ledger_entries`)
  - Inventory & Feed (`feed_inventory`, `feed_sales`)
  - Device Assignments (`devices`)

### 4.2 In-Memory Fallback Boundary Failure

In `services/backend/src/db/TenantDatabaseManager.ts` (L88–L130):
```typescript
async getTenantDb(dairyId: string): Promise<PoolClient | PgMemInstance> {
  if (this.isInMemoryMode) {
    let tenantMem = this.tenantDbMap.get(dairyId);
    if (!tenantMem) {
      tenantMem = await this.provisionInMemoryTenantDb(dairyId);
      this.tenantDbMap.set(dairyId, tenantMem);
    }
    return tenantMem;
  }
  // PostgreSQL Pool resolution
  return this.getPostgresTenantClient(dairyId);
}
```

#### Vulnerabilities:
1. **Volatile Tenant State**: Since PostgreSQL port 5432 is offline, all tenant connections fall back to `tenantDbMap`. Upon backend restart, all tenant databases are wiped, resetting all tenant boundaries.
2. **Memory Poisoning**: If `dairyId` is supplied as `undefined` or malformed string from a misconfigured controller, `tenantDbMap.get("undefined")` creates a shared garbage tenant instance where multiple distinct unauthenticated requests interact with the same transient tables.
3. **Connection Leak**: `getPostgresTenantClient` creates standalone `new Pool()` instances for each tenant connection without connection pool caps, leading to PostgreSQL client exhaustion under load.

### 4.3 Database-Per-Tenant Connection String Isolation

In production mode:
- The central database stores tenant connection parameters in `central.tenants.db_connection_uri` or encrypted credentials.
- **Current Defect**: In `supabase/migrations/00001_central_control_plane.sql`, `tenants` table has a plaintext column `db_connection_string TEXT`. Storing cleartext database passwords in the central control plane violates basic compliance (PCI-DSS / ISO 27001).
- **Remediation**: Use an encrypted vault (e.g. AWS Secrets Manager, HashiCorp Vault, or encrypted column via pgcrypto with master KMS key) to store tenant database credentials.

---

## 5. Controlled Support Access & Diagnostic Impersonation

### 5.1 Business Requirement

A Super Admin must be able to troubleshoot Dairy Admin issues under strict governance:
- Explicit time-bound session (e.g., 30 minutes, 2 hours).
- Cryptographic consent or pre-approval from Dairy Admin.
- Full immutable audit logging of every read/write action taken during the session.

### 5.2 Current Implementation Flaws

In `apps/dfarm-super-admin/src/api/client.ts` (L120–L145):
```typescript
export async function requestSupportSession(dairyId: string, reason: string): Promise<SupportSession> {
  return mockBackend.requestSupportSession(dairyId, reason);
}
```

1. **Entirely Simulated**: `mockBackend.ts` generates a fake UUID and stores the session in browser `localStorage`.
2. **No Backend Support Token**: The backend has no `SupportAccessController` or support token signing facility.
3. **No Impersonation Claim**: The JWT structure has no `impersonatorId` or `actingAsDairyId` claim. A Super Admin cannot present a scoped impersonation credential to tenant databases.
4. **No Write Guardrails**: In the planned support mode, there is no middleware restricting dangerous actions (e.g., dropping tables, deleting ledger entries, executing payouts).

---

## 6. Biometric Data Privacy & Consent Enforcement

### 6.1 Biometric Pipeline Security

The biometric authentication system relies on:
- **YuNet Face Detector**: Extracts 14-point bounding boxes and facial landmarks.
- **SFace Recognizer**: Produces a 128-dimensional floating point / INT8 normalized vector embedding.

### 6.2 Data Privacy Risks

1. **Raw Vector Exposure**: In `apps/dfarm-customer-app/src/features/registration/BiometricEnrollmentScreen.tsx`, the 128-float embedding is transmitted in the JSON payload:
   ```json
   {
     "biometrics": {
       "faceEmbedding": [0.0451, -0.1293, 0.8841, ...]
     }
   }
   ```
   If stored unencrypted in the tenant database (`farmers.face_embedding`), an exfiltrated database exposes biometric templates of rural farmers.
2. **Explicit Consent Invariant**: Under the Digital Personal Data Protection Act (DPDP Act 2023, India), biometric data collection requires:
   - Specific, informed, unconditional consent notice in local language (Marathi / Hindi / English).
   - Timestamped audit log of consent acceptance.
   - Right to revoke biometric enrollment and delete templates.
   - **Current Code Status**: Consent is a single boolean checkbox (`consentGiven: true`) in frontend state. The backend does not record consent document version, language, IP address, or revocation endpoints.

---

## 7. Role-Based Access Control (RBAC) Inconsistencies

| Role | Intended Boundary | Actual Implementation Reality | Threat Vector |
| :--- | :--- | :--- | :--- |
| `SUPER_ADMIN` | Control-plane only; no operational dairy data access without support token. | Currently hardcoded in `mockBackend.ts`; backend has no separate control plane vs data plane token validation. | Over-privileged platform admins accessing private farmer financial ledgers. |
| `DAIRY_ADMIN` | Full operational control of single assigned dairy. | Scoped by `req.user.dairyId` in some routes, but URL parameters override tenant context in legacy routes. | IDOR / Cross-dairy configuration sabotage. |
| `DAIRY_STAFF` / `OPERATOR` | Collection desk only: start shift, record milk intake, inspect customer profile. | Can call `/api/v1/billing` or rate chart endpoints if token role string is altered or route has no role guard. | Staff members modifying rate charts or altering historical billing periods. |
| `FARMER` | Customer app: view personal daily collections, personal ledger, passbook. | Missing ownership checks on `GET /api/v1/ledger/:id`. | Farmer inspecting neighboring farmers' milk yields and account balances. |

---

## 8. Prioritized Security Recommendations

### P0 (Pre-Production Blocker)
1. **Remove Hardcoded JWT Fallbacks**: Crash server on boot if `JWT_SECRET` is unset or less than 32 cryptographically random bytes.
2. **Eliminate Dev-Mode Header Bypass**: Completely remove `x-dev-*` header evaluation from production builds.
3. **Mandatory Tenant Resolver Middleware**: Implement an automated tenant resolution middleware on all `/api/v1/*` routes:
   - Extracts `dairyId` from authenticated JWT.
   - Rejects any request where `req.params.dairyId` or `req.body.dairyId` disagrees with `req.user.dairyId` (unless role is `SUPER_ADMIN` with active support token).
4. **Encrypt Tenant Connection Strings**: Use AES-256-GCM to store tenant database connection URIs in the central database.

### P1 (High Priority)
1. **Support Session Scoped Tokens**: Implement dual-signature support tokens (`super_admin_id`, `target_dairy_id`, `expires_at`, `read_only: true`).
2. **Biometric DPDP Compliance**: Store biometric consent with legal notice hash, timestamp, and audit trail in `biometric_consent_log`.
3. **Token Revocation (Redis Blocklist)**: Introduce a centralized Redis blocklist or short-lived access tokens (15m) + refresh tokens for instant session invalidation.
