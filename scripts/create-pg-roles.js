import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
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
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${r}') THEN
          CREATE ROLE "${r}" WITH NOLOGIN;
        END IF;
      END $$;
    `);
    // Revoke circular membership if exists
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_catalog.pg_auth_members m
          JOIN pg_catalog.pg_roles r_member ON m.member = r_member.oid
          JOIN pg_catalog.pg_roles r_role ON m.roleid = r_role.oid
          WHERE r_member.rolname = '${r}' AND r_role.rolname = 'authenticated'
        ) THEN
          REVOKE authenticated FROM "${r}";
        END IF;
      END $$;
    `);
    await client.query(`GRANT "${r}" TO postgres;`);
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticator') THEN
          GRANT "${r}" TO authenticator;
        END IF;
      END $$;
    `);
    await client.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO "${r}";`);
    await client.query(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO "${r}";`);
    await client.query(`GRANT ALL ON ALL ROUTINES IN SCHEMA public TO "${r}";`);
  }

  console.log('PostgreSQL roles granted successfully!');
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
