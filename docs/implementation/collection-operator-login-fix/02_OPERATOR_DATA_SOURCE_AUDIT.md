# DFARM — Collection Operator Data Source Audit

**Execution Reference:** `DFARM-COLLECTION-OPERATOR-AUTHORIZATION-FIX`  
**Document:** `02_OPERATOR_DATA_SOURCE_AUDIT.md`  
**Date:** 2026-11-20  
**Status:** COMPLETE AUDIT  

---

## 1. Database Schema Inspection

The authoritative storage of operator identities was audited across both database tiers:

### 1.1 Central Database (`dfarm_central`)
Defined by `supabase/migrations/003_user_identity_foundation.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    username VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    phone_number VARCHAR(20) NOT NULL,
    role VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_user_role CHECK (role IN (
        'SUPER_ADMIN', 'DAIRY_OWNER', 'DAIRY_ADMIN', 'CENTER_MANAGER', 'SUPERVISOR',
        'COLLECTION_OPERATOR', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'REGISTRATION_OFFICER', 'FARMER_CUSTOMER'
    )),
    CONSTRAINT chk_user_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE'))
);

CREATE TABLE IF NOT EXISTS user_center_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_center_assignment UNIQUE (user_id, center_id)
);
```

### 1.2 Tenant Database (`dfarm_tenant_<code_hash>`)
Defined by `supabase/migrations/016_employee_management_attendance_and_payroll.sql`:

```sql
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    primary_center_id UUID,
    user_id UUID,
    employee_code VARCHAR(30) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    employment_status VARCHAR(30) DEFAULT 'ACTIVE',
    designation VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_employee_code_per_org UNIQUE (organization_id, employee_code)
);

CREATE TABLE IF NOT EXISTS employee_center_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    CONSTRAINT uq_emp_center UNIQUE (employee_id, center_id)
);
```

---

## 2. Authoritative Source of Truth Mapping

To prevent scatter-gather queries and adhere to strict physical tenant isolation:

| Data Element | Storage Location | Authoritative Table | Justification |
| :--- | :--- | :--- | :--- |
| **Authentication Identity** | `dfarm_central` | `users` | Single entrypoint for OTP verification across all clients without multi-tenant probing. |
| **Role Claim** | `dfarm_central` & Tenant DB | `users.role` | Evaluated at login gateway to reject non-operator roles upfront. |
| **Center Assignment** | `dfarm_central` & Tenant DB | `user_center_assignments` | Resolves which collection center terminal the operator is authorized to unlock. |
| **Employee HR Records** | Tenant DB (`dfarm_tenant_*`) | `employees` | Local HR records, payroll, attendance, and emergency contacts remain tenant-isolated. |
| **Shift Session Logs** | Tenant DB (`dfarm_tenant_*`) | `kiosk_shift_sessions` | Operational shifts are strictly owned by the physical tenant database. |
| **Milk Intake Records** | Tenant DB (`dfarm_tenant_*`) | `milk_collections` | Deliveries and weight scale readings are strictly stored in the tenant database. |

---

## 3. Findings on Operator Provisioning State

1. **New Dairy Initialization:**
   - In `services/backend/src/presentation/routes/dairies.routes.ts`, creating a Dairy provisions:
     - `organizations` record (`id`, `name`, `code`)
     - `dairy_centers` record (`id`, `name`, `code`)
     - `users` record (`role = 'DAIRY_ADMIN'`, `user_role = 'PRIMARY_DAIRY_ADMIN'`)
   - It **does not** create any `COLLECTION_OPERATOR` accounts.
2. **Onboarding Responsibility:**
   - The Dairy Administrator must explicitly register and assign counter operators.
   - The platform had omitted the Dairy Admin staff onboarding API, resulting in newly provisioned Dairies having zero operators.
