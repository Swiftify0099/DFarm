-- ==============================================================================
-- DFARM - SMART DAIRY MANAGEMENT SYSTEM
-- MIGRATION 016: EMPLOYEE MANAGEMENT, ATTENDANCE & PAYROLL SUBSYSTEM
-- ==============================================================================

-- 1. Employees Master Table
CREATE TABLE IF NOT EXISTS employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    primary_center_id UUID REFERENCES dairy_centers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    employee_code VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL,
    email VARCHAR(150),
    national_id_mask VARCHAR(50),
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    joining_date DATE NOT NULL,
    termination_date DATE,
    employment_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    employment_type VARCHAR(30) NOT NULL DEFAULT 'FULL_TIME',
    designation VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    emergency_contact_name VARCHAR(150),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relation VARCHAR(50),
    emergency_contact_approved BOOLEAN NOT NULL DEFAULT FALSE,
    bank_name VARCHAR(100),
    bank_account_number_mask VARCHAR(50),
    bank_ifsc VARCHAR(20),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_org_code UNIQUE (organization_id, employee_code),
    CONSTRAINT chk_employee_status CHECK (employment_status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'RESIGNED', 'TERMINATED')),
    CONSTRAINT chk_employee_type CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'DAILY_WAGE'))
);

CREATE TRIGGER set_employees_updated_at
BEFORE UPDATE ON employees
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_employees_org_id ON employees(organization_id);
CREATE INDEX IF NOT EXISTS idx_employees_center_id ON employees(primary_center_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(employment_status);
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);

