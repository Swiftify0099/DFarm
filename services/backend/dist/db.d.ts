import pg from 'pg';
export declare const pool: pg.Pool;
export declare const query: <T extends pg.QueryResultRow = any>(text: string, params?: any[]) => Promise<pg.QueryResult<T>>;
//# sourceMappingURL=db.d.ts.map