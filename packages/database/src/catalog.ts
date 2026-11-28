import fs from 'node:fs';
import path from 'node:path';

export const MIGRATION_PATH = '../../supabase/migrations';

export enum MigrationTarget {
  CONTROL_PLANE = 'CONTROL_PLANE',
  TENANT_OPERATIONAL = 'TENANT_OPERATIONAL',
  SHARED = 'SHARED',
  MANUAL_REVIEW_REQUIRED = 'MANUAL_REVIEW_REQUIRED',
}

export interface MigrationManifestEntry {
  version: string;
  filename: string;
  target: MigrationTarget;
  description: string;
}

export const MIGRATION_MANIFEST: MigrationManifestEntry[] = [
  { version: '001', filename: '001_extensions_and_common.sql', target: MigrationTarget.SHARED, description: 'PostgreSQL extensions and updated_at trigger' },
  { version: '002', filename: '002_organizations_and_centers.sql', target: MigrationTarget.SHARED, description: 'Organizations and collection centers' },
  { version: '003', filename: '003_user_identity_foundation.sql', target: MigrationTarget.SHARED, description: 'User identity and roles' },
  { version: '004', filename: '004_customer_identity.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Customer profiles and bank accounts' },
  { version: '005', filename: '005_face_and_rfid.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Face embeddings and RFID cards' },
  { version: '006', filename: '006_customer_identification_audit.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Kiosk check-in identification logs' },
  { version: '007', filename: '007_rate_management.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Milk rate charts' },
  { version: '008', filename: '008_collection_sessions_and_transactions.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Milk intake sessions and transactions' },
  { version: '009', filename: '009_customer_ledger.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Customer ledger initial schema' },
  { version: '010', filename: '010_devices_sync_and_audit.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Device registry and sync queues' },
  { version: '011', filename: '011_customer_lifecycle_and_auth_mapping.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Customer approval status and lifecycle' },
  { version: '012', filename: '012_sync_engine_enhancements.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Sync journal and conflict resolution' },
  { version: '013', filename: '013_face_model_version_metadata.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Face model versions (YuNet/SFace)' },
  { version: '014', filename: '014_feed_inventory_procurement_and_sales.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Cattle feed inventory and store credit sales' },
  { version: '015', filename: '015_p05_p10_master_remediation.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Schema remediation patches' },
  { version: '016', filename: '016_employee_management_attendance_and_payroll.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Staff payroll and daily attendance' },
  { version: '017', filename: '017_milk_collection_workflow_and_atomic_ledger.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Atomic milk collection stored procedures' },
  { version: '018', filename: '018_milk_rate_management_system.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Dynamic FAT/SNF rate slabs and incentives' },
  { version: '019', filename: '019_customer_accounting_and_double_entry_ledger.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Double-entry ledger engine and immutability triggers' },
  { version: '020', filename: '020_automated_monthly_billing_and_settlements.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Billing cycles and customer bills' },
  { version: '021', filename: '021_customer_payouts_batches_and_reconciliation.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Farmer bulk payouts, payment batches, and reconciliation' },
  { version: '022', filename: '022_customer_notifications.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Customer notification templates and logs' },
  { version: '023', filename: '023_notification_engine_push_and_whatsapp_automation.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Automated notification dispatch triggers' },
  { version: '024', filename: '024_p11_p15_master_remediation.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Cumulative constraint hardening' },
  { version: '025', filename: '025_payout_api_contract_and_privilege_hardening.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Payout privileges and maker-checker validation' },
  { version: '026', filename: '026_harmonize_eligible_payout_balance.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Stored procedure compute_eligible_payout_balance' },
  { version: '027', filename: '027_kiosk_shift_sessions_and_sface128_seed.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Kiosk shift presets and SFace model seeds' },
  { version: '028', filename: '028_dairy_location_coordinates_and_address.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Authoritative dairy registry coordinates' },
  { version: '029', filename: '029_dairy_admin_activation_tokens.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Dairy Admin email/OTP activation tokens' },
  { version: '030', filename: '030_super_admin_pankaj_popat_yewale.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Master root Super Admin seed' },
  { version: '031_quarantine', filename: '031_remove_dairy_admin_7507495615.sql', target: MigrationTarget.MANUAL_REVIEW_REQUIRED, description: 'Quarantined destructive script - manual review only' },
  { version: '031', filename: '031_dairy_database_mappings.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Central tenant database mapping registry' },
  { version: '032', filename: '032_central_super_admin_features.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Central Super Admin platform audit, hardware inventory, AMC, alerts, and bank details' },
  { version: '033', filename: '033_central_platform_policies_and_support.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Central platform policies for global rates, FAT/SNF adjustments, OTP rate limits, and support diagnostics' },
  { version: '034', filename: '034_tenant_reconciliation_status_hardening.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Additive migration ensuring transaction_status supports RECONCILIATION_REQUIRED across all tenant databases' },
  { version: '035', filename: '035_customer_lifecycle_and_registration_hardening.sql', target: MigrationTarget.SHARED, description: 'Additive migration ensuring customer registration and lifecycle statuses across all databases' },
  { version: '036', filename: '036_seed_warna_dairy_admin.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Provision Warna Dairy Admin (+917507495615) and expand role check constraint' },
  { version: '037', filename: '037_multi_dairy_customer_identity_and_membership.sql', target: MigrationTarget.SHARED, description: 'Global customer identities and multi-dairy membership discovery directory' },
  { version: '038', filename: '038_platform_federation_database_mapping.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Register platform federation control plane database mapping' },
  { version: '039', filename: '039_milk_collections_organization_idempotency.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Composite uniqueness constraint on organization_id and idempotency_key for concurrent idempotency' },
  { version: '040', filename: '040_device_auth_challenges.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Distributed device authentication challenges, atomic single-use replay protection, and bounded failed attempt tracking' },
  { version: '041', filename: '041_dairy_admin_realtime_and_station_monitoring.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Dairy admin realtime events outbox and station monitoring' },
  { version: '042', filename: '042_union_bank_farmer_payout_and_settlement_system.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Union Bank farmer payout and settlement system tables' },
  { version: '043', filename: '043_distributed_sse_tickets_and_retention.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Distributed SSE tickets and event retention' },
  { version: '044', filename: '044_revoked_tokens_durable_revocation.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Durable token revocation table for distributed fail-closed JWT invalidation (RESTART-02.1)' },
  { version: '045', filename: '045_kiosk_shift_session_concurrency_and_ownership.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Atomic partial unique index for active kiosk shift sessions and tenant-scoped lookup indexes (RESTART-03)' },
  { version: '046', filename: '046_complete_milk_collection_session_organization_id.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Include organization_id in complete_milk_collection_session milk_collections insert after 039 NOT NULL constraint' },
  { version: '047', filename: '047_advance_response_contract_balanceAfter.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Fix post_customer_advance response contract: add balanceAfter alias to new-execution return for consistency with idempotent-replay path (RESTART-03.5 Fix F)' },
  { version: '048', filename: '048_union_bank_reconciliation_idempotency_hardening.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Allow REVERSED batch items, harden fail/reverse payout idempotency & conflict safety, and enforce tenant session RLS across reconciliation tables (DF-022 / RESTART-10)' },
  { version: '049', filename: '049_customer_beneficiary_bank_encryption_and_mask.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Widen customers.bank_account_number to TEXT for AES-256-GCM ciphertext, add customers.bank_account_mask with safe legacy backfill, and update create_customer_payout to use v_customer.bank_account_mask (RESTART-10.4)' },
];

