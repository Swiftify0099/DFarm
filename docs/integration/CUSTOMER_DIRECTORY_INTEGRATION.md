# DFARM — Customer Directory Integration & Real Record Management

**Document Reference:** `docs/integration/CUSTOMER_DIRECTORY_INTEGRATION.md`  
**Classification:** Database Architecture & Operational Guide  
**Status:** Landed & Verified  

---

## 1. Overview & Problem Remediation

Previously, the Dairy Admin Customer Directory displayed fabricated mock profiles loaded from `mock-server.ts`. This simulated 10 fixed demo customers regardless of which dairy admin was logged in.

The module has been completely re-architected to bind directly to the PostgreSQL `customers` table, strictly partitioned by the authenticated user's `organizationId`.

```
[Dairy Admin UI] 
       │ 
       ▼
 [apiRequest('/customers?includeSoftDeleted=false')]
       │ (Headers: X-Dairy-Tenant-ID: <orgId>)
       ▼
 [Backend Router: customers.routes.ts]
       │
       ▼
 [PostgresCustomerRepository.listCustomers(orgId, filter, includeSoftDeleted)]
       │
       ▼
 [PostgreSQL: SELECT * FROM customers WHERE organization_id = $1 AND is_deleted = FALSE]
```

---

## 2. API Specifications

### 2.1 List Dairy Customers
- **Endpoint:** `GET /api/v1/customers`
- **Query Parameters:**
  - `includeSoftDeleted` (boolean, default: `false`): When `true`, includes archived/soft-deleted accounts.
  - `search` (string, optional): Matches customer full name, farmer code, or mobile number.
  - `category` (string, optional): Filters by `COW` or `BUFFALO`.
- **Tenant Scoping:** Handled through JWT claim `organizationId` or `X-Dairy-Tenant-ID` header.
- **Response Format:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "c1a2b3c4-0000-0000-0000-000000000001",
      "organizationId": "00000000-0000-0000-0000-000000000001",
      "customerCode": "C-101",
      "fullName": "Suresh Tukaram Patil",
      "mobileNumber": "9822114477",
      "fatherOrHusbandName": "Tukaram Patil",
      "status": "ACTIVE",
      "preferredCategory": "COW",
      "village": "Bavada",
      "registrationDate": "2026-11-16",
      "rfidAssigned": true,
      "rfidCardUid": "RFID-E2000019",
      "faceEnrollmentStatus": "ENROLLED",
      "isSoftDeleted": false
    }
  ]
}
```

### 2.2 Customer Soft-Deletion
- **Endpoint:** `POST /api/v1/customers/:id/soft-delete` (or `DELETE /api/v1/customers/:id`)
- **Payload:**
```json
{
  "reason": "Farmer migrated to another cooperative society."
}
```
- **Database Action:**
  ```sql
  UPDATE customers 
  SET is_deleted = TRUE, deletion_reason = $1, status = 'SUSPENDED', updated_at = NOW()
  WHERE id = $2 AND organization_id = $3;
  ```
- **Data Safety Invariant:** Historical milk collection records, double-entry ledger journals, and invoice settlement sheets are **NEVER** deleted. Foreign keys reference `ON DELETE RESTRICT`.

### 2.3 Customer Account Restoration
- **Endpoint:** `POST /api/v1/customers/:id/restore`
- **Database Action:**
  ```sql
  UPDATE customers 
  SET is_deleted = FALSE, deletion_reason = NULL, status = 'ACTIVE', updated_at = NOW()
  WHERE id = $1 AND organization_id = $2;
  ```

---

## 3. UI State & React Query Cache Scoping

In `apps/dfarm-dairy-admin/src/pages/customers/CustomerDirectory.tsx`, the query cache key is explicitly partitioned by the authenticated user's dairy identifier:

```tsx
const { data: customers = [], isLoading } = useQuery({
  queryKey: ['customers', user?.dairyId, showDeleted],
  queryFn: () => api.customers.getAll(showDeleted),
})
```

This prevents any stale customer profiles from leaking into the view when an administrator logs out and a different administrator logs in.
