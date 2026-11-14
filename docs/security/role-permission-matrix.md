# DFarm: Role-Based Access Control (RBAC) & Permission Matrix

This document defines the user personas, security roles, organizational boundaries, and granular permission sets governing access across all four applications in the DFarm ecosystem.

---

## 1. System Roles & Personas

1. **SUPER_ADMIN / PLATFORM_ENGINEER:** System administrator with full technical access across all tenant organizations.
2. **DAIRY_DIRECTOR / OWNER:** Executive head of a dairy organization. Authorizes rate changes, approves billing cycles, and views executive analytics.
3. **ACCOUNTANT:** Financial officer responsible for customer ledgers, feed billing, advance management, staff payroll, and payment reconciliation.
4. **COLLECTION_SUPERVISOR:** On-site supervisor at a collection center. Authorizes manual identification overrides, verifies shift aggregates, and manages counter operators.
5. **COLLECTION_OPERATOR:** Counter staff operating the intake terminal. Executes collection sessions and dispenses printed slips.
6. **REGISTRATION_OFFICER:** Field officer operating the Customer Registration Android App. Performs farmer KYC, biometric enrollment, and RFID binding.
7. **FARMER_CUSTOMER:** Registered dairy customer accessing the Customer Mobile App. Has read-only access strictly isolated to their own records.

---

## 2. Comprehensive Role-Permission Matrix

| Functional Module | Action / Capability | SUPER_ADMIN | DAIRY_DIRECTOR | ACCOUNTANT | COLLECTION_SUPERVISOR | COLLECTION_OPERATOR | REGISTRATION_OFFICER | FARMER_CUSTOMER |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Customer Master** | View Customer List | ✅ All | ✅ Org | ✅ Org | ✅ Center | ✅ Center (Search) | ✅ Center | ❌ |
| | Create New Customer | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | Update Customer Details | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | Soft Delete Customer | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | Restore Soft-Deleted Customer | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Biometrics & RFID** | Enroll Facial Template | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | Assign RFID Card | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| | Revoke RFID Card | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| | View Raw Biometric Embeddings | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (Strictly System) |
| **Milk Collection** | Perform Collection Intake | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| | Manual Identification Override | ✅ | ✅ | ❌ | ✅ (With Reason) | ❌ | ❌ | ❌ |
| | Cancel Completed Collection | ✅ | ✅ | ❌ | ✅ (Within Shift) | ❌ | ❌ | ❌ |
| | Reprint Collection Slip | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Rate Management** | Create / Edit Rate Charts | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | Activate Rate Chart | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | View Historical Rate Charts | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Ledger & Accounting** | View Customer Passbook | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ (Own Only) |
| | Issue Cash Advance | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| | Record Special Deduction | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| | Generate Monthly Bills | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| | Disburse Customer Payments | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Feed Inventory** | Manage Inventory Catalog | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| | Record Credit Sale to Farmer | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Employee Payroll** | Manage Staff Salaries | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| | Run Monthly Payroll | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Audit & Settings** | View Security Audit Logs | ✅ | ✅ | ❌ | ✅ (Center Only) | ❌ | ❌ | ❌ |
| | Configure Organization Settings| ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| | Manage Center Shift Timings | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 3. Organizational & Center Data Boundaries

1. **Organization-Level Scoping:** Users belonging to Organization A cannot view, query, or mutate customers, rate charts, or collections belonging to Organization B.
2. **Center-Level Scoping:** Counter operators and supervisors are locked to their assigned `center_id`. Cross-center transactions require administrative multi-center permissions.
3. **Farmer Scoping:** Authenticated mobile farmers are bound to `customer_uuid = auth.jwt()->>'customer_uuid'`. Any query attempting to access another farmer's UUID yields HTTP 403 Forbidden.

---

## 4. Session & Re-Authentication Rules

- **Admin & Accounting Sessions:** JWT access token validity is 60 minutes, refreshed via secure HTTP-only cookies. Inactivity timeout triggers re-authentication after 30 minutes.
- **Collection Counter Operator Session:** Long-lived device session (8–12 hours aligned with dairy shift), protected by local hardware device registration.
- **Supervisor Override Re-Authentication:** When an operator requests a Supervisor Manual Identification, the supervisor must authenticate using a secure PIN or biometric scan on the counter terminal.

