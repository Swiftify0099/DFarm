import pg from 'pg';
export declare class PostgresDatabase {
    private static instance;
    readonly pool: pg.Pool;
    private memDbAdapter;
    private isPostgresConnected;
    private constructor();
    static getInstance(): PostgresDatabase;
    private getOrCreateMemDb;
    query<T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>>;
    withTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
export declare const db: PostgresDatabase;
//# sourceMappingURL=PostgresPool.d.ts.map