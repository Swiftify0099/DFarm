# DFarm: Entity Relationships & Relational Integrity Specification
**Phase 03 of 20: Comprehensive Domain Association Matrix**

---

## 1. Relational Integrity Principles

1. **Foreign Key Integrity:** All relationships between domains enforce foreign key constraints. No "loose" or unlinked UUID identifiers are permitted in business transaction tables.
2. **Delete Behavior Strategy:**
   - **`ON DELETE RESTRICT` (Default for Masters & Financials):** Applied to core business entities (`customers`, `dairy_centers`, `milk_collections`, `rate_charts`, `ledger_transactions`). If a customer has historical milk collections or ledger entries, physical deletion of that customer row is rejected at the database engine level. Soft-deletion (`is_deleted = TRUE`) must be used instead.
   - **`ON DELETE CASCADE` (Sub-Items & Dependent Child Tables):** Permitted only for strictly dependent child rows that have no independent financial existence outside their parent entity (e.g. `rate_chart_cells` cascade on `rate_chart_versions`, `monthly_bill_items` cascade on `monthly_bills`, `feed_sale_items` cascade on `feed_sales`).
   - **`ON DELETE SET NULL` (Auditing & Informational Foreign Keys):** Used when the parent user or operator account is decommissioned, preserving the historical transaction record while zeroing the user link (e.g. `deleted_by` in `customers`, `supervisor_id` in `identification_audit_logs`).

---

## 2. Domain-by-Domain Relationship Matrix

### Domain 1 & 2: Organization, Centers & IAM
- `organizations` $\xrightarrow{1:N}$ `dairy_centers`: An organization owns one or more dairy collection centers. (`ON DELETE RESTRICT`)
- `organizations` $\xrightarrow{1:N}$ `users`: An organization employs staff members, managers, and system users. (`ON DELETE RESTRICT`)
- `dairy_centers` $\xrightarrow{1:1}$ `center_settings`: Each dairy center has exactly one operational configuration record. (`ON DELETE CASCADE`)
- `dairy_centers` $\xrightarrow{1:N}$ `collection_shifts`: Each dairy center defines multiple operational shifts (Morning, Evening). (`ON DELETE CASCADE`)
- `users` $\xleftrightarrow{M:N}$ `dairy_centers` (via `user_center_assignments`): Staff members may be assigned to multiple collection centers.

### Domain 3, 4 & 5: Customer Identity, Biometrics & RFID
- `organizations` $\xrightarrow{1:N}$ `customers`: Customers are owned at the organization level. Uniqueness of mobile number is scoped to `organization_id`.
- `dairy_centers` $\xrightarrow{1:N}$ `customers`: Each customer has a designated primary collection center. (`ON DELETE RESTRICT`)
- `customers` $\xrightarrow{1:N}$ `customer_milk_categories`: Normalized table defining permitted species. A farmer authorized for Both has two records (`COW` and `BUFFALO`). (`ON DELETE RESTRICT`)
- `customers` $\xrightarrow{1:1}$ `customer_addresses`: Exactly one postal/village address profile per customer. (`ON DELETE CASCADE`)
- `customers` $\xrightarrow{1:N}$ `customer_status_history`: Complete audit trail of status transitions. (`ON DELETE CASCADE`)
- `customers` $\xrightarrow{1:N}$ `customer_consent_records`: Legal biometric enrollment consent logs. (`ON DELETE RESTRICT`)
- `face_model_versions` $\xrightarrow{1:N}$ `face_enrollments`: Connects encrypted feature vectors to a specific model version and dimension. (`ON DELETE RESTRICT`)
- `customers` $\xrightarrow{1:N}$ `face_enrollments`: A customer can have historical enrollment templates, but only one active template per model version. (`ON DELETE RESTRICT`)
- `customers` $\xrightarrow{1:N}$ `rfid_card_assignments`: A customer has an assignment history, but a partial unique index enforces that only **one card can be active at a time**.
- `rfid_cards` $\xrightarrow{1:N}$ `rfid_card_assignments`: A physical card has an assignment history, but a partial unique index enforces that a card can only be **actively assigned to one customer at a time**.

