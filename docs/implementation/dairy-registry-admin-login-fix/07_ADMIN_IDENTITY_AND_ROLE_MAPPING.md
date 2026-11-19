# 07 - Admin Identity, RBAC & Role Mapping Audit

**Execution Reference:** `DFARM-DAIRY-REGISTRY-ADMIN-LOGIN-RECOVERY`  
**Application Target:** `apps/dfarm-dairy-admin` & `services/backend/src/application/use-cases/auth/AdminAuthUseCases.ts`

---

## 1. Administrative Roles & Hierarchy

DFarm enforces strict hierarchical RBAC across administrative tiers:

| Role Identifier | Scope | Primary Capabilities | Permitted Portals |
|---|---|---|---|
| `SUPER_ADMIN` | Platform-wide Federation | Universal wildcard (`*`), tenant provisioning, hardware allocation, global audits | `apps/dfarm-super-admin` |
| `PRIMARY_DAIRY_ADMIN` | Single Dairy Cooperative | Complete tenant operational management, staff assignment, rate chart configuration | `apps/dfarm-dairy-admin` |
| `DAIRY_ADMIN` | Single Dairy Cooperative | Operational daily management; denied staff removal or primary ownership reassignment | `apps/dfarm-dairy-admin` |
| `CENTER_MANAGER` | Collection Center | Center-level shift operations and dispatch oversight | `apps/dfarm-collection-app` |

---

## 2. Warna Milk's Administrator Account Bindings

### 2.1 Primary Business Owner: Popat Yewale
- **User ID:** `37b8de06-0023-4935-b1bb-3d7152065e6e`
- **Full Name:** `popat yewale`
- **Mobile Number:** `+919834388787` (`9834388787`)
- **Email:** `pankajye5656@gmail.com`
- **Assigned Tenant:** `Warna Milk's` (`65190859-c8e2-4a06-b862-5ed7ad8628cb`)
- **Assigned Tenant Code:** `DF-SAN-6632`
- **Assigned Role:** `PRIMARY_DAIRY_ADMIN` (with `role = 'DAIRY_ADMIN'` for legacy backwards-compatibility)
- **Account Status:** `ACTIVE`

### 2.2 Operational Admin: Warna Dairy Admin
- **User ID:** `272d8a02-b1c8-4a70-b23a-da5565ea77b3`
- **Full Name:** `Warna Dairy Admin`
- **Mobile Number:** `+917507495615` (`7507495615`)
- **Email:** `dairy.admin@dfarm.in`
- **Assigned Tenant:** `Warna Milk's` (`65190859-c8e2-4a06-b862-5ed7ad8628cb`)
- **Assigned Role:** `DAIRY_ADMIN`
- **Account Status:** `ACTIVE`

---

## 3. JWT Token Payload & RBAC Guarantees

Upon successful OTP verification, the token generator signs a cryptographically hardened HMAC-SHA256 JWT containing:
```json
{
  "userId": "37b8de06-0023-4935-b1bb-3d7152065e6e",
  "organizationId": "65190859-c8e2-4a06-b862-5ed7ad8628cb",
  "role": "dairy_admin",
  "actorType": "STAFF",
  "exp": 1795166400
}
```

The accompanying user object returned to the frontend guarantees full session hydration:
```json
{
  "id": "37b8de06-0023-4935-b1bb-3d7152065e6e",
  "phone": "+919834388787",
  "role": "DAIRY_ADMIN",
  "actorType": "STAFF",
  "name": "popat yewale",
  "fullName": "popat yewale",
  "dairyId": "65190859-c8e2-4a06-b862-5ed7ad8628cb",
  "dairyName": "Warna Milk's",
  "dairyCode": "DF-SAN-6632"
}
```
This satisfies all tenant routing checks in `apps/dfarm-dairy-admin/src/api/index.ts` (specifically `if (!data.user?.dairyId)`), ensuring smooth post-login redirection to the dashboard.
