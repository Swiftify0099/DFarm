# 08 — NEW DAIRY REGISTRATION WORKFLOW

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Systems:** `apps/dfarm-customer-app/register.tsx`, `CustomerDirectoryUseCases.ts`, Dairy Admin Approval

---

## 1. Multi-Dairy Registration Without Overwriting Existing Accounts

When a customer already registered with Dairy A registers with Dairy B:
1. **Global Identity Reused:**
   The customer's verified E.164 mobile number is resolved against `global_customer_identities`. The existing `globalCustomerId` UUID is reused. No duplicate identity is created.
2. **Independent Tenant Record Created:**
   A new `Customer` record is inserted into Dairy B's physical tenant database (`dfarm_tenant_dairy_b`) with:
   - `organization_id = Dairy B UUID`
   - `global_customer_id = Central UUID`
   - `registration_status = 'PENDING_APPROVAL'`
   - `status = 'INACTIVE'`
3. **Central Routing Record Created:**
   A new row is inserted into `dfarm_central.customer_dairy_memberships` linking `global_customer_id` and `Dairy B UUID`.
4. **Zero Impact on Dairy A:**
   Dairy A's existing operational records, farmer code, approval status, milk collections, and passbook balance remain 100% untouched and active.

---

## 2. Face Biometric Template Linking

- When the customer captures their face during registration with Dairy B:
  - 128-dimensional OpenCV SFace embeddings are generated client-side.
  - The embedding is encrypted using AES-256-GCM.
  - The encrypted vector is stored inside **Dairy B's tenant database** under `face_enrollments`.
  - Biometric templates are **never** shared across different dairies, protecting customer privacy and preventing cross-dairy biometric leakage.

---

## 3. Independent Admin Approval & Notification

1. Dairy B's admin sees the new applicant in their "Pending Approvals" queue (`GET /api/v1/customers/pending`).
2. When Dairy B approves:
   - Assigns Dairy B-specific farmer code (e.g. `C-KRISHNA-204`).
   - Tenant database updates: `registration_status = 'APPROVED'`, `status = 'ACTIVE'`.
   - Central directory updates: `membership_status = 'APPROVED'`, `farmer_code = 'C-KRISHNA-204'`.
3. Customer receives an SMS notification and can now switch to Dairy B immediately from the customer app.
