import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function main() {
  await client.connect();
  const tables = ['milk_collections', 'sync_conflict_records', 'sync_events'];
  for (const t of tables) {
    const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [t]);
    console.log(t + ':', res.rows.map(r => r.column_name).join(', '));
  }
  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });

