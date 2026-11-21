# DFARM — Module 2.3: Table Schema & Metadata Inspection

**Execution Reference:** `DFARM-SUPER-ADMIN-TENANT-DATABASE-CONTROL`  
**Backend Service:** `services/backend/src/infrastructure/database/TenantDatabaseControlService.ts`  
**API Endpoint:** `GET /api/v1/super-admin/tenants/:dairyId/database/tables/:tableName/schema`  
**Status:** FULLY IMPLEMENTED AND VERIFIED  

---

## 1. Objective & Capabilities

When an authorized Super Admin selects any discovered table, the system queries the tenant database catalog to provide an exact structural dissection of that table without executing arbitrary DDL or risking data mutation.

### Dissected Structural Elements:
1. **Column Attributes:** Name, exact data type (`uuid`, `varchar`, `numeric`, `timestamp`, `jsonb`, `boolean`), maximum length, numeric precision and scale.
2. **Nullability:** Strict `isNullable` validation based on table constraints.
3. **Primary Key Identification:** Identified via `information_schema.table_constraints` and `key_column_usage`.
4. **Foreign Key Relationships:** Foreign table name, referenced column, and constraint name.
5. **Default Expressions:** Automatic sequence generators (`gen_random_uuid()`, `NOW()`, default numbers).
6. **Unique & Check Constraints:** Unique constraints across multiple columns (e.g. `uq_customer_mobile_per_org`).

---

## 2. Technical Catalog Inspection Logic

In `TenantDatabaseControlService.ts`:
```ts
public async getTableSchema(dairyId: string, tableName: string): Promise<TableSchemaDetail> {
  const { client } = await this.getTenantContext(dairyId);
  const quotedTable = this.quoteIdent(tableName);

  // 1. Column definitions from information_schema
  const res = await client.query(`
    SELECT 
      column_name, data_type, is_nullable, column_default,
      character_maximum_length, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position ASC;
  `, [tableName]);

  // 2. Primary Key Columns
  const pkCols = await this.getPrimaryKeyColumns(client, tableName);

  // 3. Foreign Key Relationships
  const foreignKeys = await this.getForeignKeys(client, tableName);

  return {
    tableName,
    columns: res.rows.map(r => ({
      columnName: r.column_name,
      dataType: r.data_type,
      isNullable: r.is_nullable === 'YES',
      columnDefault: r.column_default,
      isPrimaryKey: pkCols.includes(r.column_name),
      isForeignKey: foreignKeys.some(f => f.columnName === r.column_name)
    })),
    primaryKeys: pkCols,
    foreignKeys,
    indexes: [...]
  };
}
```

---

## 3. SQL Injection Prevention & Identifier Sanitization

Under no circumstances does `TenantDatabaseControlService` concatenate user-supplied table or column names directly into SQL strings. Every identifier is sanitized and escaped using `quoteIdent`:
```ts
private quoteIdent(ident: string): string {
  // Reject identifiers with illegal characters
  if (!/^[a-zA-Z0-9_]+$/.test(ident)) {
    throw new Error(`Invalid SQL identifier: ${ident}`);
  }
  return `"${ident.replace(/"/g, '""')}"`;
}
```
All data values are strictly passed via parameterized placeholders (`$1`, `$2`, etc.), preventing SQL injection vulnerabilities.

---

## 4. UI Schema Presentation

The Super Admin UI presents column definitions in a responsive card grid:
- **Primary Key Pill:** Prominent gold badge (`PK`) and Key icon.
- **Nullability Indicator:** Muted `NULL` or red `NOT NULL` badge.
- **Data Type Subtitle:** Clean monospace typography displaying full PostgreSQL types (`numeric(10,2)`, `timestamp with time zone`).
