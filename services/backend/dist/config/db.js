import pg from 'pg';
import { config } from './env.js';
const { Pool } = pg;
export const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
});
export async function query(text, params) {
    return pool.query(text, params);
}
//# sourceMappingURL=db.js.map