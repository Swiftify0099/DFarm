# Super Admin Permanent Dairy Deletion & Deprovisioning

**Document:** `07-super-admin-dairy-deletion.md`  
**Monorepo Track:** DFarm Multi-Tenant Enterprise Architecture  
**Scope:** Permanent Dairy Deletion, physical PostgreSQL teardown, safety boundaries, and UI step-up confirmation.

---

## 1. Requirements & Safety Policy

When a Super Administrator initiates a permanent Dairy deletion:
1. **Physical Teardown:** The Dairy's independent physical PostgreSQL database (`dfarm_tenant_<code_hash>`) must be completely and irreversibly deprovisioned.
2. **Tenant Data Purge:** All tenant-specific master profiles, biometrics (`face_enrollments`), RFID cards, milk intake transactions, double-entry ledger entries, bills, and payouts must be destroyed with the database.
3. **Global Customer Preservation:** **NEVER delete global customer identities (`global_customer_identities`)** or other Dairy memberships. If Customer Pankaj belongs to Dairy A and Dairy B, deleting Dairy A must leave Dairy B 100% operational.
4. **Code Release for Clean Re-onboarding:** The unique Dairy Code (e.g., `SAHYADRI_01`) must be released so a future Dairy can register with that code without encountering unique constraint collisions.
5. **Accidental Deletion Prevention:** Step-up typing confirmation is mandatory. The Super Admin must type the exact Dairy code to unlock the deletion action.

---

## 2. Backend Deletion Architecture

The permanent deprovisioning sequence is implemented in `TenantDatabaseManager.deprovisionTenantDatabase(dairyId)`:

```
[ Super Admin Request ]
         │ (Includes confirmDairyCode)
         ▼
[ Authentication & Super Admin RBAC Check ]
         │
         ▼
[ Step-Up Confirmation Verification ] (org.code === confirmDairyCode)
         │
         ▼
[ 1. Pool Eviction ] ────► Close and drain tenant connection pool & memory cache
         │
         ▼
[ 2. Terminate Backends ] ─► SELECT pg_terminate_backend(pid) FROM pg_stat_activity...
         │
         ▼
[ 3. DROP DATABASE ] ────► DROP DATABASE IF EXISTS "<db_name>" WITH (FORCE);
         │
         ▼
[ 4. Central Cleanup ] ──► DELETE FROM customer_dairy_memberships WHERE organization_id = $1;
         │                 DELETE FROM dairy_database_mappings WHERE dairy_id = $1;
         │                 DELETE FROM users WHERE organization_id = $1;
         ▼
[ 5. Release Code ] ─────► UPDATE organizations SET status = 'INACTIVE', code = 'DEL_<id_slice>'
```

### Route Specifications:
- `DELETE /api/v1/dairies/:dairyId/deprovision`
- `DELETE /api/v1/dairies/:dairyId`
- **Headers:** `Authorization: Bearer <superAdminToken>`
- **Body:** `{ "confirmDairyCode": "SAHYADRI_01" }`

---

## 3. Super Admin UI Implementation

The permanent deletion interface is implemented in `apps/dfarm-super-admin`:

1. **Delete Dairy Modal (`apps/dfarm-super-admin/src/features/dairies/DeleteDairyModal.tsx`):**
   - High-contrast warning banner (amber/red).
   - Lists all resources that will be permanently destroyed (PostgreSQL database, biometric templates, milk collections, financial ledger).
   - States explicitly that global customer accounts and other dairies will remain unaffected.
   - Text input requiring the Super Admin to type the exact Dairy Code.
   - Delete button is disabled until the code matches character-for-character.
2. **Page Integrations:**
   - `DairyDetailPage.tsx`: Red "Delete Dairy" button in the header actions bar.
   - `DairyListPage.tsx`: Trash icon action in the dairy table row.
3. **API Client (`apps/dfarm-super-admin/src/api/client.ts`):**
   - Method: `deprovisionDairy({ dairyId, confirmDairyCode }, actor)`.

---

## 4. Verification in Automated E2E Test

In `customer-data-lifecycle-e2e.test.js` Step 8:
- Super Admin invoked `DELETE /api/v1/dairies/${dairyAId}/deprovision` with `{ confirmDairyCode: 'SAHYADRI_01' }`.
- Status: **HTTP 200 OK**.
- **Central Membership Verification:** Dairy A membership removed; Dairy B membership remained intact (`memberships.length === 1`).
- **Global Identity Verification:** `findGlobalIdentityByPhone('+919876543210')` returned existing record with `id === globalId` (PRESERVED).
- **Dairy B Operational Verification:** Querying `GET /api/v1/customers/me` with Dairy B token returned `fullName = 'Pankaj Patil'`, `dairyName = 'Krishna Valley Milk Producers'`, `farmerCode = 'K-405'`.