### Domain 6 & 7: Identification & Milk Collection
- `customers` $\xrightarrow{1:N}$ `identification_audit_logs`: Telemetry of every customer identification attempt. (`ON DELETE SET NULL`)
- `identification_audit_logs` $\xrightarrow{1:1}$ `supervisor_verification_records`: Mandatory justification and audit entry when an identification override occurs. (`ON DELETE CASCADE`)
- `customers` $\xrightarrow{1:N}$ `collection_sessions`: Counter intake sessions initiated by a farmer. (`ON DELETE RESTRICT`)
- `collection_shifts` $\xrightarrow{1:N}$ `collection_sessions`: Binds intake to an authorized shift window. (`ON DELETE RESTRICT`)
- `collection_sessions` $\xrightarrow{1:1}$ `collection_quality_readings`: Compositional data (Fat%, SNF%) for the session. (`ON DELETE CASCADE`)
- `collection_sessions` $\xrightarrow{1:1}$ `collection_weight_readings`: Mass measurements (Weight kg) for the session. (`ON DELETE CASCADE`)
- `collection_sessions` $\xrightarrow{1:1}$ `milk_collections`: Finalized collection transaction. (`ON DELETE RESTRICT`)
- `milk_collections` $\xrightarrow{1:1}$ `collection_receipts`: Thermal slip tracking. (`ON DELETE RESTRICT`)
- `milk_collections` $\xrightarrow{1:N}$ `collection_adjustments`: Audited corrections to milk records. (`ON DELETE RESTRICT`)
- `milk_collections` $\xrightarrow{1:1}$ `collection_reversals`: Complete transaction reversal. (`ON DELETE RESTRICT`)

### Domain 8: Rate Charts & Pricing
- `organizations` $\xrightarrow{1:N}$ `rate_charts`: Global organizational rate charts. (`ON DELETE RESTRICT`)
- `dairy_centers` $\xrightarrow{1:N}$ `rate_charts`: Optional center-specific rate overrides. (`ON DELETE RESTRICT`)
- `rate_charts` $\xrightarrow{1:N}$ `rate_chart_versions`: Historical versions with start and end dates. (`ON DELETE RESTRICT`)
- `rate_chart_versions` $\xrightarrow{1:N}$ `rate_chart_cells`: Grid pricing matrix entries. (`ON DELETE CASCADE`)
- `rate_chart_versions` $\xrightarrow{1:N}$ `milk_collections`: Historical snapshot linkage ensuring finalized transactions never change when rates update. (`ON DELETE RESTRICT`)

### Domain 9: Financial Ledger
- `customers` $\xrightarrow{1:1}$ `customer_ledger_accounts`: Master account summary for the farmer. (`ON DELETE RESTRICT`)
- `customers` $\xrightarrow{1:N}$ `ledger_transactions`: Append-only financial credit and debit transactions. (`ON DELETE RESTRICT`)
- `ledger_transactions` $\xrightarrow{1:N}$ `ledger_entries`: Double-entry accounting entries. (`ON DELETE CASCADE`)
- `milk_collections` $\xrightarrow{1:1}$ `ledger_transactions`: Every completed milk collection automatically posts exactly one corresponding ledger credit.
- `feed_sales` $\xrightarrow{1:1}$ `ledger_transactions`: Every credit sale of cattle feed automatically posts exactly one corresponding ledger debit.
- `customers` $\xrightarrow{1:N}$ `customer_advances`: Emergency cash loans disbursed. (`ON DELETE RESTRICT`)
- `customers` $\xrightarrow{1:N}$ `customer_deductions`: Veterinary and operational fee debits. (`ON DELETE RESTRICT`)

