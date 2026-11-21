import pg from 'pg';
import { db } from './infrastructure/database/PostgresPool.js';

export const pool = {
  query: <T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> =>
    db.query<T>(text, params),
  connect: (): Promise<any> => db.getClient(),
  on: (_event: string, _listener: any): void => {},
  end: (): Promise<void> => db.close(),
} as unknown as pg.Pool;

export const query = <T extends pg.QueryResultRow = any>(text: string, params?: any[]): Promise<pg.QueryResult<T>> =>
  db.query<T>(text, params);
