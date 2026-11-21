# DFARM — Collection App Session and Context Validation

**Execution Reference:** `DFARM-COLLECTION-OPERATOR-AUTHORIZATION-FIX`  
**Document:** `08_COLLECTION_APP_SESSION_AND_CONTEXT_VALIDATION.md`  
**Date:** 2026-11-20  
**Status:** VALIDATED  

---

## 1. Operator Session Payload

Upon successful OTP verification at `POST /api/v1/auth/operator/otp/verify`, the backend returns:

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIwNzdlY2E4OS0yNzZmLTQ1YzctODUyNi04OTJlNDJiOWZjNTciLCJvcmdhbml6YXRpb25JZCI6IjM4OTE4NjMwLTRmZWUtNGNlYy05NmVhLWEzYTg5OWFhZTdiYyIsImNlbnRlcklkIjoiMzg5MTg2MzAtNGZlZS00Y2VjLTk2ZWEtYTNhODk5YWFlNzAxIiwicm9sZSI6IkNPTExFQ1RJT05fT1BFUkFUT1IiLCJhY3RvclR5cGUiOiJTVEFGRiIsImlhdCI6MTc5NTE0Mjc0NSwiZXhwIjoxNzk1MjI5MTQ1fQ.xxxx",
  "operator": {
    "id": "077eca89-276f-45c7-8526-892e42b9fc57",
    "fullName": "Vikas Suresh Patil",
    "mobileNumber": "+919876543212",
    "role": "COLLECTION_OPERATOR",
    "dairyId": "38918630-4fee-4cec-96ea-a3a899aae7bc",
    "dairyName": "Warna Milk's",
    "dairyCode": "DF-SAN-2395",
    "centerId": "38918630-4fee-4cec-96ea-a3a899aae701",
    "centerName": "Warna Main Center",
    "centerCode": "C-01"
  }
}
```

---

## 2. JWT Claim Verification

The signed JWT contains standard and proprietary claims required for zero-spoofing backend enforcement:

| Claim | Value | Verification Rule |
| :--- | :--- | :--- |
| `userId` | `077eca89-276f-45c7-8526-892e42b9fc57` | Must exist in `users` table with status `ACTIVE`. |
| `organizationId` | `38918630-4fee-4cec-96ea-a3a899aae7bc` | Dynamically selects `dfarm_tenant_df_san_2395_389186304fee`. |
| `centerId` | `38918630-4fee-4cec-96ea-a3a899aae701` | Scopes shift sessions and weighing scales to this center. |
| `role` | `COLLECTION_OPERATOR` | Authorized for `collections:*`, `sessions:*`, `rfid:*`. |
| `actorType` | `STAFF` | Prevents token reuse on customer passbook routes. |
| `exp` | `iat + 86400` | 24-hour shift terminal operational window. |

---

## 3. UI State Transition & Kiosk Context

In `apps/dfarm-collection-app`:
1. `client.ts`: `setStoredOperatorAuth(token, dairyId, operator)` writes session state to local secure storage.
2. `AuthContext.tsx`: Sets `isAuthenticated = true`, `operatorRole = 'COLLECTION_OPERATOR'`, `dairyCode = 'DF-SAN-2395'`.
3. Navigation: Automatically routes from `/login` to `/collection`.
4. Header Display (`CollectionHeader.tsx`):
   - Cooperative: `Warna Milk's • DF-SAN-2395`
   - Terminal: `Warna Main Center (C-01)`
   - Operator: `Vikas Suresh Patil (Collection Operator)`
5. Operational Lock: Shift session modal prompts for morning/evening cow/buffalo session initialization bound strictly to `38918630-4fee-4cec-96ea-a3a899aae701`.