export const MIGRATION_FILES: string[] = MIGRATION_MANIFEST
  .filter(m => m.target !== MigrationTarget.MANUAL_REVIEW_REQUIRED)
  .map(m => m.filename);

export const CONTROL_PLANE_MIGRATIONS: MigrationManifestEntry[] = MIGRATION_MANIFEST.filter(
  m => m.target === MigrationTarget.CONTROL_PLANE || m.target === MigrationTarget.SHARED
);

export const TENANT_OPERATIONAL_MIGRATIONS: MigrationManifestEntry[] = MIGRATION_MANIFEST.filter(
  m => m.target === MigrationTarget.TENANT_OPERATIONAL || m.target === MigrationTarget.SHARED
);

export const QUARANTINED_MIGRATIONS: MigrationManifestEntry[] = MIGRATION_MANIFEST.filter(
  m => m.target === MigrationTarget.MANUAL_REVIEW_REQUIRED
);

export const QUARANTINED_MIGRATION_FILENAMES: ReadonlySet<string> = new Set(
  QUARANTINED_MIGRATIONS.map(m => m.filename)
);

export const QUARANTINED_MIGRATION_VERSIONS: ReadonlySet<string> = new Set(
  QUARANTINED_MIGRATIONS.map(m => m.version)
);

export interface MigrationCatalogValidationResult {
  totalEntries: number;
  activeEntries: number;
  quarantinedEntries: number;
  controlPlaneCount: number;
  tenantOperationalCount: number;
  diskSqlFilesChecked: number;
}

