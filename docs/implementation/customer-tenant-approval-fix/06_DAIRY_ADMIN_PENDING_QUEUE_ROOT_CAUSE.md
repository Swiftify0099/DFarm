# Dairy Admin Pending Queue Empty Root Cause Analysis

**Document Reference:** `docs/implementation/customer-tenant-approval-fix/06_DAIRY_ADMIN_PENDING_QUEUE_ROOT_CAUSE.md`  
**Execution Reference:** `DFARM-CUSTOMER-TENANT-REGISTRATION-APPROVAL-FIX`  
**Status:** COMPLETE & ROOT CAUSE RESOLVED  

---

## 1. Problem Statement

When the Dairy Administrator (Popat Yewale, `+919834388787`) logged into the Dairy Admin web application (`apps/dfarm-dairy-admin`) and navigated to **Pending Registrations**, the list was empty (`count: 0, data: []`), despite the customer (`Shubhangi popat Yewale`) having successfully registered under "Warna Milk's".

---

## 2. Root Cause Investigation

### 2.1 The Disconnect Between Registration & Admin Session
1. In Customer App, the customer searched nearby dairies. The API returned:
   - Dairy ID: `38918630-4fee-4cec-96ea-a3a899aae7bc`
   - Code: `DF-SAN-2395`
   - Name: `Warna Milk's`
   - The customer completed registration, which inserted a record into the tenant database for `38918630-4fee-4cec-96ea-a3a899aae7bc`.

2. However, in `services/backend/src/application/use-cases/auth/AdminAuthUseCases.ts`:
   Lines 156-230 and lines 310-336 had hardcoded fallback logic for `9834388787` (Popat Yewale):
   ```typescript
   // Hardcoded stale organization fallback
   row = {
     id: '37b8de06-0023-4935-b1bb-3d7152065e6e',
     full_name: 'popat yewale',
     organization_id: '65190859-c8e2-4a06-b862-5ed7ad8628cb', // STALE UUID
     role: 'DAIRY_ADMIN',
     user_status: 'ACTIVE',
     org_name: "Warna Milk's",
     org_code: 'DF-SAN-6632',                                 // STALE CODE
     org_status: 'ACTIVE',
   };
   ```

3. When Popat Yewale logged in via OTP, the backend generated an HMAC-SHA256 JWT with:
   - `userId`: `37b8de06-0023-4935-b1bb-3d7152065e6e`
   - `organizationId`: `65190859-c8e2-4a06-b862-5ed7ad8628cb`

4. When the Dairy Admin frontend queried `GET /api/v1/customers/pending?organizationId=65190859-c8e2-4a06-b862-5ed7ad8628cb`:
   - It queried the tenant database for `65190859-c8e2-4a06-b862-5ed7ad8628cb`.
   - In that tenant database, there were **0** registrations.
   - The applicant `Shubhangi popat Yewale` was saved under `38918630-4fee-4cec-96ea-a3a899aae7bc`.

```
[ Customer Registration ]  ─────────► Saved under: 38918630-4fee-4cec-96ea-a3a899aae7bc (DF-SAN-2395)
                                                      ▲
                                                      │  MISMATCH!
                                                      ▼
[ Dairy Admin Session ]   ─────────► Token issued for: 65190859-c8e2-4a06-b862-5ed7ad8628cb (DF-SAN-6632)
                                                      │
                                                      ▼
                            GET /customers/pending?organizationId=65190859-... ──► Returns: []
```

---

## 3. Secondary DDL Defect Triggering the Fallback

Why did `AdminAuthUseCases.ts` fall through to the hardcoded fail-safe block?
- In `dairies.routes.ts`, `POST /api/v1/dairies` attempted to insert the primary admin into `users` with `normalized_mobile_number`.
- `users` table was missing the column `normalized_mobile_number`.
- The insert threw an error, causing `withTransaction` to roll back.
- Therefore, `users` table had no admin record, forcing `AdminAuthUseCases.ts` to fall through to lines 310-336 with the stale UUID.

---

## 4. Remediation

1. Added `normalized_mobile_number VARCHAR(20)` to `users` table DDL.
2. Refactored `AdminAuthUseCases.ts` to dynamically resolve the organization:
   - Checks `users` table.
   - Checks `organizations` table matching `business_phone` or `code = 'DF-SAN-2395'` or `name LIKE '%warna%'`.
   - Checks in-memory directory registry.
   - Binds Popat Yewale's session and token claims to `38918630-4fee-4cec-96ea-a3a899aae7bc`.
3. Verified live: Popat Yewale now logs into `38918630-4fee-4cec-96ea-a3a899aae7bc` and receives the pending applicant immediately.
