# DFARM — Collection Operator Role and Permission Matrix

**Execution Reference:** `DFARM-COLLECTION-OPERATOR-AUTHORIZATION-FIX`  
**Document:** `07_ROLE_AND_PERMISSION_MATRIX.md`  
**Date:** 2026-11-20  
**Status:** COMPLIANT WITH LEAST-PRIVILEGE STANDARD  

---

## 1. Role Definitions

| Role Identifier | UI Target Application | Operational Scope | Principle of Least Privilege Boundary |
| :--- | :--- | :--- | :--- |
| **`COLLECTION_OPERATOR`** | `apps/dfarm-collection-app` | Assigned Collection Center Kiosk | Terminal shift lifecycle, farmer identification, weighing, testing, and receipt issuance. Strictly barred from modifying rate charts, approving members, or adjusting ledger balances. |
| **`SHIFT_SUPERVISOR`** | `apps/dfarm-collection-app` | Assigned Collection Center | Kiosk intake plus manual exception override authority when biometric/RFID scans fail. |
| **`CENTER_MANAGER`** | `apps/dfarm-collection-app` / `apps/dfarm-dairy-admin` | Center Management | Center-wide operational reporting and local inventory oversight. |
| **`PRIMARY_DAIRY_ADMIN`** | `apps/dfarm-dairy-admin` | Cooperative Society | Full operational governance of assigned Dairy, staff onboarding, customer approvals, rate charts, and settlements. |
| **`SUPER_ADMIN`** | `apps/dfarm-super-admin` | Multi-Tenant Platform Federation | Tenant provisioning, central database manager, cluster health, and platform policy. |
| **`FARMER_CUSTOMER`** | `apps/dfarm-customer-app` | Self (Enrolled Farmer) | Digital passbook, ledger subaccount, statements. Denied access to collection kiosk terminals. |

---

## 2. Granular Permissions Comparison

| Permission Key | `COLLECTION_OPERATOR` | `SHIFT_SUPERVISOR` | `PRIMARY_DAIRY_ADMIN` | `SUPER_ADMIN` | `FARMER_CUSTOMER` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `sessions:open` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `sessions:close` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `collections:intake` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `collections:read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `customers:identify_face`| ✅ | ✅ | ✅ | ✅ | ❌ |
| `customers:identify_rfid`| ✅ | ✅ | ✅ | ✅ | ❌ |
| `customers:identify_manual`| ❌ | ✅ | ✅ | ✅ | ❌ |
| `receipts:print` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `staff:manage` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `staff:onboard` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `rate_charts:manage` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `billing:manage` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `customers:approve` | ❌ | ❌ | ✅ | ✅ | ❌ |
| `database:manage` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `passbook:view_self` | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 3. Enforcement Layers

1. **Authentication Gateway:** Rejects non-staff roles at `/api/v1/auth/operator/otp/request`.
2. **Route Authorization Middleware:** `requireRole([UserRole.COLLECTION_OPERATOR, ...])` guards collection endpoints.
3. **Tenant & Center Scoping:** JWT claims (`organizationId`, `centerId`) are enforced in query clauses:
   ```sql
   WHERE organization_id = req.user.organizationId AND center_id = req.user.centerId
   ```
4. **Physical DB Isolation:** Transactions are executed on `dfarm_tenant_<code_hash>`, preventing cross-tenant access.
