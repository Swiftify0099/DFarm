import pg from 'pg';
export interface IDatabaseClient {
    query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>>;
    withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T>;
    close?(): Promise<void>;
}
export type ProvisioningStatus = 'PENDING' | 'PROVISIONING' | 'DATABASE_CREATED' | 'MIGRATING' | 'VERIFYING' | 'ACTIVE' | 'FAILED' | 'RETRY_REQUIRED' | 'ORPHANED_RESOURCE';
export interface TenantDatabaseMapping {
    id: string;
    dairyId: string;
    dairyCode: string;
    databaseName: string;
    resourceType: 'PHYSICAL_DATABASE' | 'ISOLATED_TEST_INSTANCE';
    connectionUriEncrypted?: string;
    schemaVersion: string;
    provisioningStatus: ProvisioningStatus;
    provisioningError?: string;
    provisionedAt?: string;
    lastVerifiedAt: string;
}
export interface ProvisionTenantParams {
    dairyId: string;
    dairyCode: string;
    dairyName: string;
    adminConnectionString?: string;
}
export declare class TenantDatabaseUnavailableError extends Error {
    readonly dairyId: string;
    readonly status: string;
    readonly details?: string | undefined;
    constructor(dairyId: string, status: string, details?: string | undefined);
}
export declare class TenantDatabaseManager {
    private static instance;
    private readonly tenantPools;
    private readonly tenantMappings;
    private readonly tenantMemDbs;
    private controlPlaneDb;
    private isInitialized;
    private constructor();
    static getInstance(): TenantDatabaseManager;
    private isTestEnvironment;
    getControlPlaneDb(): IDatabaseClient;
    setControlPlaneDb(db: IDatabaseClient): void;
    initialize(controlPlaneDb?: IDatabaseClient): Promise<void>;
    getTenantMapping(dairyId: string): TenantDatabaseMapping | null;
    getAllMappings(): TenantDatabaseMapping[];
    getAllTenantDbs(): IDatabaseClient[];
    /**
     * Generates a safe, sanitized, unique PostgreSQL database name for a dairy tenant.
     * Conforms to PostgreSQL identifier rules (max 63 characters).
     */
    generateTenantDatabaseName(dairyId: string, dairyCode: string): string;
    /**
     * Provisions a separate PostgreSQL database for a Dairy Tenant.
     *
     * State Machine:
     * PENDING -> PROVISIONING -> DATABASE_CREATED -> MIGRATING -> VERIFYING -> ACTIVE
     *
     * Invariants:
     * - Must create a REAL, separate PostgreSQL database in the cluster (or isolated test double in NODE_ENV=test).
     * - NEVER falls back to schema-per-tenant.
     * - Applies full operational migration track (001 through 027).
     * - Enforces tenant_metadata table containing the central Dairy UUID.
     * - Encrypts connection credentials at rest with AES-256-GCM.
     */
    provisionTenantDatabase(paramsOrDairyId: ProvisionTenantParams | string, dairyCode?: string, dairyName?: string): Promise<TenantDatabaseMapping>;
    /**
     * Resolves an authorized, bounded database client for the specified Dairy.
     * Throws if no active mapping exists. Never falls back to central DB or creates a fake DB.
     */
    getTenantDb(dairyId?: string): Promise<IDatabaseClient>;
    verifyTenantDatabase(dairyId: string): Promise<{
        isVerified: boolean;
        databaseName?: string;
        schemaVersion?: string;
        error?: string;
    }>;
    closeTenantPool(dairyId: string): Promise<void>;
    evictTenantPool(dairyId: string): Promise<void>;
    closeAllPools(): Promise<void>;
    getSafeHealthStatus(): Promise<{
        status: 'READY' | 'DEGRADED';
        totalActiveTenants: number;
        activePoolCount: number;
        pools: {
            dairyId: string;
            totalCount: number;
            idleCount: number;
            waitingCount: number;
        }[];
    }>;
    private wrapPgPool;
    private deriveAdminDatabaseUri;
    private deriveTenantUri;
    private persistMappingStatus;
    private createIsolatedMemoryDatabase;
}
export declare const tenantDbManager: TenantDatabaseManager;
//# sourceMappingURL=TenantDatabaseManager.d.ts.map