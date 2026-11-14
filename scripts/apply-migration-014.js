import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
await client.connect();

try {
  const sqlPath = path.resolve('supabase/migrations/014_feed_inventory_procurement_and_sales.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');
  console.log('Applying 014_feed_inventory_procurement_and_sales.sql...');
  await client.query(sql);
  console.log('Migration 014 applied successfully!');

  // Also record in supabase_migrations.schema_migrations if table exists
  try {
    await client.query(`
      INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
      VALUES ('014', 'feed_inventory_procurement_and_sales', ARRAY[$1])
      ON CONFLICT (version) DO NOTHING;
    `, [sql]);
    console.log('Recorded in schema_migrations');
  } catch (e) {
    console.log('schema_migrations insert skipped or errored:', e.message);
  }

  const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;");
  console.log('Total public tables count now:', res.rows.length);
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
} finally {
  await client.end();
}

