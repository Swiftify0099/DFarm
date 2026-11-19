export declare enum MigrationTarget {
    CONTROL_PLANE = "CONTROL_PLANE",
    TENANT_OPERATIONAL = "TENANT_OPERATIONAL",
    SHARED = "SHARED",
    MANUAL_REVIEW_REQUIRED = "MANUAL_REVIEW_REQUIRED"
}
export interface MigrationManifestEntry {
    version: string;
    filename: string;
    target: MigrationTarget;
    description: string;
}
export declare const MIGRATION_MANIFEST: MigrationManifestEntry[];
export declare const CONTROL_PLANE_MIGRATIONS: MigrationManifestEntry[];
export declare const TENANT_OPERATIONAL_MIGRATIONS: MigrationManifestEntry[];
export declare const QUARANTINED_MIGRATIONS: MigrationManifestEntry[];
export interface MigrationExecutionResult {
    version: string;
    filename: string;
    checksum: string;
    status: 'APPLIED' | 'SKIPPED_ALREADY_APPLIED' | 'FAILED';
    durationMs: number;
    error?: string;
}
export declare class MigrationRunner {
    private static findMigrationsDir;
    static ensureSchemaMigrationsTable(client: {
        query: (text: string, params?: any[]) => Promise<any>;
    }): Promise<void>;
    static computeChecksum(content: string): string;
    static executeMigrationTrack(clientOrPool: {
        query: (text: string, params?: any[]) => Promise<any>;
    }, track: MigrationManifestEntry[], trackName: string): Promise<MigrationExecutionResult[]>;
    static runControlPlaneMigrations(clientOrPool: any): Promise<MigrationExecutionResult[]>;
    static runTenantMigrations(clientOrPool: any, dairyId: string): Promise<MigrationExecutionResult[]>;
}
//# sourceMappingURL=MigrationRunner.d.ts.map