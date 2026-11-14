# DFarm: Row Level Security (RLS) & Security Policy Architecture
**Phase 03 of 20: Supabase PostgreSQL Access Control Design**

---

## 1. Security Model & JWT Claim Structure

DFarm enforces database-level authorization via Supabase PostgreSQL **Row Level Security (RLS)**. Even if an API endpoint has an authorization flaw, the database engine enforces strict tenant and role boundaries.

### 1.1 Custom JWT Claims Structure
When users authenticate, the GoTrue auth engine attaches verified custom claims to the JWT token payload:

```json
{
  "sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "role": "authenticated",
  "app_metadata": {
    "organization_id": "org-98765432-1111-2222-3333-444455556666",
    "center_id": "cnt-12345678-aaaa-bbbb-cccc-ddddeeeeffff",
    "user_role": "COLLECTION_OPERATOR",
    "customer_id": null
  }
}
```

For authenticated mobile farmers accessing the Customer Mobile App:
```json
{
  "sub": "f9e8d7c6-b5a4-3210-fedc-ba0987654321",
  "role": "authenticated",
  "app_metadata": {
    "organization_id": "org-98765432-1111-2222-3333-444455556666",
    "center_id": "cnt-12345678-aaaa-bbbb-cccc-ddddeeeeffff",
    "user_role": "FARMER_CUSTOMER",
    "customer_id": "cust-55555555-6666-7777-8888-999999999999"
  }
}
```

---

## 2. Helper Security Functions

To prevent repetitive JSON parsing in policy definitions, secure PostgreSQL helper functions are defined:

```sql
-- 1. Extract Organization UUID from JWT
CREATE OR REPLACE FUNCTION auth.current_org_id() 
RETURNS UUID AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'organization_id', ''))::UUID;
$$ LANGUAGE sql STABLE;

-- 2. Extract Center UUID from JWT
CREATE OR REPLACE FUNCTION auth.current_center_id() 
RETURNS UUID AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'center_id', ''))::UUID;
$$ LANGUAGE sql STABLE;

-- 3. Extract User Role from JWT
CREATE OR REPLACE FUNCTION auth.current_user_role() 
RETURNS VARCHAR AS $$
  SELECT current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'user_role';
$$ LANGUAGE sql STABLE;

-- 4. Extract Canonical Customer UUID from JWT
CREATE OR REPLACE FUNCTION auth.current_customer_id() 
RETURNS UUID AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'customer_id', ''))::UUID;
$$ LANGUAGE sql STABLE;
```

---

## 3. Row Level Security Policies

### 3.1 Organization & Multi-Center Isolation

```sql
-- Enable RLS on core tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE milk_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;

-- Policy 1: Organization Multi-Tenant Boundary (Applies to all staff)
CREATE POLICY rls_org_isolation_customers ON customers
    FOR ALL
    TO authenticated
    USING (organization_id = auth.current_org_id());

CREATE POLICY rls_org_isolation_collections ON milk_collections
    FOR ALL
    TO authenticated
    USING (center_id IN (
        SELECT id FROM dairy_centers WHERE organization_id = auth.current_org_id()
    ));
```

---

### 3.2 Collection Counter Operator & Supervisor Center Isolation

```sql
-- Counter operators and supervisors can only query and insert collections for their assigned center
CREATE POLICY rls_operator_center_collections ON milk_collections
    FOR ALL
    TO authenticated
    USING (
        auth.current_user_role() IN ('COLLECTION_OPERATOR', 'SUPERVISOR', 'CENTER_MANAGER')
        AND center_id = auth.current_center_id()
    )
    WITH CHECK (
        auth.current_user_role() IN ('COLLECTION_OPERATOR', 'SUPERVISOR', 'CENTER_MANAGER')
        AND center_id = auth.current_center_id()
    );
```

---

### 3.3 Customer Self-Service Isolation (Farmer Mobile App)

Dairy farmers accessing their mobile passbook must only ever read rows where `customer_id` matches their own verified JWT claim:

