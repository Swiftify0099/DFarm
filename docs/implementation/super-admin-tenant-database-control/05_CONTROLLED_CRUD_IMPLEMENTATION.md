# DFARM — Module 3: Controlled Table-Level CRUD Implementation

**Execution Reference:** `DFARM-SUPER-ADMIN-TENANT-DATABASE-CONTROL`  
**Backend Service:** `services/backend/src/infrastructure/database/TenantDatabaseControlService.ts`  
**Status:** FULLY IMPLEMENTED AND VERIFIED  

---

## 1. Principles of Controlled CRUD

The Super Admin Console is a precision administrative environment. Uncontrolled, arbitrary SQL execution or unrestricted bulk updates risk destroying tenant data integrity and breaking financial invariants.

Therefore, DFarm implements **Controlled CRUD**:
1. **Data Classification Enforcement:** CRUD operations are strictly mediated by table classification (Category A, B, C, D).
2. **Mandatory Audit Trail:** Every insert, update, or soft-delete requires an explicit administrative reason and captures the actor identity, timestamp, before-state, and after-state in `platform_audit_logs`.
3. **Double-Entry Financial Immutability:** Financial ledger accounts, journal entries, billing periods, and monthly bills strictly reject direct administrative UPDATE and DELETE.
4. **Soft-Delete by Default:** Tables with lifecycle status columns (`status`, `is_deleted`) are updated to `status = 'INACTIVE'` or `is_deleted = TRUE` rather than dropping physical rows.

---

## 2. API Routes & Method Implementation

### 2.1 Controlled Insert
- **Route:** `POST /api/v1/super-admin/tenants/:dairyId/database/tables/:tableName/records`
- **Payload:** `{ data: { ... }, reason: "Super Admin seed" }`
- **Validation:**
  - Rejects Category C (Financial) and Category D (Security).
  - Validates all columns against catalog schema.
  - Generates UUID `id` if omitted.
  - Sets `created_at` and `updated_at`.
  - Records `CONTROLLED_RECORD_INSERT` audit event.

### 2.2 Controlled Update
- **Route:** `PUT /api/v1/super-admin/tenants/:dairyId/database/tables/:tableName/records/:recordId`
- **Payload:** `{ updates: { ... }, reason: "Configuration adjustment" }`
- **Validation:**
  - Strictly rejects Category C (`Direct update on immutable financial table '...' is prohibited`).
  - Strictly rejects Category D (`Direct update on sensitive security table '...' is prohibited`).
  - Fetches existing row to capture before-state.
  - Applies parameterized update with `updated_at = NOW()`.
  - Records `CONTROLLED_RECORD_UPDATE` audit event with before/after state diffs.

### 2.3 Controlled Soft Delete
- **Route:** `DELETE /api/v1/super-admin/tenants/:dairyId/database/tables/:tableName/records/:recordId`
- **Payload:** `{ reason: "Branch consolidation" }`
- **Validation:**
  - Strictly rejects Category C and Category D.
  - If table contains `is_deleted` column: executes `UPDATE table SET is_deleted = TRUE, deleted_at = NOW()`.
  - If table contains `status` column: executes `UPDATE table SET status = 'INACTIVE'`.
  - Records `CONTROLLED_RECORD_DELETE` audit event.

---

## 3. UI Implementation in TenantDatabaseManagerPage

1. **Insert Record Modal:** Opens JSON editor with column guidance and mandatory "Audit Justification" input.
2. **Edit Record Modal:** Pre-populates existing row attributes, prompts for audit reason, and validates JSON syntax before dispatching.
3. **Delete Confirmation Modal:** Displays a red warning banner highlighting data preservation policies and requires a justification.
4. **Disabled State Indicators:** Action buttons for Category C and Category D tables are visually disabled with informative tooltips.