### Domain 10 & 11: Billing & Payments
- `dairy_centers` $\xrightarrow{1:N}$ `billing_periods`: Settlement periods configured per center. (`ON DELETE RESTRICT`)
- `billing_periods` $\xrightarrow{1:N}$ `monthly_bills`: Customer statement sheets for a period. (`ON DELETE RESTRICT`)
- `customers` $\xrightarrow{1:N}$ `monthly_bills`: Bill history for a farmer. (`ON DELETE RESTRICT`)
- `monthly_bills` $\xrightarrow{1:N}$ `monthly_bill_items`: Granular statement itemization. (`ON DELETE CASCADE`)
- `dairy_centers` $\xrightarrow{1:N}$ `payment_batches`: Outbound payment disbursement batches. (`ON DELETE RESTRICT`)
- `payment_batches` $\xrightarrow{1:N}$ `payment_batch_items`: Individual customer payment instructions. (`ON DELETE CASCADE`)
- `monthly_bills` $\xrightarrow{1:N}$ `customer_payments`: Settlements paid against a bill. (`ON DELETE SET NULL`)
- `customer_payments` $\xrightarrow{1:1}$ `payment_reconciliation_records`: Bank statement reconciliation matches. (`ON DELETE RESTRICT`)

### Domain 12: Feed Inventory
- `organizations` $\xrightarrow{1:N}$ `feed_categories`: Feed product taxonomy. (`ON DELETE RESTRICT`)
- `feed_categories` $\xrightarrow{1:N}$ `feed_products`: Cattle feed catalog items. (`ON DELETE RESTRICT`)
- `organizations` $\xrightarrow{1:N}$ `suppliers`: Feed manufacturers and distributors. (`ON DELETE RESTRICT`)
- `suppliers` $\xrightarrow{1:N}$ `feed_purchases`: Stock receipts from suppliers. (`ON DELETE RESTRICT`)
- `feed_products` $\xrightarrow{1:N}$ `inventory_transactions`: Stock balance movements. (`ON DELETE RESTRICT`)
- `customers` $\xrightarrow{1:N}$ `feed_sales`: Invoices for cattle feed sold to farmers. (`ON DELETE RESTRICT`)
- `feed_sales` $\xrightarrow{1:N` `feed_sale_items`: Line items on a feed invoice. (`ON DELETE CASCADE`)

### Domain 13: Employee Master & Payroll (STRICTLY ISOLATED)
- `organizations` $\xrightarrow{1:N}$ `employees`: Internal staff members. (`ON DELETE RESTRICT`)
- `employees` $\xrightarrow{1:1}$ `salary_structures`: Base compensation formula. (`ON DELETE CASCADE`)
- `employees` $\xrightarrow{1:N}$ `employee_attendance`: Shift attendance records. (`ON DELETE CASCADE`)
- `payroll_runs` $\xrightarrow{1:N}$ `payroll_items`: Monthly pay slips for staff. (`ON DELETE CASCADE`)
- `employees` $\xrightarrow{1:N}$ `employee_advances`: Internal staff advances (completely isolated from farmer advances). (`ON DELETE RESTRICT`)

---

## 3. Scope Boundaries & Multi-Center Isolation

```
Organization (Root Tenant)
├── Organization-wide Defaults (Users, Feed Products, Global Rates)
└── Dairy Centers (Local Branches)
    ├── Center-specific Shifts & Validation Limits (center_settings, collection_shifts)
    ├── Center Staff & Terminals (user_center_assignments, devices)
    ├── Center Farmer Registry (customers, customer_milk_categories)
    ├── Center Daily Milk Intake (collection_sessions, milk_collections)
    └── Center Billing & Inventory (billing_periods, monthly_bills, inventory_transactions)
```

Each transaction table carries foreign keys to `organization_id` and `center_id`. Supabase Row Level Security (RLS) policies leverage these keys to restrict counter operators and supervisors strictly to their assigned center while permitting organization owners full multi-center oversight.

