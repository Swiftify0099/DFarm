# 04 — CENTRAL MEMBERSHIP DIRECTORY SPECIFICATION

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Systems:** `dfarm_central.customer_dairy_memberships`, `PostgresCustomerMembershipRepository`

---

## 1. Directory Purpose & Boundary

The central membership directory acts strictly as a **lightweight routing and discovery index**. It serves the Customer App immediately after OTP verification to answer:
*"Which dairy accounts belong to this phone number, and what is their current status?"*

### Permitted Data Fields in Central Directory
- `global_customer_id`: Canonical human identifier.
- `organization_id`: Organization UUID of the dairy cooperative.
- `tenant_customer_id`: Local primary key of the customer record in the tenant database.
- `farmer_code`: Dairy-assigned producer identifier (e.g. `C-WARNA-101`).
- `membership_status`: Lifecycle status (`APPROVED`, `PENDING_APPROVAL`, `REJECTED`, `SUSPENDED`).
- `dairy_name`: Cooperative display name for offline UI rendering.
- `dairy_code`: Cooperative code (e.g. `WARNA-01`).
- `center_id` & `center_name`: Primary collection center for display.
- `last_synchronized_at`: Timestamp of last sync from tenant DB.

### Strictly Prohibited from Central Directory
- ❌ Milk collection weights, FAT/SNF readings, rate amounts.
- ❌ Farmer passbook ledger entries or running balances.
- ❌ Bank account numbers, IFSC codes, bank names.
- ❌ Biometric templates or facial embeddings.
- ❌ Monthly bills or payment disbursement records.

---

## 2. Directory Query Performance

```sql
SELECT 
    id, global_customer_id, organization_id, tenant_customer_id,
    farmer_code, membership_status, dairy_name, dairy_code,
    dairy_address, center_id, center_name, created_at, updated_at
FROM customer_dairy_memberships
WHERE global_customer_id = $1
ORDER BY created_at ASC;
```

With index `idx_memberships_global_cust`, query execution time is `< 2ms`, ensuring that the customer app loads the "Select Dairy" screen immediately upon OTP verification.

---

## 3. Two-Way State Synchronization

1. **On Customer Registration:**
   `RegisterCustomerUseCase` writes the local customer record to the tenant DB and atomically registers the membership in `customer_dairy_memberships` with status `PENDING_APPROVAL`.
2. **On Dairy Admin Approval / Rejection:**
   `ApproveCustomerUseCase` and `RejectCustomerUseCase` update the tenant customer record (`registration_status = 'APPROVED' | 'REJECTED'`) and call `membershipRepo.updateMembershipStatus(...)` to update the central directory in real-time.
