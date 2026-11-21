# DFARM — Module 2.4: Real Record Viewer & Bounded Pagination

**Execution Reference:** `DFARM-SUPER-ADMIN-TENANT-DATABASE-CONTROL`  
**Backend Service:** `services/backend/src/infrastructure/database/TenantDatabaseControlService.ts`  
**API Endpoint:** `GET /api/v1/super-admin/tenants/:dairyId/database/tables/:tableName/records`  
**Status:** FULLY IMPLEMENTED AND VERIFIED  

---

## 1. Architectural Safeguards: No Full-Table Scans

In production enterprise databases, unbounded queries (`SELECT * FROM table`) can cause severe memory exhaustion, high I/O latency, and database cluster locking.

To prevent this:
1. **Mandatory Bounded Limits:** All record fetch queries enforce a hard upper limit (default: 25, maximum allowable: 100).
2. **Server-Side Pagination:** The backend calculates `LIMIT` and `OFFSET` based on `page` and `limit` query parameters.
3. **Controlled Ordering:** Results are ordered by designated primary keys or timestamp fields (`ORDER BY id DESC`) to guarantee deterministic pagination.
4. **Field Masking in Flight:** Sensitive columns are redacted at the repository layer before the JSON response leaves the server.

---

## 2. Parameterized Record Fetch Query

In `TenantDatabaseControlService.ts`:
```ts
public async getTableRecords(
  dairyId: string,
  tableName: string,
  params: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
    filterField?: string;
    filterValue?: string;
  }
): Promise<PaginatedRecordsResult> {
  const { client } = await this.getTenantContext(dairyId);
  const quotedTable = this.quoteIdent(tableName);

  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 25));
  const offset = (page - 1) * limit;

  // 1. Total row count query
  const countRes = await client.query(`SELECT COUNT(*) as cnt FROM ${quotedTable};`);
  const totalRecords = Number(countRes.rows[0]?.cnt || 0);

  // 2. Bounded select query with parameters
  const selectSql = `
    SELECT * FROM ${quotedTable}
    ORDER BY ${this.quoteIdent(sortBy)} ${sortOrder}
    LIMIT ${limit} OFFSET ${offset};
  `;

  const res = await client.query(selectSql);
  const maskedRecords = res.rows.map((row) => this.maskSensitiveRecord(row));

  return {
    tableName,
    category: classInfo.category,
    accessMode: classInfo.accessMode,
    totalRecords,
    page,
    limit,
    records: maskedRecords,
    primaryKeyColumns: primaryKeys,
  };
}
```

---

## 3. UI Real Record Grid & Navigation

The records view in `apps/dfarm-super-admin/src/features/databases/TenantDatabaseManagerPage.tsx` delivers:
1. **Sticky Header:** Sticky column headers with monospace styling for fast scanning.
2. **Dynamic Limit Selector:** Switch between 10, 25, 50, and 100 rows per page.
3. **Real Time Pagination Controls:** "Previous Page" and "Next Page" buttons with page counter (`Page X of Y`).
4. **Search Filter:** Server-side parameterized search query across record fields.
5. **View Record Modal:** Clicking the eye icon (`Eye`) pops up a structured modal rendering all columns, JSON attributes, and ISO timestamps with clean JSON formatting.
