# DFarm — Tenant Context Resolution Architecture

**Document ID:** DFARM-ARCH-006  
**Version:** 1.0.0  
**Phase:** Prompt 01 Baseline Implementation  
**Status:** APPROVED ARCHITECTURAL SPECIFICATION

---

## 1. Principles of Tenant Context Resolution

In a multi-dairy management platform, tenant boundaries must be established authoritatively on the server side:
1. **Zero Trust for Unverified Headers:** Client headers such as `x-tenant-id`, `x-dairy-id`, or query strings cannot be trusted without cryptographic validation.
2. **Cryptographic Identity Derivation:** Dairy identity must be derived from cryptographically signed JWT tokens issued by DFarm's authentication service.
3. **IDOR Rejection:** Any mismatch between the verified tenant identity and request path parameters or body fields must immediately fail with HTTP 403 Forbidden.
4. **Clean Request Attachment:** Once verified, `req.tenantContext` and `req.tenantDb` are attached to the Express request pipeline.

---

## 2. Server-Side Resolver Flow (`requireTenantContext`)

The middleware `requireTenantContext` ([tenant-resolver.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/middleware/tenant-resolver.ts)) enforces the following pipeline:

```
Request Received
       │
       ▼
Is Public Customer Registration Allowed & Requested?
   ├── YES ──► Validate targetDairyId from body ──► Attach Tenant DB Client
   │
   └── NO
       │
       ▼
Extract req.user.organizationId from Verified JWT Token
       │
       ├── MISSING ──► Throw ForbiddenError (403: MISSING_TENANT_MEMBERSHIP)
       │
       └── PRESENT
             │
             ▼
       Check Path Params (:organizationId, :dairyId) & Body (dairyId, organizationId)
             │
             ├── MISMATCH DETECTED? ──► Throw ForbiddenError (403: CROSS_DAIRY_IDOR_BLOCKED)
             │
             └── MATCHES / EMPTY
                   │
                   ▼
             Resolve Mapping from Central Control Plane
                   │
                   ├── NOT ACTIVE? ──► Throw ForbiddenError (403: TENANT_NOT_ACTIVE)
                   │
                   └── ACTIVE
                         │
                         ▼
                   Attach req.tenantContext and req.tenantDb
                         │
                         ▼
                   Call next()
```

---

## 3. Super Admin Cross-Dairy Diagnostic Access

When a platform Super Admin accesses a dairy's data for temporary, authorized diagnostic support:
1. The token role must strictly be `SUPER_ADMIN`.
2. The request must include an explicit `x-diagnostic-reason` and valid support ticket reference.
3. Every operation is recorded in the immutable Super Admin platform audit log in `dfarm_central`.
