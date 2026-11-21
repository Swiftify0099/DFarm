# DFARM — MASTER DATA LINEAGE TRACEABILITY
## COMPREHENSIVE TRACEABILITY MATRIX: UI -> API -> SERVICE -> REPO -> DB

**Audit Reference:** `DFARM-AUDIT-MASTER-LINEAGE-001`  
**Date:** 2026-11-18  

---

### 1. End-to-End Lineage Master Summary

```
[Farmer Mobile App] -> [GET /api/v1/collection/history] -> [CollectionController.getHistory]
  -> [CollectionService.getHistory] -> [PostgresCollectionRepository.findHistoryByCustomer]
  -> [SELECT * FROM milk_collections WHERE customer_id=$1 ORDER BY created_at DESC]
  -> [Dairy Tenant Physical DB: dfarm_tenant_<code_hash>]

[Kiosk Terminal] -> [POST /api/v1/collections/intake] -> [CollectionController.recordIntake]
  -> [FinancialPolicyResolutionService.resolveRate] -> [MilkCollectionWorkflowService.recordIntake]
  -> [PostgresCollectionRepository.insertIntake & PostgresCustomerLedgerRepository.postJournal]
  -> [BEGIN TRANSACTION: INSERT milk_collections -> INSERT ledger_transactions -> UPDATE customer_ledger_accounts -> COMMIT]
  -> [Dairy Tenant Physical DB: dfarm_tenant_<code_hash>]

[Dairy Admin Web] -> [POST /api/v1/payments/batches/:id/approve] -> [PaymentController.approveBatch]
  -> [AuthorizePaymentBatchUseCase] -> [PostgresPaymentBatchRepository.updateStatus]
  -> [UPDATE payment_batches SET status='APPROVED' WHERE id=$1]
  -> [Dairy Tenant Physical DB: dfarm_tenant_<code_hash>]

[Super Admin Web] -> [POST /api/v1/super-admin/dairies] -> [SuperAdminController.createDairy]
  -> [TenantDatabaseManager.provisionTenantDatabase] -> [CREATE DATABASE dfarm_tenant_<clean_code>_<id_prefix>]
  -> [MigrationRunner.runTenantMigrations (001 -> 027)] -> [INSERT INTO tenant_metadata]
  -> [Central Database: dfarm_central -> dairy_database_mappings]
```