```sql
-- 1. Farmer Customer Profile Access
CREATE POLICY rls_farmer_own_profile ON customers
    FOR SELECT
    TO authenticated
    USING (
        auth.current_user_role() = 'FARMER_CUSTOMER'
        AND id = auth.current_customer_id()
    );

-- 2. Farmer Collection History Access
CREATE POLICY rls_farmer_own_collections ON milk_collections
    FOR SELECT
    TO authenticated
    USING (
        auth.current_user_role() = 'FARMER_CUSTOMER'
        AND customer_id = auth.current_customer_id()
    );

-- 3. Farmer Passbook Ledger Access
CREATE POLICY rls_farmer_own_ledger ON ledger_transactions
    FOR SELECT
    TO authenticated
    USING (
        auth.current_user_role() = 'FARMER_CUSTOMER'
        AND customer_id = auth.current_customer_id()
    );

-- 4. Farmer Monthly Bills Access
CREATE POLICY rls_farmer_own_bills ON monthly_bills
    FOR SELECT
    TO authenticated
    USING (
        auth.current_user_role() = 'FARMER_CUSTOMER'
        AND customer_id = auth.current_customer_id()
    );
```

---

### 3.4 Biometric Template Protection (Restricted Engine Access)

Direct query access to raw facial embedding vectors is strictly barred from all general client application roles:

```sql
ALTER TABLE face_enrollments ENABLE ROW LEVEL SECURITY;

-- Only trusted backend services and registration officers can access biometric records
CREATE POLICY rls_biometrics_staff_only ON face_enrollments
    FOR ALL
    TO authenticated
    USING (
        auth.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER')
        OR (auth.current_user_role() = 'REGISTRATION_OFFICER' AND enrolled_by = auth.uid())
    );

-- Farmers, operators, and accountants can NEVER query biometric embedding vectors
```

---

### 3.5 Employee Master & Payroll Isolation

To preserve financial confidentiality, staff salary and payroll tables are inaccessible to collection operators, registration officers, and dairy farmers:

```sql
-- Only Executive Owners and Authorized Accountants can view payroll runs
CREATE POLICY rls_payroll_isolation ON payroll_runs
    FOR ALL
    TO authenticated
    USING (
        auth.current_user_role() IN ('SUPER_ADMIN', 'DAIRY_OWNER', 'ACCOUNTANT')
        AND organization_id = auth.current_org_id()
    );

-- Employees can only view their own individual pay slips
CREATE POLICY rls_employee_own_pay_slip ON payroll_items
    FOR SELECT
    TO authenticated
    USING (
        employee_id IN (
            SELECT id FROM employees WHERE user_id = auth.uid()
        )
    );
```

---

## 4. Policy Test Scenarios Matrix

| Scenario # | User Role | Target Table | Action | Policy Evaluated | Expected Result |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **TS-01** | `FARMER_CUSTOMER` (Farmer A) | `customers` | `SELECT` where `id = Farmer B` | `rls_farmer_own_profile` | **DENIED (0 rows)** |
| **TS-02** | `FARMER_CUSTOMER` (Farmer A) | `ledger_transactions` | `SELECT` where `customer_id = Farmer A` | `rls_farmer_own_ledger` | **ALLOWED** |
| **TS-03** | `COLLECTION_OPERATOR` (Center 1) | `milk_collections` | `INSERT` with `center_id = Center 2` | `rls_operator_center_collections` | **REJECTED (RLS Error)**|
| **TS-04** | `COLLECTION_OPERATOR` | `face_enrollments` | `SELECT *` | `rls_biometrics_staff_only` | **DENIED (0 rows)** |
| **TS-05** | `COLLECTION_OPERATOR` | `payroll_runs` | `SELECT *` | `rls_payroll_isolation` | **DENIED (0 rows)** |
| **TS-06** | `ACCOUNTANT` (Org 1) | `monthly_bills` | `SELECT` where `org_id = Org 2` | `rls_org_isolation_customers` | **DENIED (0 rows)** |
| **TS-07** | `DAIRY_OWNER` (Org 1) | `monthly_bills` | `SELECT *` | `rls_org_isolation_customers` | **ALLOWED (All Center Bills)**|

