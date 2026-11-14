# DFarm Architecture: Employee Management & Staff Access Subsystem

## 1. Overview & Separation of Concerns

The DFarm Employee Management & Staff Access subsystem is a dedicated HRMS and operational workforce management module for dairy unions, chilling centers, and bulk milk procurement points. 

### Fundamental Architectural Tenet: Identity Separation
- **Customer (Farmer) Identity vs. Employee Identity**:
  - Farmers/Customers are modeled in `customers` with associated `customer_ledger_accounts` (subledger accounts) for milk intake accounting, bill cycles, and agricultural input sales.
  - Employees are modeled in `employees` with optional mapping to platform operator accounts in `users`.
  - Employees **NEVER** have their salaries or advances intermingled with `customer_ledger_accounts` or `ledger_transactions`.
  - Customer biometric face recognition (Phase 06) is strictly prohibited from being used for employee attendance or employee identification.

---

## 2. PostgreSQL Schema & Data Modeling

The subsystem schema was introduced in migration `016_employee_management_attendance_and_payroll.sql` comprising 13 tables:

```
+------------------------------------+---------------------------------------------------------------+
| Table                              | Purpose                                                       |
+------------------------------------+---------------------------------------------------------------+
| employees                          | Master staff profile, employee code, KYC, employment status   |
| employee_center_assignments        | Multi-center assignment with primary flag and temporal scope  |
| employee_shifts                    | Configured shifts (MORNING, EVENING, NIGHT, GENERAL, SPLIT)   |
| employee_attendance                | Daily clock-in, clock-out, calculated hours, status           |
| employee_attendance_audits         | Immutable audit log for any manual attendance correction      |
| employee_leaves                    | Leave requests, leave balances, maker-checker approval        |
| employee_salary_structures         | Base, allowances, deductions, OT hourly rate (NUMERIC(12,2))   |
| employee_advances                  | Approved capital advances, monthly installments, balances    |
| payroll_runs                       | Monthly/bi-weekly batch runs with full lifecycle states       |
| employee_payslips                  | Individual itemized payslips per employee per payroll run     |
| employee_advance_repayments        | Deduction records linked to payslips reducing advance balance |
| employee_salary_payments           | Disbursement records (Bank NEFT, IMPS, Cash, Cheque)          |
| payroll_audit_logs                 | Full lifecycle event tracking for Maker-Checker and approvals |
+------------------------------------+---------------------------------------------------------------+
```

### Key Table: `employees`
- `id` (UUID, Primary Key)
- `organization_id` (UUID, Foreign Key to `organizations`)
- `user_id` (UUID, Optional Foreign Key to `users`) — maps an operational user login to staff record.
- `employee_code` (VARCHAR(30), Unique per organization)
- `first_name`, `last_name` (VARCHAR(50))
- `phone_number` (VARCHAR(20), E.164 validated)
- `designation`, `department` (VARCHAR(60))
- `employment_type` (`FULL_TIME`, `PART_TIME`, `CONTRACT`, `SEASONAL`, `INTERN`)
- `employment_status` (`ACTIVE`, `INACTIVE`, `SUSPENDED`, `RESIGNED`, `TERMINATED`)
- `date_of_joining` (DATE), `date_of_leaving` (DATE)
- `masked_aadhaar` (VARCHAR(12)), `masked_pan` (VARCHAR(10))
- `emergency_contact_approved` (BOOLEAN) — emergency contact details are masked and only revealed if approved by an HR administrator.

---

## 3. Staff Access & Role-Based Access Control (RBAC)

The system supports granular RBAC with center and organization isolation:

| Role | Employee Read | Employee Write | Role Assign | Shift & Attendance | Salary View | Payroll Approval |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **DAIRY_OWNER** | All Centers | Yes | Yes | Yes | Full (Unmasked) | Yes (Checker) |
| **DAIRY_ADMIN** | All Centers | Yes | Yes | Yes | Full (Unmasked) | Yes (Maker/Checker) |
| **CENTER_MANAGER** | Assigned Center | Center Scope | No | Center Scope | Masked / Read-only | No (View Only) |
| **ACCOUNTS_OFFICER** | All Centers | No | No | View Only | Full | Checker / Payment |
| **SUPERVISOR** | Assigned Center | No | No | Check-in / Out | No | No |
| **COLLECTION_OPERATOR**| No Access | No | No | No Access | No | No |

### Self-Promotion Prevention
- Users cannot promote themselves or modify their own role.
- Role modifications (`POST /api/v1/employees/:id/role`) require `DAIRY_OWNER` or `DAIRY_ADMIN` privileges. If the actor attempts to alter their own role, the request is rejected with `SELF_PROMOTION_PROHIBITED` (HTTP 403).

### Center Scope Isolation
- Center Managers can only view or manage employees assigned to centers within their authorized `centerIds` array. Cross-center requests are rejected with `CENTER_ACCESS_DENIED` (HTTP 403).

---

## 4. Privacy & Masking Policy
- Sensitive identifiers (`aadhaarNumber`, `panNumber`, `bankAccountNumber`) are never stored unmasked in plain text.
- Emergency contact information is only returned when `emergencyContactApproved` is explicitly set to `true`.
- Collection operators and unauthorized staff receive `403 Forbidden` on all employee and salary endpoints.