const VALID_TARGETS = new Set<string>(Object.values(MigrationTarget));
const MIGRATION_FILENAME_PATTERN = /^(\d{3})_[a-zA-Z0-9_]+\.sql$/;

/**
 * Validates canonical migration catalog invariants and optional on-disk SQL file reconciliation.
 * Fails closed on duplicate active versions, unregistered SQL files, missing files,
 * non-monotonic ordering, or unauthorized duplicate numeric prefixes.
 */
export function validateMigrationCatalog(options: {
  manifest?: readonly MigrationManifestEntry[];
  diskFilenames?: readonly string[];
} = {}): MigrationCatalogValidationResult {
  const manifest = options.manifest ?? MIGRATION_MANIFEST;

  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error('Migration manifest must be a non-empty array');
  }

  const seenVersions = new Set<string>();
  const seenFilenames = new Set<string>();
  const prefixEntries = new Map<string, MigrationManifestEntry[]>();
  let previousPrefixNum = -1;
  let previousActiveVersionNum = -1;
  let activeCount = 0;
  let quarantinedCount = 0;

  for (const entry of manifest) {
    if (!entry.version || !entry.filename || !entry.description) {
      throw new Error(`Invalid migration manifest entry with missing metadata: ${JSON.stringify(entry)}`);
    }
    if (!VALID_TARGETS.has(entry.target)) {
      throw new Error(`Invalid migration target '${entry.target}' for '${entry.filename}'`);
    }

    const match = MIGRATION_FILENAME_PATTERN.exec(entry.filename);
    if (!match || !match[1]) {
      throw new Error(`Migration filename '${entry.filename}' does not match NNN_name.sql format`);
    }
    const numericPrefix = match[1];
    const prefixNum = Number.parseInt(numericPrefix, 10);

    if (seenFilenames.has(entry.filename)) {
      throw new Error(`Duplicate migration filename '${entry.filename}' in manifest`);
    }
    seenFilenames.add(entry.filename);

    if (seenVersions.has(entry.version)) {
      throw new Error(`Duplicate migration version '${entry.version}' in manifest`);
    }
    seenVersions.add(entry.version);

    if (prefixNum < previousPrefixNum) {
      throw new Error(
        `Non-deterministic migration ordering: '${entry.filename}' (prefix ${numericPrefix}) follows prefix ${String(previousPrefixNum).padStart(3, '0')}`
      );
    }
    previousPrefixNum = prefixNum;

    const bucket = prefixEntries.get(numericPrefix) ?? [];
    bucket.push(entry);
    prefixEntries.set(numericPrefix, bucket);

    if (entry.target === MigrationTarget.MANUAL_REVIEW_REQUIRED) {
      quarantinedCount++;
      if (!entry.version.endsWith('_quarantine') || !entry.version.startsWith(`${numericPrefix}_`)) {
        throw new Error(
          `Quarantined migration '${entry.filename}' must use non-colliding version '${numericPrefix}_quarantine' (got '${entry.version}')`
        );
      }
    } else {
      activeCount++;
      if (entry.version !== numericPrefix) {
        throw new Error(
          `Active migration '${entry.filename}' must use exact version '${numericPrefix}' (got '${entry.version}')`
        );
      }
      if (prefixNum <= previousActiveVersionNum) {
        throw new Error(
          `Duplicate or out-of-order active migration version '${entry.version}' for '${entry.filename}'`
        );
      }
      previousActiveVersionNum = prefixNum;
    }
  }

  for (const [prefix, entries] of prefixEntries.entries()) {
    if (entries.length > 1) {
      const activeForPrefix = entries.filter(e => e.target !== MigrationTarget.MANUAL_REVIEW_REQUIRED);
      const quarantinedForPrefix = entries.filter(e => e.target === MigrationTarget.MANUAL_REVIEW_REQUIRED);
      if (activeForPrefix.length > 1) {
        throw new Error(
          `Duplicate active migrations for numeric prefix '${prefix}': ${activeForPrefix.map(e => e.filename).join(', ')}`
        );
      }
      if (quarantinedForPrefix.length === 0) {
        throw new Error(
          `Duplicate numeric prefix '${prefix}' is only permitted under the explicit MANUAL_REVIEW_REQUIRED quarantine rule`
        );
      }
    }
  }

  let diskSqlFilesChecked = 0;
  if (options.diskFilenames !== undefined) {
    const sqlFiles = options.diskFilenames.filter(f => f.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
    const diskSet = new Set(sqlFiles);
    diskSqlFilesChecked = sqlFiles.length;

    const unknownFiles = sqlFiles.filter(f => !seenFilenames.has(f));
    if (unknownFiles.length > 0) {
      throw new Error(
        `Unregistered migration SQL file(s) found on disk (must be registered or quarantined in MIGRATION_MANIFEST): ${unknownFiles.join(', ')}`
      );
    }

    const missingFiles = manifest.filter(m => !diskSet.has(m.filename)).map(m => m.filename);
    if (missingFiles.length > 0) {
      throw new Error(`Missing migration SQL file(s) declared in MIGRATION_MANIFEST: ${missingFiles.join(', ')}`);
    }
  }

  const controlPlaneCount = manifest.filter(
    m => m.target === MigrationTarget.CONTROL_PLANE || m.target === MigrationTarget.SHARED
  ).length;
  const tenantOperationalCount = manifest.filter(
    m => m.target === MigrationTarget.TENANT_OPERATIONAL || m.target === MigrationTarget.SHARED
  ).length;

  return {
    totalEntries: manifest.length,
    activeEntries: activeCount,
    quarantinedEntries: quarantinedCount,
    controlPlaneCount,
    tenantOperationalCount,
    diskSqlFilesChecked,
  };
}

