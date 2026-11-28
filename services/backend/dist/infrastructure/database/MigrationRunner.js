import { MigrationTarget, MIGRATION_MANIFEST, MIGRATION_FILES, CONTROL_PLANE_MIGRATIONS, TENANT_OPERATIONAL_MIGRATIONS, QUARANTINED_MIGRATIONS, QUARANTINED_MIGRATION_FILENAMES, QUARANTINED_MIGRATION_VERSIONS, computeMigrationLockKey, computeMigrationChecksum, ensureMigrationTrackingTables, executeMigrationTrackCore, } from '@dfarm/database';
import { logger } from '../../shared/logger/index.js';
export { MigrationTarget, MIGRATION_MANIFEST, MIGRATION_FILES, CONTROL_PLANE_MIGRATIONS, TENANT_OPERATIONAL_MIGRATIONS, QUARANTINED_MIGRATIONS, QUARANTINED_MIGRATION_FILENAMES, QUARANTINED_MIGRATION_VERSIONS, };
export class MigrationRunner {
    static computeAdvisoryLockKey(lockScope) {
        return computeMigrationLockKey(lockScope);
    }
    static async ensureSchemaMigrationsTable(client, options) {
        await ensureMigrationTrackingTables(client, options);
    }
    static computeChecksum(content) {
        return computeMigrationChecksum(content);
    }
    static async executeMigrationTrack(clientOrPool, track, trackName, options) {
        return executeMigrationTrackCore(clientOrPool, track, trackName, {
            ...options,
            logger: options?.logger ?? logger,
        });
    }
    static async runControlPlaneMigrations(clientOrPool, options) {
        if (options && options.allowCustomTrackForTesting) {
            throw new Error('runControlPlaneMigrations cannot be invoked with allowCustomTrackForTesting');
        }
        return this.executeMigrationTrack(clientOrPool, CONTROL_PLANE_MIGRATIONS, 'control_plane', options);
    }
    static async runTenantMigrations(clientOrPool, dairyId, options) {
        if (!dairyId || typeof dairyId !== 'string' || !dairyId.trim()) {
            throw new Error('runTenantMigrations requires a non-empty dairyId');
        }
        if (options && options.allowCustomTrackForTesting) {
            throw new Error('runTenantMigrations cannot be invoked with allowCustomTrackForTesting');
        }
        const normalizedDairyId = dairyId.trim().toLowerCase();
        return this.executeMigrationTrack(clientOrPool, TENANT_OPERATIONAL_MIGRATIONS, `tenant_${normalizedDairyId}`, options);
    }
}
//# sourceMappingURL=MigrationRunner.js.map