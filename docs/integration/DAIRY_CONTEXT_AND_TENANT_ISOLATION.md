# DFARM — Dairy Context & Multi-Tenant Isolation Specification

**Document Reference:** `docs/integration/DAIRY_CONTEXT_AND_TENANT_ISOLATION.md`  
**Classification:** Security Architecture & Multi-Tenant Enforcement  
**Status:** Landed & Verified  

---

## 1. Problem Remediation: Removal of Hardcoded Identities

### 1.1 Root Causes Identified
Prior to remediation, the platform had several hardcoded assumptions that broke multi-tenant boundaries:
1. **Hardcoded UI Defaults:** `apps/dfarm-dairy-admin/src/pages/auth/Login.tsx` prefilled phone number `'7755995615'`.
2. **Hardcoded Header Label:** `apps/dfarm-dairy-admin/src/components/layout/Header.tsx` contained static text `"Gokul Primary Cooperative"`, `"GOKUL-01"`, and `"Isolated Dairy Management Platform"`.
3. **Hardcoded Auth Use Case:** `services/backend/src/application/use-cases/auth/AdminAuthUseCases.ts` defaulted any authenticated admin to Gokul's UUID (`00000000-0000-0000-0000-000000000001`).

### 1.2 Remediation Landed
1. **Dynamic Backend Mapping:** `AdminAuthUseCases.ts` now queries the real PostgreSQL `users` table joined with `organizations`:
   ```sql
   SELECT u.id, u.full_name, u.phone_number, u.role, u.organization_id, u.status,
          o.name AS org_name, o.code AS org_code
   FROM users u
   JOIN organizations o ON o.id = u.organization_id
   WHERE u.phone_number = $1 AND u.status = 'ACTIVE'
     AND u.role IN ('DAIRY_ADMIN', 'DAIRY_OWNER', 'PRIMARY_DAIRY_ADMIN');
   ```
2. **Dynamic UI Rendering:** `Header.tsx` binds directly to `user.dairyName` and `user.dairyCode` from the verified session context. If no valid dairy context exists, the application rejects the session and directs the user to login.
3. **Multi-Tenant Headers:** `apps/dfarm-dairy-admin/src/api/client.ts` automatically attaches `X-Dairy-Tenant-ID` and `x-dairy-id` to every outbound request, matching the authenticated session.

---

## 2. Multi-Tenant Cross-Dairy Isolation Matrix

Every resource query and mutation is strictly scoped by `organization_id` on the server:

| Resource Domain | Scoping Column | Server-Side Enforcement Policy |
| :--- | :--- | :--- |
| **Customers** | `customers.organization_id` | `WHERE organization_id = $organizationId` |
| **Registrations** | `customers.organization_id` | `WHERE organization_id = $organizationId AND registration_status = 'PENDING_APPROVAL'` |
| **Face Templates** | `customers.organization_id` | `JOIN customers c ON c.id = fe.customer_id WHERE c.organization_id = $organizationId` |
| **RFID Cards** | `rfid_cards.organization_id` | `WHERE organization_id = $organizationId` |
| **RFID Assignments** | `rfid_card_assignments.center_id` | Verified against dairy center belonging to the admin's organization |
| **Collection Sessions** | `kiosk_shift_sessions.organization_id`| `WHERE organization_id = $organizationId` |
| **Milk Collections** | `customers.organization_id` | Verified before intake; cross-dairy intake returns `403 Forbidden` |
| **Ledger Entries** | `customers.organization_id` | `JOIN customers c ON c.id = cle.customer_id WHERE c.organization_id = $organizationId` |
| **Monthly Bills** | `monthly_bills.organization_id` | `WHERE organization_id = $organizationId` |
| **Feed Products** | `feed_products.organization_id` | `WHERE organization_id = $organizationId` |
| **Staff & Users** | `users.organization_id` | `WHERE organization_id = $organizationId` |

---

## 3. Verified Multi-Dairy Seeded Accounts

The platform is seeded and verified with independent, authorized dairy administrators:

| Dairy Name | Dairy Code | Organization ID | Admin Mobile | Admin Name |
| :--- | :--- | :--- | :--- | :--- |
| **Shree Krishna Sahakari Dudh Sanstha** | `SKDS-01` | `00000000-0000-0000-0000-000000000001` | `+91 9822987111` | Primary Dairy Admin (Krishna) |
| **Warna Milk Producers Cooperative** | `WARNA-01` | `00000000-0000-0000-0000-000000000002` | `+91 9822987222` | Primary Dairy Admin (Warna) |
| **Sahyadri Dairy Cooperative Society** | `DF-KOP-0118` | `00000000-0000-0000-0000-000000000003` | `+91 9822987333` | Primary Dairy Admin (Sahyadri) |
| **Kalpna Dudh Vyavasay Sanstha** | `DF-SAN-8897` | `00000000-0000-0000-0000-000000000004` | `+91 9834388787` | Primary Dairy Admin (Kalpna) |

When logging in as Warna (`+91 9822987222`), Dairy Admin renders `Warna Milk Producers Cooperative` (`WARNA-01`) and exclusively lists Warna customers and collection sessions. Zero Gokul or Krishna data is accessible.
