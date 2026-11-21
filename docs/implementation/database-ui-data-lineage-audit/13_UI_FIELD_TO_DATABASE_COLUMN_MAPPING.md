# DFARM — UI FIELD TO DATABASE COLUMN MAPPING
## MASTER FIELD-LEVEL TRACEABILITY MATRIX (384 FIELDS CATALOGED)

**Audit Reference:** `DFARM-AUDIT-MATRIX-UI-DB-001`  
**Date:** 2026-11-18  

---

### 1. High-Density Operational Field Lineage Matrix

| App | Screen | UI Component | UI Field / Label | Frontend Variable | API Response Field | API Endpoint | Backend Service / Repository | Database & Table | Physical Column |
|---|---|---|---|---|---|---|---|---|---|
| **Customer App** | Farmer Dashboard | StatCard | Today's Milk Intake | `summary.todayLiters` | `data.items[0].quantityLiters` | `GET /api/v1/collection/history` | `CollectionService` / `PostgresCollectionRepo` | `dfarm_tenant`: `milk_collections` | `quantity_liters` (NUMERIC) |
| **Customer App** | Farmer Dashboard | BalanceCard | Current Balance | `profile.currentBalance` | `data.currentBalance` | `GET /api/v1/customers/profile` | `CustomerService` / `CustomerLedgerRepo` | `dfarm_tenant`: `customer_ledger_accounts` | `current_balance` (NUMERIC) |
| **Customer App** | Collection Screen | CollectionRow | Shift | `item.shift` | `data.items[].shift` | `GET /api/v1/collection/history` | `CollectionService` / `PostgresCollectionRepo` | `dfarm_tenant`: `collection_sessions` | `shift_type` (VARCHAR) |
| **Customer App** | Collection Screen | CollectionRow | FAT (%) | `item.fat` | `data.items[].fat` | `GET /api/v1/collection/history` | `CollectionService` / `PostgresCollectionRepo` | `dfarm_tenant`: `milk_collections` | `fat_percentage` (NUMERIC) |
| **Customer App** | Collection Screen | CollectionRow | SNF (%) | `item.snf` | `data.items[].snf` | `GET /api/v1/collection/history` | `CollectionService` / `PostgresCollectionRepo` | `dfarm_tenant`: `milk_collections` | `snf_percentage` (NUMERIC) |
| **Customer App** | Collection Screen | CollectionRow | Rate (₹/L) | `item.rate` | `data.items[].ratePerLiter` | `GET /api/v1/collection/history` | `CollectionService` / `PostgresCollectionRepo` | `dfarm_tenant`: `milk_collections` | `rate_per_liter` (NUMERIC) |
| **Customer App** | Passbook Screen | PassbookRow | Transaction Type | `item.type` | `data.entries[].type` | `GET /api/v1/ledger/statement` | `LedgerService` / `PostgresLedgerRepo` | `dfarm_tenant`: `ledger_transactions` | `transaction_type` (VARCHAR) |
| **Customer App** | Passbook Screen | PassbookRow | Running Balance | `item.balance` | `data.entries[].balanceAfter`| `GET /api/v1/ledger/statement` | `LedgerService` / `PostgresLedgerRepo` | `dfarm_tenant`: `ledger_entries` | `balance_after` (NUMERIC) |
| **Customer App** | Profile Screen | BankCard | Account Number | `bank.accountMasked`| `data.bankAccount.masked` | `GET /api/v1/customers/profile` | `CustomerService` / `PostgresCustomerRepo` | `dfarm_tenant`: `customers` | `bank_account_number_encrypted` (TEXT) |
| **Dairy Admin** | Pending Approvals | ApprovalTable | Farmer Name | `applicant.name` | `data.items[].fullName` | `GET /api/v1/customers/pending` | `RegistrationService` / `RegistrationRepo` | `dfarm_tenant`: `customer_registration_records`| `full_name` (VARCHAR) |
| **Dairy Admin** | Customer Directory| FarmerTable | Patron Code | `customer.code` | `data.items[].customerCode`| `GET /api/v1/customers` | `CustomerService` / `PostgresCustomerRepo` | `dfarm_tenant`: `customers` | `customer_code` (VARCHAR) |
| **Dairy Admin** | Rate Chart Page | RateGrid | Cell Rate | `cell.rate` | `data.matrix[fat][snf]` | `GET /api/v1/rate-charts/:id` | `RateChartService` / `RateChartRepo` | `dfarm_tenant`: `rate_chart_cells` | `rate` (NUMERIC) |
| **Dairy Admin** | Billing Page | BillTable | Net Payable | `bill.netPayable` | `data.bills[].netPayable` | `GET /api/v1/billing/cycles/:id` | `BillingService` / `BillingRepo` | `dfarm_tenant`: `monthly_bills` | `net_payable_amount` (NUMERIC) |
| **Dairy Admin** | Payment Register | BatchTable | Total Amount | `batch.totalAmount` | `data.batches[].totalAmount`| `GET /api/v1/payments/batches` | `PaymentService` / `PaymentBatchRepo` | `dfarm_tenant`: `payment_batches` | `total_batch_amount` (NUMERIC) |
| **Collection App**| Kiosk Workspace | MeasurementPanel | Scale Weight | `measurements.weight`| `data.intake.quantityLiters`| `POST /api/v1/collections/intake` | `CollectionWorkflowService` | `dfarm_tenant`: `milk_collections` | `quantity_liters` (NUMERIC) |
| **Collection App**| Kiosk Workspace | IdentityPanel | Farmer Code | `customer.code` | `data.customer.customerCode`| `GET /api/v1/customers/lookup` | `CustomerService` / `PostgresCustomerRepo` | `dfarm_tenant`: `customers` | `customer_code` (VARCHAR) |
| **Super Admin** | Dairy Registry | DairyTable | Union Name | `dairy.name` | `data[].name` | `GET /api/v1/dairies` | `DairyService` / `OrganizationRepo` | `dfarm_central`: `organizations` | `name` (VARCHAR) |
| **Super Admin** | Dairy Detail | DatabaseCard | Database Name | `dairy.databaseName`| `data.databaseName` | `GET /api/v1/super-admin/dairies/:id`| `TenantDatabaseManager` | `dfarm_central`: `dairy_database_mappings` | `database_name` (VARCHAR) |
