import { db } from '../infrastructure/database/PostgresPool.js';
export const pool = {
    query: (text, params) => db.query(text, params),
    connect: () => db.getClient(),
    on: (_event, _listener) => { },
    end: () => db.close(),
};
export async function query(text, params) {
    return db.query(text, params);
}
//# sourceMappingURL=db.js.map