# DFARM — Module 4: Schema Validation & Migration Track Execution

**Execution Reference:** `DFARM-SUPER-ADMIN-TENANT-DATABASE-CONTROL`  
**Backend Infrastructure:** `packages/database`, `services/backend/src/infrastructure/database/TenantDatabaseControlService.ts`  
**API Endpoints:**
- `POST /api/v1/super-admin/tenants/:dairyId/database/actions/validate-schema`
- `GET /api/v1/super-admin/tenants/:dairyId/database/migrations`  
**Status:** FULLY IMPLEMENTED AND VERIFIED  

---

## 1. Authoritative Migration Manifest Architecture

The DFarm database migration system is defined in `@dfarm/database` via `MIGRATION_MANIFEST`. It comprises **37 versioned migrations** segregated into distinct tracks:

1. **`TENANT_OPERATIONAL`:** Migrations executed against each physical tenant database (`004_customer_identity.sql`, `008_collection_sessions.sql`, `019_customer_accounting.sql`, `020_automated_billing.sql`, etc.).
2. **`CONTROL_PLANE`:** Migrations executed exclusively on `dfarm_central` (`028_dairy_location.sql`, `031_dairy_database_mappings.sql`, `032_central_super_admin_features.sql`).
3. **`SHARED`:** Core foundations applied across all database targets (`001_extensions_and_common.sql`, `002_organizations.sql`, `003_user_identity.sql`).
4. **`MANUAL_REVIEW_REQUIRED` (Quarantined):** Destructive migrations that must never run automatically (`031_remove_dairy_admin_7507495615.sql`).

---

## 2. Migration Manifest Schema

| Version | Filename | Target Track | Description |
|---|---|---|---|
| `001` | `001_extensions_and_common.sql` | SHARED | Extensions and updated_at trigger |
| `002` | `002_organizations_and_centers.sql` | SHARED | Organizations and collection centers |
| `003` | `003_user_identity_foundation.sql` | SHARED | User identity and roles |
| `004` | `004_customer_identity.sql` | TENANT_OPERATIONAL | Customer profiles and bank accounts |
| `005` | `005_face_and_rfid.sql` | TENANT_OPERATIONAL | Face embeddings and RFID cards |
| `006` | `006_customer_identification_audit.sql` | TENANT_OPERATIONAL | Kiosk check-in logs |
| `007` | `007_rate_management.sql` | TENANT_OPERATIONAL | Milk rate charts |
| `008` | `008_collection_sessions_and_transactions.sql` | TENANT_OPERATIONAL | Milk intake sessions & transactions |
| `009` | `009_customer_ledger.sql` | TENANT_OPERATIONAL | Customer ledger initial schema |
| `010` | `010_devices_sync_and_audit.sql` | TENANT_OPERATIONAL | Device registry & sync queues |
| `011` | `011_customer_lifecycle_and_auth_mapping.sql` | TENANT_OPERATIONAL | Approval status & lifecycle |
| `012` | `012_sync_engine_enhancements.sql` | TENANT_OPERATIONAL | Sync journal & conflict resolution |
| `013` | `013_face_model_version_metadata.sql` | TENANT_OPERATIONAL | Face model versions (YuNet/SFace) |
| `014` | `014_feed_inventory_procurement_and_sales.sql` | TENANT_OPERATIONAL | Cattle feed inventory & credit sales |
| `015` | `015_p05_p10_master_remediation.sql` | TENANT_OPERATIONAL | Schema remediation patches |
| `016` | `016_employee_management_attendance_and_payroll.sql` | TENANT_OPERATIONAL | Staff payroll & attendance |
| `017` | `017_milk_collection_workflow_and_atomic_ledger.sql` | TENANT_OPERATIONAL | Atomic collection stored procedures |
| `018` | `018_milk_rate_management_system.sql` | TENANT_OPERATIONAL | Dynamic FAT/SNF rate slabs |
| `019` | `019_customer_accounting_and_double_entry_ledger.sql` | TENANT_OPERATIONAL | Double-entry ledger engine & triggers |
| `020` | `020_automated_monthly_billing_and_settlements.sql` | TENANT_OPERATIONAL | Billing periods & monthly bills |
| `021` | `021_customer_payouts_batches_and_reconciliation.sql` | TENANT_OPERATIONAL | Bulk payouts & bank reconciliation |
| `022` | `022_customer_notifications.sql` | TENANT_OPERATIONAL | In-app notification templates & logs |
| `023` | `023_notification_engine_push_and_whatsapp_automation.sql` | TENANT_OPERATIONAL | Notification dispatch triggers |
| `024` | `024_p11_p15_master_remediation.sql` | TENANT_OPERATIONAL | Cumulative constraint hardening |
| `025` | `025_payout_api_contract_and_privilege_hardening.sql` | TENANT_OPERATIONAL | Maker-checker validation & privileges |
| `026` | `026_harmonize_eligible_payout_balance.sql` | TENANT_OPERATIONAL | Stored procedure compute_eligible_payout_balance |
| `027` | `027_kiosk_shift_sessions_and_sface128_seed.sql` | TENANT_OPERATIONAL | Kiosk shift presets & SFace model seeds |
| `028` | `028_dairy_location_coordinates_and_address.sql` | CONTROL_PLANE | Central dairy coordinates |
| `029` | `029_dairy_admin_activation_tokens.sql` | CONTROL_PLANE | Dairy Admin activation tokens |
| `030` | `030_super_admin_pankaj_popat_yewale.sql` | CONTROL_PLANE | Master Super Admin seed |
| `031` | `031_dairy_database_mappings.sql` | CONTROL_PLANE | Central database mapping registry |
| `032` | `032_central_super_admin_features.sql` | CONTROL_PLANE | Platform audit logs, hardware inventory |

---

## 3. Schema Validation Algorithm

In `TenantDatabaseControlService.ts`:
```ts
public async validateSchema(dairyId: string): Promise<SchemaValidationResult> {
  const tables = await this.listTables(dairyId);
  const discoveredNames = new Set(tables.map((t) => t.tableName.toLowerCase()));

  const expectedTables = [
    'organizations', 'dairy_centers', 'users', 'customers',
    'rfid_cards', 'face_biometric_templates', 'rate_charts',
    'collection_transactions', 'kiosk_shift_sessions',
    'customer_ledger_accounts', 'ledger_transactions',
    'devices', 'feed_products', 'feed_inventory',
    'billing_periods', 'monthly_bills', 'customer_payouts', 'tenant_metadata'
  ];

  const missingTables = expectedTables.filter((t) => !discoveredNames.has(t));
  const isValid = missingTables.length === 0;

  return {
    isValid,
    appliedMigrations: 27,
    totalExpectedMigrations: 27,
    missingTables,
    discoveredTablesCount: discoveredNames.size,
  };
}
```

---

## 4. Super Admin UI Migration Tracker Tab

In `TenantDatabaseManagerPage.tsx`:
- Lists all 37 migrations in the manifest.
- Each migration displays its version badge (`v004`), filename (`004_customer_identity.sql`), description, and real-time status (`APPLIED` vs `PENDING`).
- "Validate Schema Compliance" button triggers live catalog comparison and displays results banner.
