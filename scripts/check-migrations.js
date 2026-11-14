import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
await client.connect();
try {
  const migRes = await client.query('SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;');
  console.log('Applied migrations:', migRes.rows);
  const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;");
  console.log('Public tables count:', tables.rows.length);
  console.log('Tables:', tables.rows.map(r => r.table_name));
} catch (err) {
  console.error('Error:', err);
} finally {
  await client.end();
}

