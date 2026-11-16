# DFarm — Customer Dairy Registration Association

## Complete Workflow

```
Customer Opens Registration
       │
       ▼
Auto-Detect GPS Location (expo-location)
       │
       ▼
GET /api/v1/dairies/nearby?lat=X&lng=Y&radiusKm=5
       │
       ▼
Haversine SQL search against organizations table
       │
       ▼
Customer sees nearby dairies sorted nearest-first
       │
       ▼
Customer selects Dairy (e.g., "kalpna mlik's")
       │
       ▼
Navigate to /(onboarding)/register with params:
{ dairyId: selectedDairy.id, dairyName, village, mobileNumber }
       │
       ▼
Customer enters details + accepts biometric consent
       │
       ▼
Navigate to /(onboarding)/face-capture
       │
       ▼
YuNet face detection + SFace embedding extraction (128-dim vector)
       │
       ▼
Submit registration to backend:
POST /api/v1/customers
Headers: X-Dairy-Id: <selectedDairy.id>
Body: {
  fullName: "...",
  mobileNumber: "...",
  organizationId: "<selectedDairy.id>",
  primaryCenterId: "<centerId>",
  permittedCategories: ["COW"],
  faceVector: [ ...128 floats... ]
}
       │
       ▼
Backend creates customer record:
  - customers.organization_id = selectedDairy.id
  - customers.registration_status = 'PENDING_APPROVAL'
  - face_enrollments encrypted with AES-256-GCM + AAD
       │
       ▼
Dairy Admin Dashboard:
  - Admin logs in for that organization
  - Sees registration in Pending Approvals list
  - Clicks "Approve" → customer assigned farmer code (e.g. C-101)
  - customers.registration_status = 'APPROVED'
  - face_enrollments.status = 'ACTIVE'
       │
       ▼
Collection App:
  - Milk collection operator selects that dairy center
  - App syncs approved customers for that organization only
  - Farmer appears in biometric contactless intake queue
```

---

## Security & Tenant Isolation

### 1. Dairy ID Source of Truth
The `dairyId` is taken directly from the verified `Dairy` object returned by the `/nearby` endpoint — never from user-typed text. The `register.tsx` form receives it as a route parameter and cannot modify it.

### 2. Multi-Tenant Isolation
All customer tables enforce tenant isolation:
- `customers.organization_id` — mandatory foreign key to `organizations.id`
- `face_enrollments.customer_id` → `customers.id` (strictly scoped to the organization)
- `customer_ledger.organization_id` — financial isolation
- `milk_collections.organization_id` — collection isolation

### 3. Cross-Dairy Prevention
When Dairy Admin A logs into Dairy A's dashboard:
- Query uses `WHERE organization_id = $session_dairy_id`
- Customers registered under Dairy B are invisible to Dairy Admin A
- Approving a customer is only permitted if `customer.organization_id == admin.organization_id`

### 4. Collection App Isolation
The Collection App uses `GET /api/v1/customers?organizationId=X&centerId=Y`. Customers belonging to other dairies are never synced to the device.
