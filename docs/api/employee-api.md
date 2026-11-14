# DFarm API Reference: Employee Management & Staff Access

All employee endpoints reside under `/api/v1/employees` and require a valid Bearer JWT.

---

## 1. Register Employee

Create a new staff record in the organization.

- **Endpoint**: `POST /api/v1/employees`
- **Roles Allowed**: `DAIRY_OWNER`, `DAIRY_ADMIN`, `CENTER_MANAGER`
- **Headers**:
  ```http
  Authorization: Bearer <jwt_token>
  Content-Type: application/json
  ```

### Request Body
```json
{
  "employeeCode": "EMP-2026-0042",
  "firstName": "Suresh",
  "lastName": "Patil",
  "phoneNumber": "+919876543210",
  "email": "suresh.patil@sanglidairy.com",
  "designation": "Center Supervisor",
  "department": "Procurement",
  "employmentType": "FULL_TIME",
  "dateOfJoining": "2026-11-01",
  "centerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "address": "At Post Tasgaon, Dist Sangli",
  "maskedAadhaar": "XXXX-XXXX-1234",
  "maskedPan": "ABCDE1234F",
  "emergencyContactName": "Ramesh Patil",
  "emergencyContactPhone": "+919876543211",
  "emergencyContactRelation": "Brother"
}
```

### Responses
- `201 Created`: Employee record created.
- `409 Conflict`: `DUPLICATE_EMPLOYEE_CODE` if the employee code already exists in the organization.
- `403 Forbidden`: `CENTER_ACCESS_DENIED` if a Center Manager tries to register for an unassigned center.

---

## 2. List Employees

Retrieve staff directory with pagination and filters.

- **Endpoint**: `GET /api/v1/employees`
- **Query Parameters**:
  - `centerId` (optional UUID)
  - `status` (optional `ACTIVE`, `INACTIVE`, `SUSPENDED`, `RESIGNED`, `TERMINATED`)
  - `department` (optional string)
  - `search` (optional search query matching name, code, phone)
  - `page` (optional integer, default 1)
  - `limit` (optional integer, default 20)

### Responses
- `200 OK`:
```json
{
  "success": true,
  "data": {
    "employees": [
      {
        "id": "7dd63fae-3874-4202-b87c-66a203a95424",
        "employeeCode": "EMP-2026-0042",
        "firstName": "Suresh",
        "lastName": "Patil",
        "phoneNumber": "+919876543210",
        "designation": "Center Supervisor",
        "department": "Procurement",
        "employmentType": "FULL_TIME",
        "employmentStatus": "ACTIVE",
        "dateOfJoining": "2026-11-01",
        "assignedCenters": [
          {
            "centerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            "isPrimary": true
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

---

## 3. Get Employee Details

- **Endpoint**: `GET /api/v1/employees/:id`
- **Responses**:
  - `200 OK`: Full profile details. Emergency contacts are masked unless approved.
  - `404 Not Found`: `EMPLOYEE_NOT_FOUND`
  - `403 Forbidden`: `CENTER_ACCESS_DENIED` if center scope is violated.

---

## 4. Assign Roles & Permissions

Assign platform operator role (`SUPERVISOR`, `COLLECTION_OPERATOR`, `REGISTRATION_OFFICER`, etc.) to an employee.

- **Endpoint**: `POST /api/v1/employees/:id/role`
- **Roles Allowed**: `DAIRY_OWNER`, `DAIRY_ADMIN`
- **Body**:
```json
{
  "role": "SUPERVISOR",
  "username": "suresh_patil",
  "email": "suresh.patil@sanglidairy.com"
}
```
- **Self-Promotion Check**: If `req.auth.userId == targetEmployee.userId`, returns `403 Forbidden` (`SELF_PROMOTION_PROHIBITED`).

---

## 5. Employee Salary Structure

Create or update an employee's salary configuration.

- **Endpoint**: `POST /api/v1/employees/:id/salary-structure`
- **Roles Allowed**: `DAIRY_OWNER`, `DAIRY_ADMIN`
- **Body**:
```json
{
  "calculationBasis": "MONTHLY",
  "baseSalary": 24000.00,
  "hra": 4000.00,
  "travelAllowance": 1500.00,
  "specialAllowance": 1000.00,
  "medicalAllowance": 500.00,
  "providentFundEmployee": 1800.00,
  "professionalTax": 200.00,
  "tdsTax": 0.00,
  "otherDeductions": 0.00,
  "overtimeHourlyRate": 150.00,
  "effectiveFrom": "2026-11-01"
}
```
- **Responses**:
  - `201 Created`: Active salary structure saved.

---

## 6. Employee Advances

### Request Advance
- **Endpoint**: `POST /api/v1/employees/:id/advances`
- **Roles Allowed**: `DAIRY_OWNER`, `DAIRY_ADMIN`, `CENTER_MANAGER`
- **Body**:
```json
{
  "amount": 6000.00,
  "monthlyInstallment": 2000.00,
  "reason": "Emergency medical treatment for family member"
}
```

### Approve / Reject Advance (Maker-Checker)
- **Endpoint**: `POST /api/v1/employees/advances/:advanceId/approve`
- **Roles Allowed**: `DAIRY_OWNER`, `DAIRY_ADMIN`
- **Body**:
```json
{
  "status": "APPROVED",
  "notes": "Approved by Dairy Owner"
}
```
- **Self-Approval Check**: If `req.auth.userId == advance.createdBy`, rejects with `403 Forbidden` (`SELF_APPROVAL_PROHIBITED`).
