# DFARM — Operator Registration and Onboarding Fix

**Execution Reference:** `DFARM-COLLECTION-OPERATOR-AUTHORIZATION-FIX`  
**Document:** `05_OPERATOR_REGISTRATION_AND_ONBOARDING_FIX.md`  
**Date:** 2026-11-20  
**Status:** IMPLEMENTED & DEPLOYED  

---

## 1. Overview

To solve the operator registration deficit permanently, the staff onboarding capability was engineered end-to-end across the backend API, Dairy Admin API bridge, and Dairy Admin React interface.

---

## 2. Backend Implementation (`staff.routes.ts`)

Mounted at `/api/v1/staff`, the router exposes:

### 2.1 `POST /api/v1/staff` — Onboard Staff / Operator
- **Authentication:** Required (`authenticate` middleware).
- **Authorization:** Restrictive check:
  ```ts
  const allowedActorRoles = ['SUPER_ADMIN', 'PRIMARY_DAIRY_ADMIN', 'DAIRY_ADMIN', 'DAIRY_OWNER'];
  if (!allowedActorRoles.includes(caller.role)) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  ```
- **Validation:**
  - `fullName`: Minimum 2 non-whitespace characters.
  - `mobileNumber`: Normalized through `PhoneNumber` class into canonical E.164 (`+91XXXXXXXXXX`) and 10-digit clean string.
  - `role`: Restricted to allowed staff roles (`COLLECTION_OPERATOR`, `SHIFT_SUPERVISOR`, `ACCOUNTANT`, `CENTER_MANAGER`). Self-promotion or elevation to `SUPER_ADMIN` is prevented.
  - `centerId`: Validated against `dairy_centers` scoped strictly to `caller.organizationId`.
- **Duplicate Handling:**
  - If a user with the same mobile number is already an active operator in the same Dairy, returns `409 Conflict`.
  - If the user exists centrally from a previous membership, cleanly associates the new role and center assignment to this Dairy.

### 2.2 `GET /api/v1/staff/centers` — Active Centers Discovery
- Exposes all active collection centers for the authenticated Dairy so the UI can populate the center selection dropdown dynamically.

### 2.3 `PATCH /api/v1/staff/:id/status` — Status Management
- Toggles operator status between `ACTIVE` and `SUSPENDED`.
- Propagates suspension immediately to both central and tenant databases, instantly revoking kiosk login ability.

---

## 3. Dairy Admin Frontend Implementation

### 3.1 API Client Extensions (`apps/dfarm-dairy-admin/src/api/index.ts`)
```ts
staff: {
  getAll: async (): Promise<StaffMember[]> => { ... },
  getCenters: async (): Promise<{ id: string; code: string; name: string }[]> => {
    const res = await apiRequest<{ success: boolean; data: any[] }>('/staff/centers')
    return Array.isArray(res.data) ? res.data : []
  },
  create: async (data: { ... }): Promise<{ success: boolean; data?: StaffMember }> => {
    return apiRequest('/staff', { method: 'POST', body: JSON.stringify(data) })
  },
  updateStatus: async (id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<any> => {
    return apiRequest(`/staff/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  },
}
```

### 3.2 UI Component (`apps/dfarm-dairy-admin/src/pages/staff/StaffManagement.tsx`)
1. **Interactive Header Actions:**
   - **Refresh Button:** Re-triggers TanStack query for live staff listing.
   - **Onboard Operator Button:** Opens the `ClayModal` registration dialog.
2. **Onboarding Modal Form:**
   - Operator Full Name (input)
   - 10-digit Mobile Number with `+91` prefix addon (input)
   - Role Assignment (Select: Collection Operator, Shift Supervisor, Center Manager, Accountant)
   - Assigned Center (Select: Dynamically loaded from `/staff/centers`)
   - Counter / Terminal Name (input, e.g. "Counter 1")
   - Email Address (optional)
   - Submit Button with real-time validation and loading state.
3. **Table Enhancements:**
   - Staff member name and mobile number with phone icon.
   - Assigned role badge (`approved` for admin, `pending` for collection operator).
   - Assigned center & counter badge.
   - Granular permission chips.
   - Status badge (Active Operator / Suspended).
   - Action toggle: `Suspend` / `Activate` button with immediate visual feedback.
