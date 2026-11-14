# DFarm API Reference: Payroll Engine & Payslips

All payroll operations reside under `/api/v1/payroll` and enforce authenticated, role-based access.

---

## 1. Initiate Payroll Run (DRAFT)

Create a draft payroll run for a center and billing period.

- **Endpoint**: `POST /api/v1/payroll`
- **Roles Allowed**: `DAIRY_OWNER`, `DAIRY_ADMIN`, `CENTER_MANAGER`
- **Body**:
```json
{
  "centerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "year": 2026,
  "month": 11,
  "notes": "November 2026 Center Staff Payroll"
}
```
- **Responses**:
  - `201 Created`: Staged run with status `DRAFT`.
  - `409 Conflict`: `DUPLICATE_PAYROLL_RUN` if a run already exists for this center and month.

---

## 2. Execute Payroll Calculations

Calculates attendance-adjusted base pay, overtime, allowances, statutory deductions, and advance installment recoveries.

- **Endpoint**: `POST /api/v1/payroll/:id/calculate`
- **Roles Allowed**: `DAIRY_OWNER`, `DAIRY_ADMIN`, `CENTER_MANAGER`
- **Responses**:
  - `200 OK`: Transitions run from `DRAFT` to `CALCULATING` and then to `UNDER_REVIEW`.
  - Returns calculated summary metrics:
```json
{
  "success": true,
  "data": {
    "id": "64028cd7-3221-461a-947b-d395a71aad3e",
    "status": "UNDER_REVIEW",
    "totalEmployees": 12,
    "totalGrossSalary": 348000.00,
    "totalDeductions": 28400.00,
    "totalNetSalary": 319600.00
  }
}
```

---

## 3. Approve Payroll Run (Maker-Checker Checker Step)

- **Endpoint**: `POST /api/v1/payroll/:id/approve`
- **Roles Allowed**: `DAIRY_OWNER`, `DAIRY_ADMIN`
- **Body**:
```json
{
  "action": "APPROVE",
  "notes": "Verified attendance records and approved overtime vouchers"
}
```
- **Maker-Checker Constraint**: If `req.auth.userId == payrollRun.createdBy`, rejects with `403 Forbidden` (`SELF_APPROVAL_PROHIBITED`).
- **Responses**:
  - `200 OK`: Status becomes `APPROVED`.

---

## 4. Finalize Payroll Run (Lock & Ledger Freeze)

Permanently freezes calculation numbers and applies advance deductions against active loans.

- **Endpoint**: `POST /api/v1/payroll/:id/finalize`
- **Roles Allowed**: `DAIRY_OWNER`, `DAIRY_ADMIN`
- **Body**:
```json
{
  "notes": "Locked and ready for bank disbursement"
}
```
- **Responses**:
  - `200 OK`: Status becomes `FINALIZED`.
  - Active advances have their `remaining_balance` permanently reduced.

---

## 5. Fetch Payslips & Reports

### List Payslips for a Run
- **Endpoint**: `GET /api/v1/payroll/:id/payslips`
- **Roles Allowed**: `DAIRY_OWNER`, `DAIRY_ADMIN`, `CENTER_MANAGER`
- **Responses**: Returns array of itemized employee payslips.

### Get Single Payslip Detail
- **Endpoint**: `GET /api/v1/payroll/payslips/:payslipId`
- **Responses**:
```json
{
  "success": true,
  "data": {
    "id": "b0f386c1-6142-4272-b62f-c4bfcf733db7",
    "payrollRunId": "64028cd7-3221-461a-947b-d395a71aad3e",
    "employeeId": "7dd63fae-3874-4202-b87c-66a203a95424",
    "employeeCode": "EMP-T1-769365",
    "employeeName": "Suresh Patil",
    "designation": "Center Supervisor",
    "department": "Procurement",
    "workingDays": 30,
    "presentDays": 25,
    "leaveDays": 0,
    "absentDays": 5,
    "overtimeHours": 2.0,
    "baseSalary": 24000.00,
    "earnedBaseSalary": 20000.00,
    "hra": 4000.00,
    "travelAllowance": 1500.00,
    "specialAllowance": 1000.00,
    "medicalAllowance": 500.00,
    "overtimePay": 300.00,
    "bonus": 0.00,
    "grossEarnings": 27300.00,
    "providentFund": 1800.00,
    "professionalTax": 200.00,
    "tdsTax": 0.00,
    "otherDeductions": 0.00,
    "advanceRecovery": 2000.00,
    "totalDeductions": 4000.00,
    "netSalary": 23300.00,
    "paymentStatus": "PAID"
  }
}
```

---

## 6. Disburse Salary Payment

Records disbursement into dedicated employee financial table (`employee_salary_payments`).

- **Endpoint**: `POST /api/v1/payroll/payments`
- **Roles Allowed**: `DAIRY_OWNER`, `DAIRY_ADMIN`, `ACCOUNTS_OFFICER`
- **Body**:
```json
{
  "payrollRunId": "64028cd7-3221-461a-947b-d395a71aad3e",
  "payslipId": "b0f386c1-6142-4272-b62f-c4bfcf733db7",
  "employeeId": "7dd63fae-3874-4202-b87c-66a203a95424",
  "amount": 23300.00,
  "paymentMethod": "BANK_TRANSFER",
  "transactionId": "NEFT_981723461",
  "bankName": "State Bank of India",
  "bankAccountMask": "XXXXXX7890",
  "bankIfsc": "SBIN0001234",
  "notes": "Processed via corporate payroll banking batch"
}
```
- **Responses**:
  - `201 Created`: Payment record created with unique reference `EPAY-YYYY-XXXX`. Payslip status updated to `PAID`.
