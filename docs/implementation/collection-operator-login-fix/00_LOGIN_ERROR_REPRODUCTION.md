# DFARM — Collection App Operator Login Failure Reproduction

**Execution Reference:** `DFARM-COLLECTION-OPERATOR-AUTHORIZATION-FIX`  
**Document:** `00_LOGIN_ERROR_REPRODUCTION.md`  
**Date:** 2026-11-20  
**Status:** REPRODUCED & DIAGNOSED  

---

## 1. Executive Summary

When attempting to authenticate into the **DFarm Collection App Kiosk** (`apps/dfarm-collection-app`) using an un-onboarded mobile number or the primary administrator's mobile number, the authentication gateway rejected the request with HTTP `401 Unauthorized` and payload:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Mobile number is not registered as an authorized operator."
  }
}
```

The newly registered Dairy (`Warna Milk's`, code `DF-SAN-2395`) and its physical PostgreSQL tenant database (`dfarm_tenant_df_san_2395_389186304fee`) were healthy and visible in Super Admin. However, the intended collection terminal kiosk could not be operated because no authorized collection operator existed for that Dairy in the central auth catalog or tenant staff schema.

---

## 2. Reproduction Evidence & Protocol

### 2.1 Environmental Parameters
- **Application:** `apps/dfarm-collection-app`
- **View:** `apps/dfarm-collection-app/src/pages/auth/Login.tsx`
- **Backend API Gateway:** `services/backend` (port 4000)
- **Database Engine:** PostgreSQL multi-tenant cluster (`dfarm_central` + `dfarm_tenant_*`)
- **Protocol:** REST API over HTTP/1.1

### 2.2 Wire Capture — Step 1: Request Operator OTP
- **Endpoint:** `POST /api/v1/auth/operator/otp/request`
- **HTTP Method:** `POST`
- **Request Headers:**
  ```http
  Content-Type: application/json
  Accept: application/json
  Host: 127.0.0.1:4000
  ```
- **Request Body:**
  ```json
  {
    "mobileNumber": "9876543210"
  }
  ```

- **HTTP Response:**
  ```http
  HTTP/1.1 401 Unauthorized
  Content-Type: application/json; charset=utf-8
  Content-Length: 120
  X-Request-Id: cdf8b2ac-2be1-4d51-b8a7-cb4575fa4259
  RateLimit-Limit: 10
  RateLimit-Remaining: 9
  RateLimit-Reset: 60
  ETag: W/"78-NfT911ZR9ARHSmEKpaI/rEzhpD0"

  {
    "success": false,
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Mobile number is not registered as an authorized operator."
    }
  }
  ```

### 2.3 Backend Server Log Trace
```json
{
  "level": 40,
  "time": "2026-11-20T02:36:39.765Z",
  "pid": 644,
  "hostname": "pankaj-pc",
  "req": {
    "id": "cdf8b2ac-2be1-4d51-b8a7-cb4575fa4259",
    "method": "POST",
    "url": "/api/v1/auth/operator/otp/request"
  },
  "res": {
    "statusCode": 401
  },
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Mobile number is not registered as an authorized operator."
  },
  "responseTime": 1571,
  "msg": "request completed"
}
```

---

## 3. Dissected Breakdown

| Attribute | State Observed During Failure | Required Production State |
| :--- | :--- | :--- |
| **Target Application** | `apps/dfarm-collection-app` | Authorized kiosk terminal |
| **API Endpoint** | `POST /api/v1/auth/operator/otp/request` | `POST /api/v1/auth/operator/otp/request` |
| **HTTP Status Code** | `401 Unauthorized` | `200 OK` (when registered operator) |
| **Error Code** | `UNAUTHORIZED` | None (returns `previewOtp` in dev / SMS in prod) |
| **Target User Mobile** | `+91 9876543210` / un-onboarded | Normalized `+91 9876543212` (E.164) |
| **User Identity** | `NULL` (Zero rows returned from `users`) | Active record in `users` with `role = 'COLLECTION_OPERATOR'` |
| **Dairy Context** | Missing from query resolution | Associated with `38918630-4fee-4cec-96ea-a3a899aae7bc` (Warna Milk's) |
| **Center Context** | `NULL` | Assigned to `38918630-4fee-4cec-96ea-a3a899aae701` |
| **Account Status** | Unregistered | `ACTIVE` |

---

## 4. Immediate Conclusion

The error was accurately raised by `RequestOperatorOtpUseCase.ts`:
```ts
if (res.rows.length === 0) {
  throw new UnauthorizedError('Mobile number is not registered as an authorized operator.');
}
```
The failure occurred because:
1. The Dairy Admin application had **no workflow** or API endpoint to onboard Collection Operators for newly created Dairies.
2. The Primary Dairy Admin account (`Popat Yewale`, role `DAIRY_ADMIN`) is restricted by RBAC from acting directly as an unassigned counter operator without explicit center assignment.
3. Central database `users` table had zero operator entries for the newly created Dairy.
4. Database initialization had an unhandled constraint exception on `dairy_centers.contact_phone` that prevented seed sync.
