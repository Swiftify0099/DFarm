# DFARM PLATFORM: AUTHORITATIVE ROLE-BASED ACCESS CONTROL (RBAC) & PERMISSION MATRIX

**Architecture Document Reference:** `DFARM-ARCH-RBAC-001`  
**Version:** 1.0.0 — Production Specification  
**Applies to:** All DFarm Applications (`dfarm-super-admin`, `dfarm-dairy-admin`, `dfarm-collection-app`, `dfarm-customer-app`, `services/backend`)  
**Security Model:** Default-Deny, Server-Side Cryptographically Bound Authorization  
**Author:** DFarm Security Architecture & Platform Engineering Team  
**Date:** November 17, 2026  

---

## 1. Architectural Principles

1. **Default-Deny Access Control:** All routes and endpoints require explicit authenticated identity and active permission evaluation. If no rule grants access, request is aborted with `401 Unauthorized` or `403 Forbidden`.
2. **Server-Side Verification Invariant:** Frontend guards exist solely for user experience. Authorization is strictly evaluated server-side using claims embedded in verified HMAC-SHA256 JWT tokens.
3. **Tenant Context Boundary:** Client headers (`x-tenant-id`) or request body properties cannot establish or override dairy tenant context. Tenant database routing is derived exclusively from verified JWT membership.
4. **Least-Privilege Platform Roles:** Platform Operators must never inherit full Super Admin powers. Super Admins must not have unrestricted access to tenant-owned biometric vectors, raw bank details, or private subledgers.
5. **Single Active Primary Admin Invariant:** Each dairy organization can have exactly one active `PRIMARY_DAIRY_ADMIN` account.

---

## 2. Standardized Role Definitions

| Role Identifier | Description & Organizational Scope | Target Application Surface |
| :--- | :--- | :--- |
| **`SUPER_ADMIN`** | Central platform governor. Authoritative control over dairy provisioning, central hardware, AMC subscriptions, global policies, and platform alerts. | `apps/dfarm-super-admin` |
| **`PRIMARY_DAIRY_ADMIN`** | Single authorized head of an individual dairy cooperative. Full operational management of assigned dairy, staff, customers, rate charts, and collections. | `apps/dfarm-dairy-admin` |
| **`DAIRY_ADMIN`** | Secondary operational administrator for an assigned dairy. Scoped operational duties without authority to reassign primary ownership. | `apps/dfarm-dairy-admin` |
| **`COLLECTION_OPERATOR`** | Counter kiosk operator at a collection center. Authoritative for shift session management, milk intake weighing, quality testing, and receipts. | `apps/dfarm-collection-app` |
| **`SUPERVISOR`** | Operational inspector and exception verifier. Authorized for manual farmer identification fallback and quality exception overrides. | `apps/dfarm-collection-app` |
| **`FARMER_CUSTOMER`** | Enrolled dairy farmer. Access strictly confined to own profile, digital milk passbook, subledger balance, billing statements, and notifications. | `apps/dfarm-customer-app` |
| **`GUEST_FARMER`** | Restricted pre-registration identity issued upon OTP verification for unmapped numbers. Access strictly limited to GPS discovery and onboarding. | `apps/dfarm-customer-app` |
| **`PLATFORM_OPERATOR`** | Restricted central infrastructure operations engineer. Access limited to monitoring, health metrics, and alerts; strictly denied policy publishing and tenant data. | `apps/dfarm-super-admin` |

---

## 3. Comprehensive Role-Permission Matrix

