# DFarm Security & Access Control: Employee Management & Payroll

## 1. Threat Model & Safeguards

The employee management and payroll subsystem processes highly sensitive personal data (PII) and executes authoritative corporate fund disbursements. The following threat safeguards are enforced:

### Threat 1: Cross-Entity Financial Contamination
- **Risk**: An employee's salary or loan advance is accidentally credited/debited into farmer milk accounts (`customer_ledger_accounts`), generating inaccurate milk payout settlements or corrupting producer ledgers.
- **Safeguard**: Absolute architectural segregation. The employee subsystem has zero foreign keys or database linkages to `customer_ledger_accounts` or `ledger_transactions`. Automated integration tests explicitly verify that zero rows are created in `ledger_transactions` upon salary finalization or payout.

### Threat 2: Unauthorized Salary Visibility
- **Risk**: Center operators, chilling plant workers, or farmers inspect compensation structures or payslips.
- **Safeguard**: RBAC authorization gatekeeping (`requireRoles`).
  - Roles permitted to view unmasked salary structures: `DAIRY_OWNER`, `DAIRY_ADMIN`, `ACCOUNTS_OFFICER`.
  - Roles permitted center-scoped operational view: `CENTER_MANAGER`.
  - Prohibited roles: `COLLECTION_OPERATOR`, `REGISTRATION_OFFICER`, `LAB_TECHNICIAN`, customer accounts. Requests return HTTP 403 Forbidden.

### Threat 3: Self-Promotion & Privilege Escalation
- **Risk**: An employee assigned role modification access elevates their own account to `DAIRY_OWNER` or modifies their own center access.
- **Safeguard**: Programmatic verification in `EmployeeService.assignRole()`:
  ```ts
  if (auth.userId === emp.userId) {
    throw new ForbiddenError(
      'Self-promotion prohibited: Users cannot modify their own system role',
      'SELF_PROMOTION_PROHIBITED'
    );
  }
  ```

### Threat 4: Maker-Checker Bypass (Fraudulent Self-Approval)
- **Risk**: A manager or admin creates an unauthorized payroll run with arbitrary bonuses or advances and self-approves it before audit discovery.
- **Safeguard**: Dual-control Maker-Checker enforcement:
  1. On advances: An advance requested or created by User A cannot be approved by User A.
  2. On payroll runs: A payroll run initiated or calculated by User A cannot be approved or finalized by User A.
  ```ts
  if (run.created_by === auth.userId) {
    throw new ForbiddenError(
      'Maker-Checker violation: Payroll initiator cannot self-approve their own payroll run',
      'SELF_APPROVAL_PROHIBITED'
    );
  }
  ```

### Threat 5: Face Attendance Abuse / Biometric Spoofing
- **Risk**: An engineer creates employee face attendance by hijacking customer face recognition models.
- **Safeguard**: Architectural ban. DFarm Phase 16 operates 100% software-based attendance. Biometric machines and face recognition models are isolated strictly to farmer identification.

---

## 2. Sensitive Data Masking & Encryption

1. **Aadhaar Numbers**: Stored strictly as `XXXX-XXXX-1234`. Full 12-digit Aadhaar is never persisted in plaintext.
2. **PAN Numbers**: Masked as `ABCDE1234F`.
3. **Bank Account Details**: Stored as `XXXXXX7890`. Only payment gateway tokens or last 4 digits are accessible via the UI.
4. **Emergency Contact Details**: Kept concealed (`emergency_contact_approved = false`) until reviewed and approved by union HR administration.
5. **Audit Trails**: Every manual change to attendance or payroll lifecycle states records:
   - `performed_by` (UUID of authenticated user)
   - `action`
   - `previous_state` / `new_state`
   - `ip_address` / `user_agent`
   - Timestamp (`TIMESTAMPTZ`)

---

## 3. Compliance Verification Matrix

| Security Control | Implementation Location | Test Verification Case |
| :--- | :--- | :--- |
| Self-Promotion Denial | `EmployeeService.assignRole` | Subtest 5 |
| Center Isolation Scope | `EmployeeService.getEmployeeById` | Subtest 4 |
| Maker-Checker on Advances | `SalaryService.approveAdvance` | Subtest 10 |
| Maker-Checker on Payroll | `PayrollService.approvePayrollRun` | Subtest 13 |
| Customer Ledger Segregation | `PayrollService.recordPayment` | Subtest 18 |
| Duplicate Period Prevention | `PayrollService.initiatePayrollRun` | Subtest 11 |
| Immutability after Finalize | `PayrollService.finalizePayrollRun` | Subtest 16 |
| Mandatory Audit Reason | `AttendanceService.correctAttendance` | Subtest 7 |
