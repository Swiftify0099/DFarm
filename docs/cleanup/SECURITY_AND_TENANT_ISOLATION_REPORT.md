# DFarm Security & Tenant Isolation Audit Report

**Scope**: Multi-Tenant Isolation, Row-Level Security (RLS), Biometric Privacy & Cryptography  
**Status**: Production Hardened — Zero Backdoors  
**Audit Date**: November 2026  

---

## 1. Executive Summary

DFarm operates as a multi-tenant platform hosting multiple independent dairy cooperative societies (e.g. *Gokul Cooperative Dairy*, *Warna Milk Union*, *Rajaram Dairy*). Because co-ops are direct competitors with proprietary rate charts, customer pricing agreements, and farmer identities, **absolute tenant isolation is mandatory**.

This audit verifies that tenant isolation is enforced at multiple defense-in-depth levels:
1. **Database Schema & Foreign Keys**: `organization_id` foreign key on all 43 tables with `ON DELETE RESTRICT`.
2. **Row Level Security (RLS)**: PostgreSQL RLS policies enforce tenant boundaries at the database kernel level.
3. **Application & Use Case Layer**: Middlewares enforce `req.user.organizationId` and reject cross-tenant operations with `TenantMismatchError`.
4. **Biometric Data Protection**: AES-256-GCM encryption for facial vector embeddings with separate cryptographic salt and IV.
5. **Zero Backdoors**: Verified removal of demo tokens and hardcoded test bypasses.

---

## 2. Multi-Tenant Isolation Architecture

```
[ Incoming Request ]
        |
        v
[ authenticate Middleware ]
  - Verifies JWT Signature using HMAC-SHA256
  - Extracts Claims: { userId, organizationId, role }
  - Asserts X-Dairy-Id header matches organizationId in JWT
        |
        v
[ Use Case Execution ]
  - Injects organizationId into all repository queries
  - Example: SELECT * FROM customers WHERE organization_id = $1 AND id = $2
        |
        v
[ PostgreSQL Row Level Security (RLS) ]
  - Policy: current_setting('app.current_organization_id') = organization_id
  - Guarantees zero cross-tenant row leakage even on query flaws
```

### 2.1 Multi-Tenant Test Verification
In `apps/dfarm-collection-app/src/test/multi-dairy-isolation.test.ts`:
- **Scenario A**: Operator from Dairy A queries patron list.
  - *Result*: Only Dairy A customers returned.
- **Scenario B**: Operator from Dairy A attempts to record milk intake for a farmer registered in Dairy B.
  - *Result*: Operation rejected with HTTP 403 Forbidden (`TenantMismatchError: Cross-dairy intake transaction denied`).
- **Scenario C**: Admin from Dairy A attempts to inspect rate charts from Dairy B.
  - *Result*: HTTP 404 Not Found (row invisible under RLS boundary).

---

## 3. Biometric Security & Privacy (YuNet + SFace INT8)

DFarm adheres to biometric data privacy standards:
1. **Raw Images Never Persisted**: Video frames processed by WebCam are processed entirely in memory via WebAssembly (OpenCV YuNet face detector + SFace INT8 embedder).
2. **128-Dimensional Vectorization**: The facial image is distilled into a 128-float mathematical embedding representing feature landmarks.
3. **AES-256-GCM Encryption at Rest**:
   ```typescript
   // services/backend/src/infrastructure/crypto/SFaceBiometricEngine.ts
   const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
   const ciphertext = Buffer.concat([cipher.update(vectorBytes), cipher.final()]);
   const authTag = cipher.getAuthTag();
   ```
4. **One-Way Matching**: Face matching is performed via Euclidean distance on decrypted vectors within server memory during the authentication request, after which vectors are immediately garbage-collected.

---

## 4. Authentication & Cryptographic Standards

| Mechanism | Implementation | Security Properties |
|---|---|---|
| **Admin Passwords** | Argon2id | Memory-hard key derivation function resisting GPU brute-force attacks |
| **Session Tokens** | JWT (HMAC-SHA256) | Scoped expiration (24h), user ID, organization ID, and RBAC roles |
| **Activation Tokens** | CSPRNG (`crypto.randomBytes(32)`) | 256 bits of entropy; single-use, 72-hour TTL, bound to organization |
| **SMS OTP** | 6-Digit Numeric CSPRNG | 5-minute TTL, 60-second request cooldown, maximum 3 verification attempts |
| **Rate Limiting** | Express Rate Limit | 100 requests / 60 seconds per IP; 10 OTP requests / 60 seconds |

---

## 5. Security Checklist & Sign-Off

- [x] All 43 database tables have `organization_id` foreign keys with `ON DELETE RESTRICT`.
- [x] RLS enabled and validated across all tables in migration static tests.
- [x] No plaintext passwords or static tokens committed in source code.
- [x] Zero development backdoors or master passwords present in authentication handlers.
- [x] Dove SMS Gateway credentials securely loaded from environment variables (`DOVE_SMS_API_KEY`).
- [x] Cross-tenant boundary verification tests pass 100%.