| Functional Module | Permission Name | `SUPER_ADMIN` | `PLATFORM_OPERATOR` | `PRIMARY_DAIRY_ADMIN` | `DAIRY_ADMIN` | `COLLECTION_OPERATOR` | `SUPERVISOR` | `FARMER_CUSTOMER` | `GUEST_FARMER` |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Central Dairy Registry** | `dairies:read` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `dairies:create` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `dairies:suspend` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `dairies:reactivate` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Dairy Proximity Discovery** | `dairies:discover_nearby` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Platform Accounts** | `admins:read` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `admins:create` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `admins:manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Hardware Master** | `hardware:read` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `hardware:register` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `hardware:assign` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `hardware:status` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **AMC Subscriptions** | `amc:read` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `amc:manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `amc:verify_payment` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Global Rate Policies** | `policies:rate_read` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| | `policies:rate_manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `policies:rate_publish` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Global FAT/SNF Policies** | `policies:fat_snf_read` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| | `policies:fat_snf_manage` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `policies:fat_snf_publish`| ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Platform Monitoring & Alerts** | `system:monitor` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `alerts:read` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `alerts:acknowledge` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `alerts:resolve` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Support Sessions** | `support:request` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `support:revoke` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `support:access_readonly` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Dairy Staff Management** | `dairy:manage_staff` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | `dairy:read_staff` | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Customer Approvals** | `customers:read` | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| | `customers:approve` | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| | `customers:reject` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Farmer Self-Registration** | `customers:self_register` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Kiosk Shift Sessions** | `sessions:open` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| | `sessions:close` | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| | `sessions:active` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| | `sessions:audit` | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Farmer Identification** | `customers:identify_face` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| | `customers:identify_rfid` | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| | `customers:identify_manual`| ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Milk Intake Processing** | `collections:intake` | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| | `collections:view_session` | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| | `collections:view_all` | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Farmer Own Data** | `profile:view_own` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | `profile:update_bank` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | `passbook:view_own` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | `bills:view_own` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | `feed:view_own` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | `notifications:view_own` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |

---

## 4. Detailed Role Responsibility Profiles

### 4.1 SUPER_ADMIN
- **Platform Scope:** Complete administrative authority over `dfarm_central` tables and services.
- **Dairy Scope:** Can create, suspend, reactivate, and assign hardware to any dairy.
- **Explicit Denied Actions:** Cannot directly inspect or modify operational tenant subledgers, collection transactions, or face embeddings unless operating under an active, time-bound, audited diagnostic support session.
- **Audit Requirement:** 100% of mutations logged to `platform_audit_logs`.

### 4.2 PLATFORM_OPERATOR
- **Platform Scope:** Restricted operations engineer.
- **Allowed Actions:** View system health, cluster metrics, acknowledge/resolve platform alerts, view hardware inventory, inspect platform audit trails.
- **Explicit Denied Actions:**
  - Cannot create or suspend dairies.
  - Cannot publish global rate or FAT/SNF policies.
  - Cannot access or modify AMC financial configuration.
  - Cannot request or authorize support sessions.
  - Cannot read or modify tenant databases.
  - Cannot access farmer PII or bank details.

### 4.3 PRIMARY_DAIRY_ADMIN
- **Platform Scope:** Zero access to `dfarm_central` management routes.
- **Dairy Scope:** Full administrative control over exactly one assigned dairy operational database (`dfarm_tenant_<hash>`).
- **Allowed Actions:** Staff management, customer approvals/rejections, rate chart configuration, collection session oversight, feed store sales, billing statements.
- **Cardinality Invariant:** Exactly 1 active `PRIMARY_DAIRY_ADMIN` per dairy organization.

### 4.4 DAIRY_ADMIN
- **Platform Scope:** Zero access to central platform routes.
- **Dairy Scope:** Assigned dairy only. Subordinate to Primary Dairy Admin.
- **Explicit Denied Actions:** Cannot manage staff roles, cannot alter primary dairy configuration or bank beneficiary settings.

### 4.5 COLLECTION_OPERATOR
- **Platform Scope:** Zero central access.
- **Counter Scope:** Operates assigned collection kiosk within authorized center shift sessions.
- **Allowed Actions:** Open/close shifts, identify farmers via facial biometrics and RFID, capture scale/analyzer readings, print receipts.
- **Explicit Denied Actions:** Cannot alter rate charts, approve customers, modify ledger balances, or query records outside active shift session.

### 4.6 SUPERVISOR
- **Platform Scope:** Zero central access.
- **Operational Scope:** Counter oversight and manual override authority.
- **Allowed Actions:** Perform authorized manual identification when biometric/RFID recognition fails, audit shift session totals, inspect exception deliveries.
- **Explicit Denied Actions:** Cannot modify banking details, delete transactions, or modify rates.

### 4.7 FARMER_CUSTOMER
- **Platform Scope:** Zero central or operational staff access.
- **Data Scope:** Strictly scoped to authenticated user ID (`req.user.userId`).
- **Allowed Actions:** View personal collection passbook, check live subledger balance, inspect billing periods, track cattle feed purchases, update bank beneficiary info, read notifications.
- **Explicit Denied Actions:** Cross-customer queries (IDOR attempts) are intercepted with `403 Forbidden`. Cannot record deliveries or alter ledger entries.

### 4.8 GUEST_FARMER
- **Platform Scope:** Onboarding gateway only.
- **Allowed Actions:** Discover nearby dairies via GPS Haversine calculation, submit initial self-registration.
- **Explicit Denied Actions:** Cannot access passbook, billing, feed history, or milk intake until approved by Dairy Admin.

---

## 5. Security Invariants & Audit Standards

1. **Token Purpose Binding:** Access tokens cannot be exchanged across incompatible actor types (`STAFF` vs `CUSTOMER`).
2. **Session Invalidation:** Revoking a user's status to `SUSPENDED` or `INACTIVE` immediately invalidates subsequent API authorization checks.
3. **Sensitive Field Masking:** Bank account numbers are masked (`XXXX-XXXX-last4`) on all customer and staff read endpoints.
4. **Immutable Audit:** All role assignments, permissions alterations, dairy suspensions, alert resolutions, and policy publications append immutable records with timestamp, actor ID, and IP address.
