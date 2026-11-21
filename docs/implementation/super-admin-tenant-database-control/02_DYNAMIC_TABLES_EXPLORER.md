# DFARM — Module 2.2: Dynamic Tenant Tables Explorer

**Execution Reference:** `DFARM-SUPER-ADMIN-TENANT-DATABASE-CONTROL`  
**Backend Service:** `services/backend/src/infrastructure/database/TenantDatabaseControlService.ts`  
**API Endpoint:** `GET /api/v1/super-admin/tenants/:dairyId/database/tables`  
**Status:** FULLY IMPLEMENTED AND VERIFIED  

---

## 1. Objective & Technical Design

The Tenant Tables Explorer dynamically reads the live PostgreSQL system catalog (`information_schema.tables`, `information_schema.columns`, `pg_tables`) for the selected tenant database.

### Strict Non-Negotiable Constraints:
- **No Hardcoded Table Lists:** The UI and backend never assume or hardcode a static list of tables; every physical table and view existing in the `public` schema of that tenant database is enumerated dynamically.
- **Accurate Real Row Counts:** Row counts are evaluated safely using indexed bounded queries (`SELECT COUNT(*) FROM "table"`).
- **Metadata Extraction:** For every discovered table, the system catalog extracts primary keys (`information_schema.table_constraints`), foreign keys, column counts, and estimated on-disk storage size.
- **Zero Record Transparency:** If a table contains zero records, it is displayed with an explicit count of `0`.

---

## 2. Dynamic Discovery Architecture

### 2.1 Backend Discovery Query
In `TenantDatabaseControlService.ts`:
```ts
public async listTables(dairyId: string): Promise<TableSummary[]> {
  const { client } = await this.getTenantContext(dairyId);

  let tableRows: { table_name: string; table_type: string }[] = [];
  try {
    const res = await client.query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name ASC;
    `);
    tableRows = res.rows;
  } catch {
    const res = await client.query(`
      SELECT tablename as table_name, 'BASE TABLE' as table_type
      FROM pg_tables
      WHERE schemaname = 'public';
    `);
    tableRows = res.rows;
  }
  ...
}
```

### 2.2 Table Metadata Discovered
For each discovered table, `listTables` aggregates:
- `tableName`: Canonical SQL identifier.
- `schemaName`: 'public'.
- `rowCount`: Evaluated real count.
- `columnCount`: Total schema columns.
- `primaryKey`: Array of PK column names.
- `foreignKeys`: Referenced foreign tables and constraint names.
- `tableSize`: Evaluated disk usage estimate.
- `category`: DFarm 4-tier data classification (`CATEGORY_A`, `CATEGORY_B`, `CATEGORY_C`, `CATEGORY_D`).
- `accessMode`: Operational mode (`CONTROLLED_CRUD`, `IMMUTABLE_FINANCIAL`, `SECURITY_PROTECTED`, `LIFECYCLE_ACTION_ONLY`, `READ_ONLY`).
- `isView`: Boolean indicating virtual view vs physical base table.

---

## 3. Discovered Core Table Inventory (Sample)

| Table Name | Catalog Type | Data Category | Access Mode | Primary Key |
|---|---|---|---|---|
| `organizations` | BASE TABLE | Category A | `CONTROLLED_CRUD` | `id` |
| `dairy_centers` | BASE TABLE | Category A | `CONTROLLED_CRUD` | `id` |
| `users` | BASE TABLE | Category B | `LIFECYCLE_ACTION_ONLY` | `id` |
| `customers` | BASE TABLE | Category B | `LIFECYCLE_ACTION_ONLY` | `id` |
| `rfid_cards` | BASE TABLE | Category B | `LIFECYCLE_ACTION_ONLY` | `id` |
| `face_biometric_templates` | BASE TABLE | Category D | `SECURITY_PROTECTED` | `id` |
| `rate_charts` | BASE TABLE | Category A | `CONTROLLED_CRUD` | `id` |
| `kiosk_shift_sessions` | BASE TABLE | Category B | `LIFECYCLE_ACTION_ONLY` | `id` |
| `collection_transactions` | BASE TABLE | Category B | `LIFECYCLE_ACTION_ONLY` | `id` |
| `customer_ledger_accounts` | BASE TABLE | Category C | `IMMUTABLE_FINANCIAL` | `id` |
| `ledger_transactions` | BASE TABLE | Category C | `IMMUTABLE_FINANCIAL` | `id` |
| `billing_periods` | BASE TABLE | Category C | `IMMUTABLE_FINANCIAL` | `id` |
| `monthly_bills` | BASE TABLE | Category C | `IMMUTABLE_FINANCIAL` | `id` |
| `customer_payouts` | BASE TABLE | Category C | `IMMUTABLE_FINANCIAL` | `id` |
| `feed_products` | BASE TABLE | Category A | `CONTROLLED_CRUD` | `id` |
| `feed_inventory` | BASE TABLE | Category A | `CONTROLLED_CRUD` | `id` |
| `tenant_metadata` | BASE TABLE | Category A | `READ_ONLY` | `id` |

---

## 4. UI Capabilities

The frontend `TenantDatabaseManagerPage.tsx` provides:
1. **Live Search Filter:** Instant client-side text filtering by table name.
2. **Category Filter Pills:** Quick isolation of Category A (Operational), Category B (Lifecycle), Category C (Financial), or Category D (Security).
3. **One-Click Inspector:** Clicking any table row immediately switches to the Schema & Records Explorer tab with that table active.
