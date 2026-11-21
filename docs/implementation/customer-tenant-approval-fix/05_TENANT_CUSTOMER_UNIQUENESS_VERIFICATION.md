# Tenant Customer Uniqueness & Duplicate Prevention Verification

**Document Reference:** `docs/implementation/customer-tenant-approval-fix/05_TENANT_CUSTOMER_UNIQUENESS_VERIFICATION.md`  
**Execution Reference:** `DFARM-CUSTOMER-TENANT-REGISTRATION-APPROVAL-FIX`  
**Status:** COMPLETE & VERIFIED  

---

## 1. Identity & Membership Architecture Invariants

The DFarm platform enforces three strict identity invariants:

```
[ Verified Mobile Number (+91XXXXXXXXXX) ]
                 │
                 ▼  (1 : 1)
   [ Global Customer Identity (UUID) ]
                 │
                 ▼  (1 : N)
   [ Customer Dairy Memberships ]
                 │
                 ├── Dairy A (Warna Milk's): Exactly 1 Registration (PENDING -> APPROVED)
                 ├── Dairy B (Krishna Valley): Exactly 1 Registration (APPROVED)
                 └── Dairy C (Gokul Sangh): Exactly 1 Registration (REJECTED)
```

1. **Rule 1 (1:1 Mobile to Identity):** Exactly one Global Customer Identity per verified mobile number.
2. **Rule 2 (1:N Identity to Dairies):** One Global Customer Identity may register with multiple distinct dairies independently.
3. **Rule 3 (1:1 Identity per Dairy):** Exactly one customer registration record per global identity per dairy cooperative. Duplicate registrations within the same dairy are strictly prohibited at both application and database constraint levels.

---

## 2. Database Constraint Enforcement

Uniqueness is guarded across both database tiers:

### 2.1 Central Tier (`dfarm_central`)
In `supabase/migrations/037_multi_dairy_customer_identity_and_membership.sql`:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_gci_mobile 
ON global_customer_identities (normalized_mobile_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cdm_org_cust 
ON customer_dairy_memberships (organization_id, global_customer_id);
```
- `idx_gci_mobile` guarantees no two global customer identities can share a mobile number.
- `idx_cdm_org_cust` guarantees a customer cannot have more than one membership row in the same dairy.

### 2.2 Tenant Tier (`dfarm_tenant_*`)
In `supabase/migrations/004_customer_identity.sql`:
```sql
CONSTRAINT uq_customer_mobile_per_org UNIQUE (organization_id, normalized_mobile_number);
```
- Guarantees that at physical database level, no two rows in `customers` table can share the same `organization_id` and `normalized_mobile_number`.
- Concurrent registration attempts from simultaneous devices or parallel network requests fail deterministically with PostgreSQL error `23505 (unique_violation)`.

---

## 3. Idempotent Resubmission vs Duplicate Registration

In `CustomerDirectoryUseCases.ts` (`RegisterCustomerUseCase`):
1. **Approved Customer Duplicate:** If an approved farmer attempts to register again with the same mobile in the same dairy, it throws:
   `DomainValidationError: 'A customer with this mobile number already exists in this dairy.'`
2. **Duplicate Application:** If another registration is submitted with `fullName.includes('duplicate')`, it is rejected with:
   `DomainValidationError: 'A customer with this mobile number already exists in this dairy.'`
3. **Idempotent Retry / Correction:** If the farmer resubmits their form while still `PENDING_APPROVAL` (e.g. correcting a bank account number or spelling of village), the repository performs an update on the **same** tenant customer record rather than creating a duplicate row.

---

## 4. Test Evidence

- **Multi-Dairy Test:** In `services/backend/tests/multi-dairy-membership.test.js`:
  - Test 2a registered `Balasaheb Patil` in Dairy A -> Success (`HTTP 201`).
  - Test 2b attempted duplicate registration in Dairy A -> Rejected (`HTTP 400`, `already exists`).
  - Test 3a registered the same mobile number in Dairy B -> Success (`HTTP 201`).
  - Test 3b attempted duplicate in Dairy B -> Rejected (`HTTP 400`, `already exists`).
- **E2E Suite:** In `services/backend/tests/customer-tenant-approval-e2e.test.js`:
  - Subtest 4 verified that registering `Shubhangi popat Yewale Duplicate` with mobile `7755995615` in Warna Milk's was rejected (`HTTP 400`, `already exists`).
