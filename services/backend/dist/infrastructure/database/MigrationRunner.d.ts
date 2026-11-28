import { MigrationTarget, type MigrationManifestEntry, type MigrationClientMode, type MigrationClientCapabilities, type MigrationExecutionResult, type MigrationExecutionOptions, type QueryableClient, MIGRATION_MANIFEST, MIGRATION_FILES, CONTROL_PLANE_MIGRATIONS, TENANT_OPERATIONAL_MIGRATIONS, QUARANTINED_MIGRATIONS, QUARANTINED_MIGRATION_FILENAMES, QUARANTINED_MIGRATION_VERSIONS } from '@dfarm/database';
export { MigrationTarget, type MigrationManifestEntry, type MigrationClientMode, type MigrationClientCapabilities, type MigrationExecutionResult, type MigrationExecutionOptions, type QueryableClient, MIGRATION_MANIFEST, MIGRATION_FILES, CONTROL_PLANE_MIGRATIONS, TENANT_OPERATIONAL_MIGRATIONS, QUARANTINED_MIGRATIONS, QUARANTINED_MIGRATION_FILENAMES, QUARANTINED_MIGRATION_VERSIONS, };
export declare class MigrationRunner {
    static computeAdvisoryLockKey(lockScope: string): string;
    static ensureSchemaMigrationsTable(client: QueryableClient, options?: MigrationExecutionOptions): Promise<void>;
    static computeChecksum(content: string): string;
    static executeMigrationTrack(clientOrPool: QueryableClient, track: MigrationManifestEntry[], trackName: string, options?: MigrationExecutionOptions): Promise<MigrationExecutionResult[]>;
    static runControlPlaneMigrations(clientOrPool: QueryableClient, options?: Omit<MigrationExecutionOptions, 'allowCustomTrackForTesting'>): Promise<MigrationExecutionResult[]>;
    static runTenantMigrations(clientOrPool: QueryableClient, dairyId: string, options?: Omit<MigrationExecutionOptions, 'allowCustomTrackForTesting'>): Promise<MigrationExecutionResult[]>;
}
//# sourceMappingURL=MigrationRunner.d.ts.map