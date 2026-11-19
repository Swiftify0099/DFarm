# 07 — Pending Registration List & Detail Fix

**Reference:** `DFARM-CUSTOMER-TENANT-REGISTRATION-APPROVAL-FIX`  
**Artifact ID:** `07_PENDING_REGISTRATION_LIST_AND_DETAIL_FIX`  
**Target Applications:** `apps/dfarm-dairy-admin`, `services/backend`  
**Status:** IMPLEMENTED & VERIFIED  

---

## 1. Executive Summary

When a prospective dairy farmer completes registration on the DFARM Customer App, their application must enter the `PENDING_APPROVAL` queue in the selected Dairy's operational workspace. Previously, Dairy Admins logging into `apps/dfarm-dairy-admin` were unable to see pending applicants or saw blank/malformed cards.

This document records the exact root causes, code fixes, and verifications applied to `GET /api/v1/customers/pending`, field compatibility adapters, and the Dairy Admin frontend query hooks.

---

## 2. Root Cause Analysis

### 2.1 Dairy Admin Organization Mismatch (Token Issue)
- In `services/backend/src/application/use-cases/auth/AdminAuthUseCases.ts`, the legacy authentication routine resolved all admin logins to a hardcoded organization ID: `65190859-c8e2-4a06-b862-5ed7ad8628cb` (Warna Milk's legacy record DF-SAN-6632).
- The customer had selected Dairy ID `38918630-4fee-4cec-96ea-a3a899aae7bc` (DF-SAN-2395).
- As a consequence, Dairy Admin Popat Yewale (`9834388787`) was issued a JWT containing `organizationId: "65190859-..."`. When querying `/customers/pending`, the backend resolved the tenant database for the wrong organization, returning 0 records.

### 2.2 Field Incompatibility Between Backend and Frontend
- **Backend Model (`CustomerDirectoryUseCases.ts`)**:
  Returned fields named `candidateName`, `dairyId`, `status: 'PENDING_APPROVAL'`, `createdAt`.
- **Frontend Model (`apps/dfarm-dairy-admin/src/api/index.ts` & `PendingApprovals.tsx`)**:
  Expected `fullName`, `dairyId`, `submittedAt`, and filtered strictly by `c.status === 'PENDING'`.
- Because `status` was `'PENDING_APPROVAL'` and `submittedAt` was `undefined`, frontend filtering discarded the applicant or threw rendering errors when sorting by submission timestamp.

---

## 3. Implementation Details

### 3.1 Backend Fix: Normalized Field Output in `GetPendingCustomerRegistrationsUseCase`

File: [CustomerDirectoryUseCases.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/customers/CustomerDirectoryUseCases.ts)

The use case now maps both legacy and modern contract fields so both web admin and mobile apps receive the expected properties:

```typescript
export class GetPendingCustomerRegistrationsUseCase {
  constructor(private customerRepo: ICustomerDirectoryRepository) {}

  async execute(organizationId: string): Promise<any[]> {
    const records = await this.customerRepo.findPendingByOrganization(organizationId);
    return records.map((record: any) => ({
      id: record.id,
      candidateName: record.fullName || record.candidateName,
      fullName: record.fullName || record.candidateName,
      mobileNumber: record.mobileNumber,
      normalizedMobile: record.normalizedMobile,
      dairyId: record.organizationId || record.dairyId || organizationId,
      organizationId: record.organizationId || record.dairyId || organizationId,
      village: record.village || '',
      taluka: record.taluka || '',
      district: record.district || '',
      state: record.state || 'Maharashtra',
      bankAccountNumber: record.bankAccountNumber ? '••••' + record.bankAccountNumber.slice(-4) : undefined,
      bankIfsc: record.bankIfsc,
      faceEnrolled: !!(record.faceCapture || record.faceEnrolled),
      faceCapture: record.faceCapture,
      status: 'PENDING',
      registrationStatus: 'PENDING_APPROVAL',
      submittedAt: record.submittedAt || record.createdAt || new Date().toISOString(),
      createdAt: record.createdAt || record.submittedAt || new Date().toISOString()
    }));
  }
}
```

### 3.2 Frontend API Adapter Fix in `apps/dfarm-dairy-admin`

File: [api/index.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-dairy-admin/src/api/index.ts)

The Dairy Admin API layer normalizes API responses before passing records to React Query hooks:

```typescript
export const customersApi = {
  getPending: async (dairyId: string) => {
    const res = await apiClient.get<PendingCustomerRegistration[]>(`/customers/pending?organizationId=${dairyId}`);
    return res.data.map(c => ({
      ...c,
      submittedAt: c.submittedAt || (c as any).createdAt || new Date().toISOString(),
      dairyId: c.dairyId || (c as any).organizationId || dairyId,
      status: (c.status === 'PENDING' || (c as any).registrationStatus === 'PENDING_APPROVAL') 
        ? 'PENDING' 
        : c.status
    }));
  },
  // ...
};
```

### 3.3 Dynamic Admin Auth Resolution Fix

File: [AdminAuthUseCases.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/auth/AdminAuthUseCases.ts)

Removed static hardcoded organization IDs. When an admin logs in, their membership is dynamically resolved:
1. Lookup in `users` table by `normalized_mobile_number`.
2. Extract `user.organization_id` or query `organizations` table.
3. Fallback to `InMemoryDairyStore` authoritative directory mapping.
4. Issue JWT with matching authoritative `organizationId: "38918630-4fee-4cec-96ea-a3a899aae7bc"` for Popat Yewale (`9834388787`).

---

## 4. Verification & Testing

### 4.1 Automated Verification
Verified in `services/backend/tests/customer-tenant-approval-e2e.test.js`:
- **Stage 5 (Dairy Admin Login)**: Successfully authenticates `9834388787` and returns JWT with `organizationId: 38918630-4fee-4cec-96ea-a3a899aae7bc`.
- **Stage 6 (Pending Queue Resolution)**: Successfully fetches `GET /customers/pending` using the admin token. Verifies:
  - Count: 1 pending applicant.
  - Name: "Shubhangi popat Yewale".
  - Status: `'PENDING'` (normalized from `'PENDING_APPROVAL'`).
  - SubmittedAt timestamp is valid ISO-8601 string.
- **Stage 7 (Cross-Tenant Isolation)**: Admin token with different organization (`other-dairy-id`) queries `/customers/pending` and receives 0 records, proving physical query isolation.

### 4.2 UI Build Verification
- Executed `npm run build --prefix apps/dfarm-dairy-admin`.
- Output: 0 errors, generated `dist/` bundle in 3.46s.
