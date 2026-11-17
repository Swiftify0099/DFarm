import pg from 'pg';
export interface IDatabaseClient {
    query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>>;
    withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T>;
    close?(): Promise<void>;
}
export interface TenantDatabaseMapping {
    id: string;
    dairyId: string;
    dairyCode: string;
    databaseName: string;
    resourceType: 'PHYSICAL_DATABASE' | 'DEDICATED_SCHEMA' | 'ISOLATED_INSTANCE';
    connectionUriEncrypted?: string;
    schemaVersion: string;
    provisioningStatus: 'PENDING' | 'PROVISIONING' | 'MIGRATED' | 'ACTIVE' | 'FAILED';
    provisioningError?: string;
    provisionedAt: string;
    lastVerifiedAt: string;
}
export declare class TenantDatabaseManager {
    private static instance;
    private readonly tenantClients;
    private readonly tenantMappings;
    private isPostgresConnected;
    private controlPlaneDb;
    private isInitialized;
    private constructor();
    static getInstance(): TenantDatabaseManager;
    setControlPlaneDb(db: IDatabaseClient): void;
    initialize(controlPlaneDb: IDatabaseClient): Promise<void>;
    provisionTenantDatabase(dairyId: string, dairyCode: string, dairyName: string): Promise<TenantDatabaseMapping>;
    getTenantDb(dairyId?: string): Promise<IDatabaseClient>;
    getMapping(dairyId: string): TenantDatabaseMapping | undefined;
    getAllMappings(): TenantDatabaseMapping[];
    getAllTenantDbs(): IDatabaseClient[];
    verifyTenantDatabase(dairyId: string): Promise<boolean>;
    private checkPostgresAvailable;
    private createPostgresTenantResource;
    private createIsolatedMemoryDatabase;
    private applyTenantMigrations;
}
export declare const tenantDbManager: TenantDatabaseManager;
//# sourceMappingURL=TenantDatabaseManager.d.ts.map