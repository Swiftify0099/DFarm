# DFarm Authentication & Authorization Architecture
**Phase 05 Authoritative Specification — Identity Mapping, RBAC & Multi-Tenant Isolation**

---

## 1. Identity Verification Model

The DFarm backend does not blindly trust decoded JWT claims or client-supplied identification headers (`X-User-Id`, `X-User-Role`, `X-Organization-Id`).

Every protected route executes the following verification pipeline in `services/backend/src/middleware/authenticate.ts`:

1. **Header Inspection:**
   - Extracts `Authorization: Bearer <token>`.
   - Rejects non-Bearer schemes with HTTP 401 `UNAUTHORIZED`.
2. **Server-Side Token Verification:**
   - Calls Supabase Auth (`adminClient.auth.getUser(token)`).
   - Validates cryptographic signature and expiration.
   - Rejects malformed or expired tokens with HTTP 401 `INVALID_TOKEN`.
3. **Database Identity Resolution:**
   - Queries `users` table via indexed `auth_user_id` or primary key UUID.
   - If user exists: checks `status === 'ACTIVE'`. Suspended accounts receive HTTP 403 `ACCOUNT_SUSPENDED`.
   - Loads authorized center assignments from `user_center_assignments`.
   - If not in `users`, queries `customers` table.
   - Soft-deleted customers receive HTTP 403 `ACCOUNT_DELETED`.
   - Unmapped identities receive HTTP 403 `UNMAPPED_IDENTITY`.
4. **Context Injection:**
   - Attaches a verified `AuthContext` to `req.auth` for downstream route handlers.

```typescript
export interface AuthContext {
  authUser: { id: string; email?: string; phone?: string };
  actorType: 'STAFF' | 'CUSTOMER';
  userId: string;
  organizationId: string;
  role: UserRole;
  centerIds: string[];
  primaryCenterId?: string;
  token: string;
  userSupabaseClient: SupabaseClient;
}
```

---

## 2. Role-Based Access Control (RBAC)

The application enforces role permissions via `requireRole(allowedRoles)` middleware:

```
                                  [Route Request]
                                         │
                                         ▼
                            [requireRole(allowedRoles)]
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
      Is SUPER_ADMIN? (Yes)                     Check if allowedRoles.includes(role)
                   │                                           │
                   ▼                              ┌────────────┴────────────┐
               [Proceed]                          ▼                         ▼
                                                (Yes)                      (No)
                                                  │                         │
                                                  ▼                         ▼
                                              [Proceed]              HTTP 403 FORBIDDEN
```

### Role Permission Matrix for Core Operations

| Operation | Allowed Roles | Prohibited Roles |
|:---|:---|:---|
| **Register Customer** | `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `REGISTRATION_OFFICER` | `COLLECTION_OPERATOR`, `ACCOUNTANT`, `INVENTORY_MANAGER`, `FARMER_CUSTOMER` |
| **List Customers** | `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `SUPERVISOR`, `REGISTRATION_OFFICER`, `ACCOUNTANT`, `COLLECTION_OPERATOR` | `FARMER_CUSTOMER` |
| **View Customer Profile** | Staff (scoped to assigned center); Customer (self only) | Cross-center staff; Cross-customer access |
| **Update Customer** | `SUPER_ADMIN`, `DAIRY_OWNER`, `CENTER_MANAGER`, `REGISTRATION_OFFICER` | `COLLECTION_OPERATOR`, `FARMER_CUSTOMER` |
| **Soft Delete Customer** | `SUPER_ADMIN`, `DAIRY_OWNER` | All other roles |
| **Restore Customer** | `SUPER_ADMIN`, `DAIRY_OWNER` | All other roles |

---

## 3. Center & Tenant Isolation Rules

### 3.1 Organization Scoping
All database lookups enforce `WHERE organization_id = context.organizationId`. A user belonging to Organization A can never read, modify, or query records belonging to Organization B.

### 3.2 Center Scoping
- Staff users are assigned to specific centers via `user_center_assignments`.
- `DAIRY_OWNER` and `SUPER_ADMIN` have organization-wide visibility across all centers.
- Operational staff (`CENTER_MANAGER`, `REGISTRATION_OFFICER`, `COLLECTION_OPERATOR`) are restricted to their authorized `centerIds`. Attempting to register or query records for an unassigned center yields HTTP 403 `CENTER_ACCESS_DENIED`.

### 3.3 Customer Self-Service Scoping
When `actorType === 'CUSTOMER'`, access is strictly constrained to `context.userId === customerId`. Attempts to view other customer records yield HTTP 403 `CUSTOMER_ISOLATION_VIOLATION`.
