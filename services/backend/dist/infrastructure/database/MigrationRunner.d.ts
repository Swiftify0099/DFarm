import { MigrationTarget, type MigrationManifestEntry, MIGRATION_MANIFEST, MIGRATION_FILES, CONTROL_PLANE_MIGRATIONS, TENANT_OPERATIONAL_MIGRATIONS, QUARANTINED_MIGRATIONS, QUARANTINED_MIGRATION_FILENAMES, QUARANTINED_MIGRATION_VERSIONS } from '@dfarm/database';
export { MigrationTarget, type MigrationManifestEntry, MIGRATION_MANIFEST, MIGRATION_FILES, CONTROL_PLANE_MIGRATIONS, TENANT_OPERATIONAL_MIGRATIONS, QUARANTINED_MIGRATIONS, QUARANTINED_MIGRATION_FILENAMES, QUARANTINED_MIGRATION_VERSIONS, };
export interface MigrationExecutionResult {
    version: string;
    filename: string;
    checksum: string;
    storedChecksum?: string;
    checksumMismatch?: boolean;
    status: 'APPLIED' | 'SKIPPED_ALREADY_APPLIED' | 'FAILED';
    durationMs: number;
    error?: string;
}
export interface MigrationExecutionOptions {
    migrationsDir?: string;
    skipDiskCatalogValidation?: boolean;
}
interface QueryableClient {
    query: (text: string, params?: any[]) => Promise<any>;
    connect?: () => Promise<any>;
    withTransaction?: <T>(callback: (client: any) => Promise<T>) => Promise<T>;
    totalCount?: number;
    __isPgMem?: boolean;
}
export declare class MigrationRunner {
    private static findMigrationsDir;
    private static isPgPool;
    private static validateTrackInputs;
    static ensureSchemaMigrationsTable(client: {
        query: (text: string, params?: any[]) => Promise<any>;
    }): Promise<void>;
    static computeChecksum(content: string): string;
    private static executeSingleMigrationAtomically;
    static executeMigrationTrack(clientOrPool: QueryableClient, track: MigrationManifestEntry[], trackName: string, options?: MigrationExecutionOptions): Promise<MigrationExecutionResult[]>;
    static runControlPlaneMigrations(clientOrPool: any, options?: MigrationExecutionOptions): Promise<MigrationExecutionResult[]>;
    static runTenantMigrations(clientOrPool: any, dairyId: string, options?: MigrationExecutionOptions): Promise<MigrationExecutionResult[]>;
}
//# sourceMappingURL=MigrationRunner.d.ts.map