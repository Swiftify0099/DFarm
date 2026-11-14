# DFarm Architecture: Payroll Engine & Financial Separation

## 1. Principles of DFarm Payroll Architecture

The DFarm Payroll Engine calculates, reviews, approves, finalizes, and disburses salaries for all dairy staff and center personnel.

### Non-Negotiable Financial Directives
1. **PostgreSQL NUMERIC Precision**:
   - All salary structures, allowances, deductions, advance balances, and final payslips are stored as PostgreSQL `NUMERIC(12, 2)`.
   - Authoritative backend calculations convert amounts to integer paise (`BigInt`) to completely eliminate JavaScript IEEE-754 binary floating-point roundoff errors.
2. **Strict Financial Separation from Customer Milk Accounts**:
   - Customer milk purchases post to `customer_ledger_accounts` (e.g. Account 2100 - Customer Payables).
   - Employee salaries, advances, and payroll liabilities are recorded **exclusively** in dedicated employee financial tables (`employee_salary_structures`, `employee_advances`, `employee_payslips`, `employee_salary_payments`, `employee_advance_repayments`).
   - Under no circumstances does payroll post journal lines into customer accounts or farmer ledgers.
3. **Maker-Checker Security on Approvals**:
   - The user who initiates or calculates a payroll run cannot approve or finalize it.
   - Self-approval is rejected with `SELF_APPROVAL_PROHIBITED` (HTTP 403).

---

## 2. Payroll State Machine

A payroll run transitions through six well-defined states:

```
  [DRAFT]
     │
     │  (POST /api/v1/payroll/:id/calculate)
     ▼
[CALCULATING]
     │
     │  (Calculations finish, items populated)
     ▼
[UNDER_REVIEW]
     │
     │  (POST /api/v1/payroll/:id/approve — Checker approval)
     ▼
 [APPROVED]
     │
     │  (POST /api/v1/payroll/:id/finalize — Locks historical numbers, reduces advance balances)
     ▼
 [FINALIZED]
     │
     │  (POST /api/v1/payroll/payments — Bank / cash disbursement)
     ▼
   [PAID]
```

### Transition Guarantees
- **DRAFT**: Created by Admin or Manager for an organization, center, year, and month. Duplicate active runs for the same period are rejected with `DUPLICATE_PAYROLL_RUN` (HTTP 409).
- **UNDER_REVIEW**: Calculations complete. Summary metrics (`totalEmployees`, `totalGrossSalary`, `totalDeductions`, `totalNetSalary`) are compiled and individual `employee_payslips` are staged.
- **APPROVED**: An authorized Checker (e.g. `DAIRY_OWNER` or different `DAIRY_ADMIN`) reviews payslips and signs off.
- **FINALIZED**: The payroll run is permanently locked. Historical numbers can never be changed even if an employee's salary structure is increased later. Any active advance recoveries are permanently applied to decrease `remaining_balance` in `employee_advances`.
- **PAID**: Individual or batch disbursement records are saved in `employee_salary_payments`. Once all payslips are marked `PAID`, the payroll run reaches terminal `PAID` status.

---

## 3. High-Precision Fixed-Point Calculation Algorithm

Authoritative calculation in `services/backend/src/modules/employees/payroll-calculation.util.ts`:

$$\text{Paise} = \mathrm{round}(\text{Amount} \times 100)$$

### Formula Breakdown:
1. **Attendance Factor**:
   $$\text{Earned Base} = \left\lfloor \frac{\text{Base Salary Paise} \times \text{Present Days}}{\text{Working Days in Month}} \right\rfloor$$
2. **Overtime Earnings**:
   $$\text{OT Amount} = \left\lfloor \text{OT Hourly Rate Paise} \times \text{Total OT Hours} \right\rfloor$$
3. **Gross Earnings**:
   $$\text{Gross} = \text{Earned Base} + \text{HRA} + \text{Travel} + \text{Special} + \text{Medical} + \text{OT Amount} + \text{Bonus}$$
4. **Statutory & Other Deductions**:
   $$\text{Total Deductions} = \text{PF} + \text{Prof Tax} + \text{TDS} + \text{Other}$$
5. **Advance Recovery**:
   $$\text{Recovery} = \min(\text{Monthly Installment Paise}, \text{Remaining Balance Paise})$$
6. **Net Payable Salary**:
   $$\text{Net Salary} = \text{Gross} - \text{Total Deductions} - \text{Advance Recovery}$$

---

## 4. Advance Recovery Tracking

When an employee takes an advance:
1. An advance request is created with an amount and monthly installment.
2. An authorized Checker approves the advance, setting status to `ACTIVE`.
3. During payroll calculation, the monthly installment is automatically staged as an `advance_recovery` deduction.
4. When payroll is **FINALIZED**:
   - An entry is inserted into `employee_advance_repayments` referencing the `payslip_id`.
   - `recovered_amount` is incremented.
   - `remaining_balance` is decremented.
   - If `remaining_balance == 0`, status transitions to `FULLY_RECOVERED`.
