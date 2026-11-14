import pg from 'pg';
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const pool = new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
});
export const query = (text, params) => pool.query(text, params);
//# sourceMappingURL=db.js.map