# DFARM — API-TO-DATABASE LINEAGE TRACEABILITY
## END-TO-END EXECUTION PATHS: ROUTE -> CONTROLLER -> REPOSITORY -> TABLE

**Audit Reference:** `DFARM-AUDIT-LINEAGE-API-DB-001`  
**Date:** 2026-11-18  

---

### 1. Comprehensive Lineage Paths for Primary Business Operations

#### 1.1 Public Farmer Self-Registration
- **API Endpoint:** `POST /api/v1/customers/register`
- **Router:** `presentation/routes/customers.routes.ts`
- **Middleware:** `requestContext` $	o$ `requireTenantContext({ allowPublicRegistration: true })`
- **Controller:** `CustomerController.register`
- **Application Service:** `RegisterCustomerUseCase`
- **Domain Logic:** `Customer.create()` with state `PENDING`
- **Repository:** `PostgresCustomerRegistrationRepository.createRegistration()`
- **SQL Execution:** `INSERT INTO customer_registration_records ...`, `INSERT INTO customers (status) VALUES ('PENDING')`
- **Target Database:** `dfarm_tenant_<code_hash>`
- **Accessed Tables:** `customers`, `customer_addresses`, `customer_registration_records`

#### 1.2 Milk Collection Intake (Counter Kiosk)
- **API Endpoint:** `POST /api/v1/collections/intake`
- **Router:** `presentation/routes/collections.routes.ts`
- **Middleware:** `authenticateToken` $	o$ `requireTenantContext()` $	o$ `authorize(['COLLECTION_OPERATOR'])`
- **Controller:** `CollectionController.recordIntake`
- **Domain Service:** `FinancialPolicyResolutionService.resolveRate()`
- **Application Service:** `MilkCollectionWorkflowService.recordIntake()`
- **Repository:** `PostgresCollectionRepository.insertIntake()`
- **SQL Execution:**
  ```sql
  INSERT INTO milk_collections (session_id, customer_id, customer_code, milk_category, quantity_liters, fat_percentage, snf_percentage, rate_per_liter, total_gross_amount)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
  
  INSERT INTO ledger_transactions (ledger_account_id, transaction_type, debit_amount, credit_amount, description, reference_id)
  VALUES ($10, 'MILK_COLLECTION_PAYABLE', 0.00, $9, $11, $12);
  
  UPDATE customer_ledger_accounts 
  SET current_balance = current_balance + $9, total_milk_earnings = total_milk_earnings + $9, last_transaction_at = NOW()
  WHERE customer_id = $2;
  ```
- **Target Database:** `dfarm_tenant_<code_hash>`
- **Accessed Tables:** `milk_collections`, `customer_ledger_accounts`, `ledger_transactions`, `ledger_entries`

#### 1.3 Maker-Checker Bulk Payout Approval & NEFT Export
- **API Endpoint:** `POST /api/v1/payments/batches/:id/approve`
- **Router:** `presentation/routes/payments.routes.ts`
- **Middleware:** `authenticateToken` $	o$ `requireTenantContext()` $	o$ `authorize(['DAIRY_OWNER'])`
- **Controller:** `PaymentController.approveBatch`
- **Application Service:** `AuthorizePaymentBatchUseCase`
- **Invariants Checked:** `maker_id != checker_id` (Segregation of Duties)
- **Repository:** `PostgresPaymentBatchRepository.updateStatus()`
- **Target Database:** `dfarm_tenant_<code_hash>`
- **Accessed Tables:** `payment_batches`, `payment_approvals`
