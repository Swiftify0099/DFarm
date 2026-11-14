# Milk Rate Management System: Workflow, Matrix Validation & Immutability

## 1. Rate Chart Lifecycle

The Milk Rate Management System provides authoritative pricing for milk collection across all dairy centers. To preserve strict financial integrity, rate charts follow an immutable lifecycle:

```
  ┌────────────────────────────────────────────────────────┐
  │ 1. Create Rate Chart                                   │
  │    - Organization scope                                │
  │    - Milk Category: COW or BUFFALO                     │
  │    - Center Scope: ALL_CENTERS or SPECIFIC_CENTERS     │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 2. Create Version (DRAFT)                              │
  │    - Version number (sequential: 1, 2, 3...)           │
  │    - Effective Date range (start_date, end_date)       │
  │    - Base rate, Fat/SNF reference points               │
  │    - Pricing Unit: PER_KG (or PER_LITER)               │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 3. Configure Matrix & Validate Cells                   │
  │    - Populate Fat (e.g., 3.0 to 5.0)                   │
  │    - Populate SNF (e.g., 8.0 to 9.5)                   │
  │    - Strict step size: 0.1                             │
  │    - Rate per configured unit (NUMERIC)                │
  │    - Validate completeness, no gaps, no duplicates     │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 4. Preview Calculation                                 │
  │    - Dry run sample Fat/SNF/Weight combinations        │
  │    - Verify applied rate and total payable amount      │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 5. Submit for Approval                                 │
  │    - Status transitions from DRAFT to SUBMITTED        │
  │    - Center Managers / Supervisors can submit          │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 6. Approve                                             │
  │    - Status transitions from SUBMITTED to APPROVED     │
  │    - Requires DAIRY_OWNER or SUPER_ADMIN role          │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼
  ┌────────────────────────────────────────────────────────┐
  │ 7. Publish                                             │
  │    - Status transitions to PUBLISHED                   │
  │    - Prior published active version marked SUPERSEDED  │
  │    - Sync event published to sync_events               │
  │    - IMMUTABILITY TRIGGER ACTIVATES                    │
  └────────────────────────────────────────────────────────┘
```

---

## 2. Published Version Immutability Guarantee

Once a rate chart version reaches `PUBLISHED` status:
1. **Database-Enforced Immutability**:
   - The PostgreSQL trigger `trg_rate_chart_cell_immutability` executes on `BEFORE INSERT OR UPDATE OR DELETE ON rate_chart_cells`.
   - If the parent `rate_chart_versions.status` is `'PUBLISHED'`, `'SUPERSEDED'`, or `'ARCHIVED'`, the trigger raises an uncatchable exception:
     `RATE_CHART_IMMUTABLE: Cannot modify or delete cells in a <status> rate chart version`.
2. **No In-Place Modifications**:
   - Any rate change requires creating a **new version** (e.g., Version 2).
   - Old versions remain permanently preserved.
3. **Historical Milk Collection Snapshot Preservation**:
   - Every completed milk collection permanently records:
     `rate_chart_id`, `rate_chart_version_id`, `rate_per_unit`, `total_amount`, `pricing_unit`.
   - Re-publishing or superseding a rate version never alters the payable amount or ledger balances of past transactions.

---

## 3. Matrix Validation Rules

The matrix validation engine enforces strict structural constraints:
- **Fat Range**: Validated between min and max bounds with $0.1$ step increment.
- **SNF Range**: Validated between min and max bounds with $0.1$ step increment.
- **No Duplicate Cells**: Every $(\text{Fat}, \text{SNF})$ coordinate must be unique.
- **No Missing Cells**: Grid must be complete across the declared range.
- **Decimal Precision**: Rates must be valid non-negative NUMERIC amounts.
- **No Floating-Point Money**: All math executed with exact decimal arithmetic.
- **Missing Cell Handling**: If a farmer's milk sample has a Fat/SNF combination outside the matrix, the calculation returns `RATE_CELL_NOT_FOUND`—never interpolating or estimating.

