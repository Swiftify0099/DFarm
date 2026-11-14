import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function main() {
  await client.connect();
  const roles = [
    'SUPER_ADMIN',
    'DAIRY_OWNER',
    'CENTER_MANAGER',
    'SUPERVISOR',
    'COLLECTION_OPERATOR',
    'ACCOUNTANT',
    'INVENTORY_MANAGER',
    'REGISTRATION_OFFICER',
    'FARMER_CUSTOMER',
  ];

  for (const r of roles) {
    // 1. Ensure authenticator can SET ROLE to this role
    await client.query(`GRANT "${r}" TO authenticator;`);
    await client.query(`GRANT "${r}" TO postgres;`);

    // 2. Ensure this role inherits permissions and RLS policies from authenticated
    await client.query(`GRANT authenticated TO "${r}";`);
  }

  await client.query(`NOTIFY pgrst, 'reload schema';`);
  console.log('Roles fixed successfully and pgrst reloaded!');
  await client.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

