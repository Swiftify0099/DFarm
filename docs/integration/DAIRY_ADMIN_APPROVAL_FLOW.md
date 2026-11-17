# DFARM — DAIRY ADMIN APPROVAL WORKFLOW SPECIFICATION

**Authoritative Technical Document**  
**Component Scope**: DFarm Dairy Admin Web → API Bridge → Isolated Tenant Database  
**Lifecycle Stage**: Registration Review, Farmer Code Assignment, Approval / Rejection Audit

---

## 1. Pending Registrations Query Architecture

The Dairy Admin portal strictly isolates applicant data based on the authenticated administrator's dairy membership:

```
[Dairy Admin Browser]
       │
       ├─► HTTP GET /api/v1/customers/pending?organizationId=<dairyId>
       │   Headers: Authorization: Bearer <JWT>, X-Dairy-Id: <dairyId>
       │
       ▼
[Backend Express Router (customers.routes.ts)]
       │
       ├─► Resolves Tenant Operational Database via tenantDbManager.getTenantDb(organizationId)
       ├─► Queries customers table: WHERE organization_id = $1 AND registration_status = 'PENDING_APPROVAL'
       ├─► Hydrates permittedCategories from customer_milk_categories
       ├─► Hydrates faceCapture status from face_enrollments
       │
       ▼
[Response JSON Payload]
       │
       └─► Returns array of pending applications to TanStack Query ['pendingRegistrations', dairyId]
```

---

## 2. Admin Review Surface & Decision Metrics

The Dairy Admin interface (`PendingApprovals.tsx`) displays complete applicant metadata before approval:

| Inspection Area | Metadata Displayed to Dairy Admin | Verification Criteria |
| :--- | :--- | :--- |
| **Applicant Identity** | Candidate Full Name, Normalized Mobile (`+91XXXXXXXXXX`) | Matches government ID or local verification |
| **Location & Center** | Village / Town, Assigned Collection Center | Falls within dairy operational catchment area |
| **Supply Animals** | Cow Milk, Buffalo Milk, or Both | Validates infrastructure for requested animal type |
| **Bank Account** | Account Number, Bank Name, IFSC Code | Format validated for automated direct payments |
| **Face Biometric** | Model: `YuNet + SFace INT8` (128-D), Quality Score, Status | Ensures valid embedding exists and meets quality threshold (>= 90%) |

---

## 3. The Approval Action (`POST /api/v1/customers/:id/approve`)

When the Dairy Admin clicks **"Approve Farmer"**:

1. **Farmer Code Allocation**:
   - The Dairy Admin assigns an official farmer code (e.g., `GOK-108`) or allows the system to auto-increment from `C-101`.
2. **Atomic Status Mutation**:
   ```typescript
   customer.approveRegistration(assignedCode);
   // Sets status = 'ACTIVE'
   // Sets registrationStatus = 'APPROVED'
   // Sets farmerCode = assignedCode
   await customerRepo.save(customer);
   ```
3. **Biometric Activation**:
   The enrolled face template status is transitioned from `'PENDING_APPROVAL'` to `'ACTIVE'` in the isolated tenant database:
   ```sql
   UPDATE face_enrollments SET status = 'ACTIVE' WHERE customer_id = $1;
   ```
4. **Audit Trail Logging**:
   An immutable entry is appended to `customer_status_history`:
   ```sql
   INSERT INTO customer_status_history (
     customer_id, previous_status, new_status, change_reason, changed_by
   ) VALUES ($1, 'PENDING_APPROVAL', 'APPROVED', 'Registration approved by Admin', $2);
   ```
5. **Customer App Synchronization**:
   The farmer's mobile app immediately reflects `APPROVED` status via `GET /api/v1/customers/status`, unlocking the farmer profile and delivery eligibility.

---

## 4. The Rejection Action (`POST /api/v1/customers/:id/reject`)

When the Dairy Admin clicks **"Reject Application"**:

1. **Audit Reason Requirement**:
   The admin must provide a mandatory non-empty rejection reason (e.g., `"Address outside cooperative collection radius"`, `"Duplicate bank account"`).
2. **Atomic Status Mutation**:
   ```typescript
   customer.rejectRegistration(reason);
   // Sets status = 'INACTIVE'
   // Sets registrationStatus = 'REJECTED'
   // Sets rejectionReason = reason
   await customerRepo.save(customer);
   ```
3. **Audit Trail Logging**:
   Records rejection timestamp, operator identity, and mandatory reason in `customer_status_history`.
4. **Customer App Notification**:
   The farmer's app displays rejection feedback and reason, allowing corrective re-application if applicable.

---

## 5. Cache Invalidation & UI Reactivity

Upon completion of either mutation, `dfarm-dairy-admin` triggers multi-key query invalidation:

```typescript
queryClient.invalidateQueries({ queryKey: ['pendingRegistrations', user?.dairyId] });
queryClient.invalidateQueries({ queryKey: ['customers', user?.dairyId] });
queryClient.invalidateQueries({ queryKey: ['dashboardSummary', user?.dairyId] });
```

This immediately updates:
- The **Sidebar Badge counter** across all administrative navigation pages.
- The **Dashboard Summary card** (`pendingApprovals` decrements, `activeCustomers` increments).
- The **Customer Directory table**, immediately surfacing the approved farmer with their assigned code.