/**
 * Validates MIGRATION_MANIFEST against actual files in a migrations directory on disk.
 */
export function validateMigrationsDirectory(
  migrationsDir: string,
  manifest: readonly MigrationManifestEntry[] = MIGRATION_MANIFEST
): MigrationCatalogValidationResult {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }
  const diskEntries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const diskFilenames = diskEntries.filter(d => d.isFile()).map(d => d.name);
  const nonSqlEntries = diskEntries
    .filter(d => d.isFile() && !d.name.endsWith('.sql'))
    .map(d => d.name);
  if (nonSqlEntries.length > 0) {
    throw new Error(`Unexpected non-SQL file(s) found in migrations directory: ${nonSqlEntries.join(', ')}`);
  }
  return validateMigrationCatalog({ manifest, diskFilenames });
}

/**
 * Resolves a migration directory containing supabase/migrations SQL files.
 */
export function resolveMigrationsDir(startDir: string = process.cwd()): string {
  const candidates = [
    path.resolve(startDir, 'supabase/migrations'),
    path.resolve(startDir, '../supabase/migrations'),
    path.resolve(startDir, '../../supabase/migrations'),
    path.resolve(startDir, '../../../supabase/migrations'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  throw new Error('Could not locate supabase/migrations directory in workspace');
}