-- 2. Employee Center Assignments (Multi-Center Staff Assignment)
CREATE TABLE IF NOT EXISTS employee_center_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_center_assignment UNIQUE (employee_id, center_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_center_assign_emp ON employee_center_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_center_assign_center ON employee_center_assignments(center_id);

-- 3. Employee Shifts Definition
CREATE TABLE IF NOT EXISTS employee_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_period_minutes INT NOT NULL DEFAULT 15,
    half_day_threshold_hours NUMERIC(4,2) NOT NULL DEFAULT 4.00,
    full_day_threshold_hours NUMERIC(4,2) NOT NULL DEFAULT 8.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_shifts_org_code UNIQUE (organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_employee_shifts_org ON employee_shifts(organization_id);

-- 4. Employee Attendance Records
CREATE TABLE IF NOT EXISTS employee_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID NOT NULL REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    attendance_date DATE NOT NULL,
    shift_id UUID REFERENCES employee_shifts(id) ON DELETE SET NULL,
    shift_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL',
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    total_hours NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'PRESENT',
    is_late_arrival BOOLEAN NOT NULL DEFAULT FALSE,
    is_early_departure BOOLEAN NOT NULL DEFAULT FALSE,
    overtime_hours NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    is_manual_correction BOOLEAN NOT NULL DEFAULT FALSE,
    correction_reason TEXT,
    corrected_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    corrected_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_employee_attendance_date UNIQUE (employee_id, attendance_date, shift_type),
    CONSTRAINT chk_attendance_status CHECK (status IN ('PRESENT', 'ABSENT', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF')),
    CONSTRAINT chk_shift_type CHECK (shift_type IN ('MORNING', 'EVENING', 'GENERAL', 'NIGHT'))
);

CREATE TRIGGER set_employee_attendance_updated_at
BEFORE UPDATE ON employee_attendance
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_emp_att_org_date ON employee_attendance(organization_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_emp_att_center_date ON employee_attendance(center_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_emp_att_employee ON employee_attendance(employee_id, attendance_date);

-- 5. Attendance Audit Trail
CREATE TABLE IF NOT EXISTS employee_attendance_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id UUID NOT NULL REFERENCES employee_attendance(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    old_values JSONB,
    new_values JSONB,
    reason TEXT NOT NULL,
    ip_address VARCHAR(45),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_att_audits_att ON employee_attendance_audits(attendance_id);
CREATE INDEX IF NOT EXISTS idx_emp_att_audits_actor ON employee_attendance_audits(actor_id);

-- 6. Employee Leaves
CREATE TABLE IF NOT EXISTS employee_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    leave_type VARCHAR(30) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days_count NUMERIC(4,1) NOT NULL CHECK (days_count > 0.0),
    reason TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_leave_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT chk_leave_type CHECK (leave_type IN ('CASUAL', 'SICK', 'EARNED', 'UNPAID', 'MATERNITY', 'EMERGENCY'))
);

CREATE TRIGGER set_employee_leaves_updated_at
BEFORE UPDATE ON employee_leaves
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_emp_leaves_org ON employee_leaves(organization_id);
CREATE INDEX IF NOT EXISTS idx_emp_leaves_emp ON employee_leaves(employee_id);

-- 7. Employee Salary Structure
CREATE TABLE IF NOT EXISTS employee_salary_structures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    calculation_basis VARCHAR(30) NOT NULL DEFAULT 'MONTHLY',
    base_salary NUMERIC(12,2) NOT NULL CHECK (base_salary >= 0.00),
    hra NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (hra >= 0.00),
    travel_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (travel_allowance >= 0.00),
    special_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (special_allowance >= 0.00),
    medical_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (medical_allowance >= 0.00),
    gross_salary NUMERIC(12,2) NOT NULL CHECK (gross_salary >= 0.00),
    provident_fund_employee NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (provident_fund_employee >= 0.00),
    professional_tax NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (professional_tax >= 0.00),
    tds_tax NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tds_tax >= 0.00),
    other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (other_deductions >= 0.00),
    overtime_hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (overtime_hourly_rate >= 0.00),
    effective_from DATE NOT NULL,
    effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_salary_basis CHECK (calculation_basis IN ('MONTHLY', 'DAILY_WAGE', 'HOURLY'))
);

CREATE TRIGGER set_employee_salary_structures_updated_at
BEFORE UPDATE ON employee_salary_structures
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_salary_struct_emp ON employee_salary_structures(employee_id, is_active);

-- 8. Employee Advances (Dedicated Employee Advance Table)
CREATE TABLE IF NOT EXISTS employee_advances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    advance_number VARCHAR(60) NOT NULL UNIQUE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0.00),
    disbursed_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (disbursed_amount >= 0.00),
    recovered_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (recovered_amount >= 0.00),
    remaining_balance NUMERIC(12,2) NOT NULL CHECK (remaining_balance >= 0.00),
    monthly_installment NUMERIC(12,2) NOT NULL CHECK (monthly_installment > 0.00),
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING_APPROVAL',
    reason TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_emp_advance_status CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ACTIVE', 'FULLY_RECOVERED', 'CANCELLED'))
);

CREATE TRIGGER set_employee_advances_updated_at
BEFORE UPDATE ON employee_advances
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_emp_advances_emp ON employee_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_advances_status ON employee_advances(status);

-- 9. Payroll Runs (Lifecycle: DRAFT -> CALCULATING -> UNDER_REVIEW -> APPROVED -> FINALIZED -> PAID)
CREATE TABLE IF NOT EXISTS payroll_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    center_id UUID REFERENCES dairy_centers(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    year INT NOT NULL,
    month INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    total_employees INT NOT NULL DEFAULT 0,
    total_gross_salary NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_allowances NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_deductions NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_advances_recovered NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_net_salary NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    calculated_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    approved_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES users(id) ON DELETE RESTRICT,
    finalized_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_payroll_status CHECK (status IN ('DRAFT', 'CALCULATING', 'UNDER_REVIEW', 'APPROVED', 'FINALIZED', 'PAID', 'CANCELLED'))
);

-- Unique index ensuring no duplicate payroll run for the exact same org, center, year, month
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_period_scope
ON payroll_runs (organization_id, COALESCE(center_id, '00000000-0000-0000-0000-000000000000'::uuid), year, month)
WHERE status != 'CANCELLED';

CREATE TRIGGER set_payroll_runs_updated_at
BEFORE UPDATE ON payroll_runs
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payroll_runs_org ON payroll_runs(organization_id, year, month);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs(status);

-- 10. Employee Payslips (Itemized, Calculated, Immutable when Finalized)
CREATE TABLE IF NOT EXISTS employee_payslips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payslip_number VARCHAR(60) NOT NULL UNIQUE,
    total_working_days NUMERIC(4,1) NOT NULL DEFAULT 30.0,
    present_days NUMERIC(4,1) NOT NULL DEFAULT 0.0,
    absent_days NUMERIC(4,1) NOT NULL DEFAULT 0.0,
    paid_leave_days NUMERIC(4,1) NOT NULL DEFAULT 0.0,
    unpaid_leave_days NUMERIC(4,1) NOT NULL DEFAULT 0.0,
    overtime_hours NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    base_salary NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    earned_basic NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    hra NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    travel_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    special_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    medical_allowance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    overtime_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    gross_earnings NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    pf_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    tax_deduction NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    advance_recovery NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    net_salary NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    payment_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    payment_method VARCHAR(30) NOT NULL DEFAULT 'BANK_TRANSFER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_payroll_run_employee UNIQUE (payroll_run_id, employee_id),
    CONSTRAINT chk_payslip_payment_status CHECK (payment_status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED'))
);

CREATE TRIGGER set_employee_payslips_updated_at
BEFORE UPDATE ON employee_payslips
FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payslips_run ON employee_payslips(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payslips_emp ON employee_payslips(employee_id);

-- 11. Employee Advance Repayments
CREATE TABLE IF NOT EXISTS employee_advance_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advance_id UUID NOT NULL REFERENCES employee_advances(id) ON DELETE RESTRICT,
    payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
    payslip_id UUID REFERENCES employee_payslips(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0.00),
    repayment_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_repay_adv ON employee_advance_repayments(advance_id);
CREATE INDEX IF NOT EXISTS idx_advance_repay_run ON employee_advance_repayments(payroll_run_id);

-- 12. Employee Salary Payment Records (Dedicated Employee Financial Table)
CREATE TABLE IF NOT EXISTS employee_salary_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE RESTRICT,
    payslip_id UUID NOT NULL REFERENCES employee_payslips(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    payment_reference VARCHAR(100) NOT NULL UNIQUE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0.00),
    payment_method VARCHAR(30) NOT NULL DEFAULT 'BANK_TRANSFER',
    transaction_id VARCHAR(100),
    bank_name VARCHAR(100),
    bank_account_mask VARCHAR(50),
    bank_ifsc VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'COMPLETED',
    disbursed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disbursed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_salary_pay_method CHECK (payment_method IN ('BANK_TRANSFER', 'CASH', 'CHEQUE', 'UPI')),
    CONSTRAINT chk_salary_pay_status CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REVERSED'))
);

CREATE INDEX IF NOT EXISTS idx_salary_pay_org ON employee_salary_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_salary_pay_run ON employee_salary_payments(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_salary_pay_emp ON employee_salary_payments(employee_id);

-- 13. Dedicated Payroll Audit Logs
CREATE TABLE IF NOT EXISTS payroll_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    previous_state VARCHAR(50),
    new_state VARCHAR(50),
    metadata JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_audit_org ON payroll_audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_entity ON payroll_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_actor ON payroll_audit_logs(actor_id);
