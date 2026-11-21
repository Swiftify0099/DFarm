# Module 7: Platform Operator Management UI Integration

**Document Reference:** `DFARM-SUPER-ADMIN-DOC-09`  
**Application Target:** `apps/dfarm-super-admin`  
**Backend Reference:** `services/backend`  
**Database Central:** `dfarm_central`  

---

## 1. Executive Summary & Purpose

The **Admin & Operator Management** module enforces role-based access control (RBAC), privilege separation, and user provisioning across the DFarm control plane. 

To maintain security compliance and zero-trust isolation:
1. **Separation of Roles:** A strict boundary separates `SUPER_ADMIN` (full control-plane authority) from `PLATFORM_OPERATOR` (read-only monitoring, operational triage, and diagnostics).
2. **Separation of Tiers:** Primary Dairy Admins (tenant administrators managing their local cooperative or company) are strictly separated from Platform Staff and Operators (central team members).
3. **Provisioning Guardrails:** Self-registration is disabled. Platform users can only be provisioned by an existing Super Admin with a verified 10-digit Indian mobile number, generating an immutable audit trail.

---

## 2. RBAC Permissions Matrix & Security Guardrails

| Module / Operation | Permission Key | `SUPER_ADMIN` | `PLATFORM_OPERATOR` | `DAIRY_ADMIN` (Tenant) |
|---|---|:---:|:---:|:---:|
| View Dashboard Metrics | `system:monitor` | Allowed | Allowed | Restricted to Tenant |
| Create Tenant Dairy | `dairies:create` | Allowed | Denied | Denied |
| Suspend / Reactivate Dairy | `dairies:suspend` | Allowed | Denied | Denied |
| Author Rate Policy Draft | `policies:write` | Allowed | Denied | Local Tenant Only |
| Publish Global Rate Version | `policies:publish` | Allowed | Denied | Denied |
| Register / Assign Hardware | `hardware:manage` | Allowed | Denied | Denied |
| Manage AMC Plans | `amc:manage` | Allowed | Denied | Denied |
| Provision Platform Staff | `users:manage` | Allowed | Denied | Denied |
| Initiate Diagnostic Support | `support:access` | Allowed | Denied | Denied |
| View Platform Audit Logs | `audit:read` | Allowed | Denied | Denied |
| Platform Settings Telemetry | `system:monitor` | Allowed | Read-Only | Denied |

---

## 3. Database Schema Traceability

Located in `dfarm_central` (created in migration `001_create_central_schema.sql` and `032_central_super_admin_features.sql`):

### `super_admins` / `platform_users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY, DEFAULT gen_random_uuid()` | Platform user UUID |
| `mobile_number` | `VARCHAR(15)` | `NOT NULL, UNIQUE` | 10-digit mobile for Dove SMS OTP |
| `name` | `VARCHAR(255)` | `NOT NULL` | Full legal name |
| `email` | `VARCHAR(255)` | `NULLABLE` | Official business email |
| `role` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'PLATFORM_OPERATOR'` | `SUPER_ADMIN`, `PLATFORM_OPERATOR` |
| `is_active` | `BOOLEAN` | `NOT NULL, DEFAULT true` | Active flag |
| `created_at` | `TIMESTAMPTZ`| `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Provisioning timestamp |
| `updated_at` | `TIMESTAMPTZ`| `NOT NULL, DEFAULT CURRENT_TIMESTAMP` | Last modified timestamp |

---

## 4. API Endpoints & Request/Response Contracts

Mounted under `/api/v1/super-admin/users` with `authenticateSuperAdmin`:

1. `GET /api/v1/super-admin/users`
   - Returns list of platform staff and operators.
   - Masks sensitive credential hashes; returns roles, phone, email, and active status.
2. `POST /api/v1/super-admin/users`
   - Payload: `{ mobile: string, name: string, email?: string, role: 'SUPER_ADMIN' | 'PLATFORM_OPERATOR' }`
   - Enforces `requireSuperAdminRole`. Denies `PLATFORM_OPERATOR` actors.
   - Validates Indian mobile format (`^[6-9]\d{9}$`).
   - Inserts record into `dfarm_central` and writes to `platform_audit_logs`.

---

## 5. Frontend UI Implementation

- **Component Path:** `apps/dfarm-super-admin/src/features/admins/AdminListPage.tsx`
- **Route Path:** `/admins`
- **Navigation Position:** Sidebar item index 3 (`Admin & Operator Management`, icon `Users`)
- **Key UI Sections:**
  1. **Dual-Tab Workspace (`ClayTabs`):**
     - Tab 1: **Primary Dairy Admins** (Tenant-level cooperative administrators with transfer and invitation workflows).
     - Tab 2: **Platform Staff & Operators** (Central control plane users).
  2. **Role Badges & Security Indicators:** Clearly tags `SUPER_ADMIN` in orange/purple and `PLATFORM_OPERATOR` in blue.
  3. **Provision Operator Button:** Triggers `CreateOperatorModal` exclusively for authorized Super Admins.
  4. **`CreateOperatorModal.tsx`:** Form with full name, 10-digit mobile, email, and role selector explaining operator permissions.

---

## 6. Verification & Automated Test Coverage

- **Automated Test Suite:** `apps/dfarm-super-admin/src/test/adminTransfer.test.ts` & `apps/dfarm-super-admin/src/test/auth.test.ts`
- **Backend Service Test:** `services/backend/tests/roadmap-phase-03-super-admin-core.test.js`
- **Verification Outcomes:**
  - Role enforcement verified: `PLATFORM_OPERATOR` cannot provision users or mutate platform policies.
  - Audit logging of staff provisioning verified in `dfarm_central`.
