import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Client } = pg;
const TARGET_PHONE = '7507495615';

async function main() {
  const connectionString =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

  console.log(`[PURGE] Connecting to database...`);
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 });

  let isConnected = false;
  try {
    await client.connect();
    isConnected = true;
    console.log(`[PURGE] Connected to PostgreSQL.`);
  } catch (err) {
    console.log(`[PURGE] PostgreSQL instance not reachable at ${connectionString}.`);
    console.log(`[PURGE] (Backend runs pg-mem in-memory database when Postgres is offline).`);
  }

  if (isConnected) {
    try {
      console.log(`[PURGE] Searching records matching '${TARGET_PHONE}'...`);

      const usersRes = await client.query(
        `SELECT id, username, full_name, role, user_role, phone_number, mobile_number, normalized_mobile_number, organization_id 
         FROM users 
         WHERE phone_number LIKE $1 
            OR mobile_number LIKE $1 
            OR normalized_mobile_number LIKE $1 
            OR username LIKE $2;`,
        [`%${TARGET_PHONE}%`, `%${TARGET_PHONE}%`]
      );

      console.log(`[PURGE] Found ${usersRes.rows.length} user(s) matching ${TARGET_PHONE}.`);
      usersRes.rows.forEach((u) => console.log(`   - User: [${u.id}] ${u.full_name} (${u.role || u.user_role}) Org: ${u.organization_id}`));

      const userIds = usersRes.rows.map((u) => u.id);
      const orgIds = usersRes.rows.map((u) => u.organization_id).filter(Boolean);

      // Also check organizations by phone
      const orgsRes = await client.query(
        `SELECT id, code, name, business_phone FROM organizations WHERE business_phone LIKE $1;`,
        [`%${TARGET_PHONE}%`]
      );
      orgsRes.rows.forEach((o) => {
        if (!orgIds.includes(o.id)) orgIds.push(o.id);
        console.log(`   - Organization: [${o.id}] ${o.name} (${o.code})`);
      });

      // 1. Delete invitations
      if (userIds.length || orgIds.length) {
        const invDel = await client.query(
          `DELETE FROM dairy_admin_invitations 
           WHERE admin_id = ANY($1::uuid[]) 
              OR dairy_id = ANY($2::uuid[])
              OR email LIKE $3 RETURNING id;`,
          [
            userIds.length ? userIds : ['00000000-0000-0000-0000-000000000000'],
            orgIds.length ? orgIds : ['00000000-0000-0000-0000-000000000000'],
            `%${TARGET_PHONE}%`
          ]
        );
        console.log(`[PURGE] Deleted ${invDel.rowCount} invitation(s).`);
      }

      // 2. Delete user_center_assignments
      if (userIds.length) {
        try {
          const ucaDel = await client.query(
            `DELETE FROM user_center_assignments WHERE user_id = ANY($1::uuid[]) RETURNING id;`,
            [userIds]
          );
          console.log(`[PURGE] Deleted ${ucaDel.rowCount} user_center_assignment(s).`);
        } catch {}
      }

      // 3. Delete users
      if (userIds.length) {
        const usrDel = await client.query(
          `DELETE FROM users WHERE id = ANY($1::uuid[]) RETURNING id;`,
          [userIds]
        );
        console.log(`[PURGE] Deleted ${usrDel.rowCount} user(s).`);
      }

      // 4. Delete centers & organizations if orphan
      if (orgIds.length) {
        try {
          const dcDel = await client.query(
            `DELETE FROM dairy_centers WHERE organization_id = ANY($1::uuid[]) RETURNING id;`,
            [orgIds]
          );
          console.log(`[PURGE] Deleted ${dcDel.rowCount} dairy_center(s).`);
        } catch {}

        try {
          const orgDel = await client.query(
            `DELETE FROM organizations WHERE id = ANY($1::uuid[]) RETURNING id;`,
            [orgIds]
          );
          console.log(`[PURGE] Deleted ${orgDel.rowCount} organization(s).`);
        } catch {}
      }

      console.log(`[PURGE] Database purge completed successfully.`);
    } catch (err) {
      console.error(`[PURGE] Error during PostgreSQL purge:`, err.message);
    } finally {
      await client.end();
    }
  }

  console.log(`[PURGE] Done.`);
}

main().catch(console.error);
