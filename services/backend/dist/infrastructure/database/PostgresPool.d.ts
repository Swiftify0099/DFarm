import pg from 'pg';
export declare class PostgresDatabase {
    private static instance;
    readonly pool: pg.Pool;
    private memDbAdapter;
    private isPostgresConnected;
    private closePromise;
    private constructor();
    static getInstance(): PostgresDatabase;
    private withTimeout;
    checkConnection(): Promise<boolean>;
    getHealth(): {
        status: 'CONNECTED' | 'DISCONNECTED';
        databaseMode: 'PHYSICAL_POSTGRES' | 'TEST_ISOLATED_MEM_DB';
        poolSize: number;
        idleCount: number;
        waitingCount: number;
    };
    private isRealPostgresRequired;
    private isTestEnvironment;
    /**
     * Explicit In-Memory Test Double: Allowed in unit tests and development fallback
     * when physical PostgreSQL cluster is unreachable.
     * STRICTLY prohibited in production server runtime and when REQUIRE_REAL_POSTGRES=1.
     */
    private getOrCreateTestMemDb;
    query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>>;
    getClient(): Promise<any>;
    withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T>;
    private waitForExternalPoolShutdown;
    close(): Promise<void>;
}
export declare const db: PostgresDatabase;
//# sourceMappingURL=PostgresPool.d.ts.map