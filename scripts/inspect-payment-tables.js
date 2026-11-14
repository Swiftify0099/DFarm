import pg from 'pg';
const client = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function main() {
  await client.connect();
  const res1 = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='customer_payments' ORDER BY ordinal_position;");
  console.log('customer_payments columns:', res1.rows.map(r => `${r.column_name} (${r.data_type})`));
  const res2 = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='monthly_bills' ORDER BY ordinal_position;");
  console.log('monthly_bills columns:', res2.rows.map(r => `${r.column_name} (${r.data_type})`));
  await client.end();
}
main().catch(console.error);

