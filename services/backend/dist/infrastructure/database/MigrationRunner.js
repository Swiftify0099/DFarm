import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from '../../shared/logger/index.js';
export var MigrationTarget;
(function (MigrationTarget) {
    MigrationTarget["CONTROL_PLANE"] = "CONTROL_PLANE";
    MigrationTarget["TENANT_OPERATIONAL"] = "TENANT_OPERATIONAL";
    MigrationTarget["SHARED"] = "SHARED";
    MigrationTarget["MANUAL_REVIEW_REQUIRED"] = "MANUAL_REVIEW_REQUIRED";
})(MigrationTarget || (MigrationTarget = {}));
export const MIGRATION_MANIFEST = [
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
    { version: '040', filename: '040_device_auth_challenges.sql', target: MigrationTarget.SHARED, description: 'Distributed device authentication challenges, atomic single-use replay protection, and bounded failed attempt tracking' },
    { version: '041', filename: '041_dairy_admin_realtime_and_station_monitoring.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Dairy admin realtime events outbox and station monitoring' },
    { version: '042', filename: '042_union_bank_farmer_payout_and_settlement_system.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Union Bank farmer payout and settlement system tables' },
    { version: '043', filename: '043_distributed_sse_tickets_and_retention.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Distributed SSE tickets and event retention' },
    { version: '044', filename: '044_revoked_tokens_durable_revocation.sql', target: MigrationTarget.CONTROL_PLANE, description: 'Durable token revocation table for distributed fail-closed JWT invalidation (RESTART-02.1)' },
    { version: '045', filename: '045_kiosk_shift_session_concurrency_and_ownership.sql', target: MigrationTarget.TENANT_OPERATIONAL, description: 'Atomic partial unique index for active kiosk shift sessions and tenant-scoped lookup indexes (RESTART-03)' },
];
export const CONTROL_PLANE_MIGRATIONS = MIGRATION_MANIFEST.filter(m => m.target === MigrationTarget.CONTROL_PLANE || m.target === MigrationTarget.SHARED);
export const TENANT_OPERATIONAL_MIGRATIONS = MIGRATION_MANIFEST.filter(m => m.target === MigrationTarget.TENANT_OPERATIONAL || m.target === MigrationTarget.SHARED);
export const QUARANTINED_MIGRATIONS = MIGRATION_MANIFEST.filter(m => m.target === MigrationTarget.MANUAL_REVIEW_REQUIRED);
export class MigrationRunner {
    static findMigrationsDir() {
        const candidates = [
            path.resolve(process.cwd(), 'supabase/migrations'),
            path.resolve(process.cwd(), '../supabase/migrations'),
            path.resolve(process.cwd(), '../../supabase/migrations'),
            path.resolve(process.cwd(), '../../../supabase/migrations'),
        ];
        for (const dir of candidates) {
            if (fs.existsSync(dir)) {
                return dir;
            }
        }
        throw new Error('Could not locate supabase/migrations directory in workspace');
    }
    static async ensureSchemaMigrationsTable(client) {
        try {
            await client.query(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ BEGIN RETURN NULL; END; $$ LANGUAGE plpgsql STABLE;
        CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
          version VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          statements TEXT[],
          inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
        }
        catch {
            // In case of restricted database privileges or memory double
        }
        await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        execution_time_ms INTEGER NOT NULL
      );
    `);
        // Synchronize historical records from supabase_migrations.schema_migrations if present
        try {
            await client.query(`
        INSERT INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms)
        SELECT version, name, 'HISTORICAL_SUPABASE_RECORD', inserted_at, 0
        FROM supabase_migrations.schema_migrations
        ON CONFLICT (version) DO NOTHING;
      `);
        }
        catch {
            // In case supabase_migrations table is absent or restricted
        }
    }
    static computeChecksum(content) {
        return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    }
    static async executeMigrationTrack(clientOrPool, track, trackName) {
        const migrationsDir = this.findMigrationsDir();
        const results = [];
        // 1. Ensure tracking table exists
        await this.ensureSchemaMigrationsTable(clientOrPool);
        // 2. Try acquiring advisory lock if running on PostgreSQL
        let lockAcquired = false;
        try {
            await clientOrPool.query(`SELECT pg_advisory_lock(hashtext('dfarm_migration_lock_${trackName}'));`);
            lockAcquired = true;
        }
        catch {
            // Advisory locks not supported (e.g. pg-mem), proceed safely
        }
        try {
            // 3. Fetch already applied versions
            const appliedRes = await clientOrPool.query(`SELECT version, checksum FROM schema_migrations;`);
            const appliedMap = new Map();
            for (const row of appliedRes.rows) {
                appliedMap.set(row.version, row.checksum);
            }
            // 4. Execute pending migrations in strict order
            for (const entry of track) {
                if (entry.target === MigrationTarget.MANUAL_REVIEW_REQUIRED) {
                    logger.warn({ filename: entry.filename }, 'Skipping quarantined manual-review-only script');
                    continue;
                }
                const filePath = path.join(migrationsDir, entry.filename);
                if (!fs.existsSync(filePath)) {
                    throw new Error(`Migration file not found: ${filePath}`);
                }
                const rawContent = fs.readFileSync(filePath, 'utf8');
                const checksum = this.computeChecksum(rawContent);
                if (appliedMap.has(entry.version)) {
                    const storedChecksum = appliedMap.get(entry.version);
                    if (storedChecksum && storedChecksum !== checksum) {
                        logger.warn({ version: entry.version, filename: entry.filename }, 'Migration checksum mismatch: file was modified after being applied to this database');
                    }
                    results.push({
                        version: entry.version,
                        filename: entry.filename,
                        checksum,
                        status: 'SKIPPED_ALREADY_APPLIED',
                        durationMs: 0,
                    });
                    continue;
                }
                const startTime = Date.now();
                logger.info({ version: entry.version, filename: entry.filename, track: trackName }, 'Applying migration...');
                try {
                    // Execute migration SQL
                    await clientOrPool.query(rawContent);
                    const durationMs = Date.now() - startTime;
                    await clientOrPool.query(`INSERT INTO schema_migrations (version, name, checksum, applied_at, execution_time_ms)
             VALUES ($1, $2, $3, NOW(), $4)
             ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = NOW();`, [entry.version, entry.filename, checksum, durationMs]);
                    try {
                        await clientOrPool.query(`INSERT INTO supabase_migrations.schema_migrations (version, name, inserted_at)
               VALUES ($1, $2, NOW())
               ON CONFLICT (version) DO NOTHING;`, [entry.version, entry.filename]);
                    }
                    catch { }
                    results.push({
                        version: entry.version,
                        filename: entry.filename,
                        checksum,
                        status: 'APPLIED',
                        durationMs,
                    });
                    logger.info({ version: entry.version, durationMs }, 'Migration applied successfully');
                }
                catch (err) {
                    const durationMs = Date.now() - startTime;
                    logger.error({ version: entry.version, filename: entry.filename, error: err.message }, 'Migration failed');
                    results.push({
                        version: entry.version,
                        filename: entry.filename,
                        checksum,
                        status: 'FAILED',
                        durationMs,
                        error: err.message,
                    });
                    throw new Error(`Migration ${entry.filename} (v${entry.version}) failed: ${err.message}`);
                }
            }
        }
        finally {
            if (lockAcquired) {
                try {
                    await clientOrPool.query(`SELECT pg_advisory_unlock(hashtext('dfarm_migration_lock_${trackName}'));`);
                }
                catch {
                    // Ignore unlock failure on closed connection
                }
            }
        }
        return results;
    }
    static async runControlPlaneMigrations(clientOrPool) {
        return this.executeMigrationTrack(clientOrPool, CONTROL_PLANE_MIGRATIONS, 'control_plane');
    }
    static async runTenantMigrations(clientOrPool, dairyId) {
        return this.executeMigrationTrack(clientOrPool, TENANT_OPERATIONAL_MIGRATIONS, `tenant_${dairyId.slice(0, 8)}`);
    }
}
//# sourceMappingURL=MigrationRunner.js.map