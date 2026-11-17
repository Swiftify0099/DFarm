import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import crypto from 'node:crypto';

const { Client } = pg;
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

describe('DFarm Real PostgreSQL Database & RLS Security Verification Suite', { skip: !process.env.TEST_REAL_POSTGRES }, () => {
  let client;

  // Synthetic Test UUIDs across two independent organizations
  const org1Id = crypto.randomUUID();
  const org2Id = crypto.randomUUID();
  const center1AId = crypto.randomUUID();
  const center1BId = crypto.randomUUID();
  const center2AId = crypto.randomUUID();

  const userAdmin1Id = crypto.randomUUID();
  const userOperator1AId = crypto.randomUUID();
  const userAdmin2Id = crypto.randomUUID();

  const cust1AId = crypto.randomUUID();
  const cust1BId = crypto.randomUUID();
  const cust2AId = crypto.randomUUID();

  const rfidCard1Id = crypto.randomUUID();
  const rfidCard2Id = crypto.randomUUID();

  const faceModelV1Id = crypto.randomUUID();

  before(async () => {
    client = new Client({ connectionString: DB_URL });
    await client.connect();

    // Verify database connectivity and version
    const verRes = await client.query('SELECT version();');
    assert.ok(verRes.rows[0].version.includes('PostgreSQL'), 'Must run against PostgreSQL server');

    // Cleanly truncate all public tables to ensure clean, repeatable test runs
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    if (tablesRes.rows.length > 0) {
      const allTables = tablesRes.rows.map(r => `"${r.table_name}"`).join(', ');
      await client.query(`TRUNCATE TABLE ${allTables} CASCADE;`);
    }
  });

  after(async () => {
    if (client) {
      await client.end();
    }
  });

  it('1. All expected 43 tables must exist in the real PostgreSQL catalog', async () => {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    assert.ok(res.rows.length >= 43, `Expected at least 43 public tables, found ${res.rows.length}`);
    const tableNames = res.rows.map(r => r.table_name);
    assert.ok(tableNames.includes('organizations'));
    assert.ok(tableNames.includes('dairy_centers'));
    assert.ok(tableNames.includes('customers'));
    assert.ok(tableNames.includes('milk_collections'));
    assert.ok(tableNames.includes('customer_ledger_accounts'));
    assert.ok(tableNames.includes('ledger_transactions'));
    assert.ok(tableNames.includes('ledger_entries'));
    assert.ok(tableNames.includes('face_enrollments'));
    assert.ok(tableNames.includes('rfid_cards'));
    assert.ok(tableNames.includes('devices'));
  });

  it('2. Seed synthetic organizations, centers, and users for two separate organizations', async () => {
    // Org 1: Sangli Union
    await client.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES ('${org1Id}', 'Sangli District Cooperative Union', 'SDCU_01', 'ACTIVE');
    `);

    // Org 2: Kolhapur Union
    await client.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES ('${org2Id}', 'Kolhapur District Cooperative Union', 'KDCU_02', 'ACTIVE');
    `);

    // Centers for Org 1
    await client.query(`
      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone)
      VALUES 
      ('${center1AId}', '${org1Id}', 'C101', 'Tasgaon Intake Center', 'Main Road', 'Tasgaon', 'Sangli', 'Maharashtra', '416312', '+919800000001'),
      ('${center1BId}', '${org1Id}', 'C102', 'Miraj Intake Center', 'Station Road', 'Miraj', 'Sangli', 'Maharashtra', '416410', '+919800000002');
    `);

    // Center for Org 2
    await client.query(`
      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone)
      VALUES 
      ('${center2AId}', '${org2Id}', 'C201', 'Karveer Intake Center', 'Market Yard', 'Karveer', 'Kolhapur', 'Maharashtra', '416001', '+919800000003');
    `);

    // Users
    await client.query(`
      INSERT INTO users (id, organization_id, username, full_name, phone_number, role)
      VALUES 
      ('${userAdmin1Id}', '${org1Id}', 'owner_sangli', 'Sangli Owner', '+919822000001', 'DAIRY_OWNER'),
      ('${userOperator1AId}', '${org1Id}', 'operator_tasgaon', 'Tasgaon Operator', '+919822000002', 'COLLECTION_OPERATOR'),
      ('${userAdmin2Id}', '${org2Id}', 'owner_kolhapur', 'Kolhapur Owner', '+919822000003', 'DAIRY_OWNER');
    `);

    // Center Assignments
    await client.query(`
      INSERT INTO user_center_assignments (user_id, center_id, is_primary)
      VALUES ('${userOperator1AId}', '${center1AId}', TRUE);
    `);
  });

  it('3. Unique constraints must enforce organization-scoped mobile number uniqueness', async () => {
    // Insert Customer 1 in Org 1
    await client.query(`
      INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status)
      VALUES ('${cust1AId}', '${org1Id}', '${center1AId}', 'F101', 'Baban Patil', '+919900000001', 'ACTIVE');
    `);

    // Attempt duplicate mobile number in SAME organization (Must throw unique violation)
    await assert.rejects(async () => {
      await client.query(`
        INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status)
        VALUES ('${crypto.randomUUID()}', '${org1Id}', '${center1AId}', 'F102', 'Vasant Patil', '+919900000001', 'ACTIVE');
      `);
    }, /uq_customer_mobile_per_org|duplicate key/i);

    // Insert same mobile number in DIFFERENT organization (Must succeed)
    const resOrg2 = await client.query(`
      INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status)
      VALUES ('${cust2AId}', '${org2Id}', '${center2AId}', 'F201', 'Anand Shinde', '+919900000001', 'ACTIVE')
      RETURNING id;
    `);
    assert.equal(resOrg2.rows[0].id, cust2AId);

    // Insert Customer 2 in Org 1
    await client.query(`
      INSERT INTO customers (id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status)
      VALUES ('${cust1BId}', '${org1Id}', '${center1AId}', 'F103', 'Tukaram Shinde', '+919900000002', 'ACTIVE');
    `);
  });

  it('4. Partial unique indexes must strictly enforce single-active RFID card invariants', async () => {
    // Create RFID cards
    await client.query(`
      INSERT INTO rfid_cards (id, organization_id, card_uid, status)
      VALUES 
      ('${rfidCard1Id}', '${org1Id}', 'RFID-TAG-1001', 'ACTIVE'),
      ('${rfidCard2Id}', '${org1Id}', 'RFID-TAG-1002', 'ACTIVE');
    `);

    // Assign card 1 to customer 1A as active -> SUCCEEDS
    await client.query(`
      INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
      VALUES ('${rfidCard1Id}', '${cust1AId}', '${center1AId}', TRUE, '${userAdmin1Id}');
    `);

    // Attempting to assign SAME active card 1 to customer 1B -> MUST FAIL (uq_active_card_assignment)
    await assert.rejects(async () => {
      await client.query(`
        INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
        VALUES ('${rfidCard1Id}', '${cust1BId}', '${center1AId}', TRUE, '${userAdmin1Id}');
      `);
    }, /uq_active_card_assignment|duplicate key/i);

    // Attempting to assign SECOND active card (card 2) to customer 1A -> MUST FAIL (uq_active_customer_card)
    await assert.rejects(async () => {
      await client.query(`
        INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
        VALUES ('${rfidCard2Id}', '${cust1AId}', '${center1AId}', TRUE, '${userAdmin1Id}');
      `);
    }, /uq_active_customer_card|duplicate key/i);

    // Revoking card 1 allows assigning card 2 to customer 1A
    await client.query(`
      UPDATE rfid_card_assignments 
      SET is_active = FALSE, revoked_at = NOW(), revocation_reason = 'DAMAGED_CARD'
      WHERE rfid_card_id = '${rfidCard1Id}';
    `);

    const newAssign = await client.query(`
      INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
      VALUES ('${rfidCard2Id}', '${cust1AId}', '${center1AId}', TRUE, '${userAdmin1Id}')
      RETURNING id;
    `);
    assert.ok(newAssign.rows[0].id);
  });

  it('5. Partial unique indexes must strictly enforce single-active face enrollment template', async () => {
    await client.query(`
      INSERT INTO face_model_versions (id, model_name, model_version, embedding_dimension, recommended_threshold)
      VALUES ('${faceModelV1Id}', 'MobileFaceNet', 'v1.0.0', 128, 0.720);
    `);

    // First active template -> SUCCEEDS
    await client.query(`
      INSERT INTO face_enrollments (
        customer_id, model_version_id, embedding_encrypted, embedding_iv, embedding_auth_tag,
        encryption_key_reference, quality_score, status, enrolled_by, device_id
      ) VALUES (
        '${cust1AId}', '${faceModelV1Id}', '\\x010203', '\\x040506', '\\x070809',
        'vault-key-01', 0.945, 'ACTIVE', '${userAdmin1Id}', 'TAB-TASGAON-01'
      );
    `);

    // Second active template for SAME customer and SAME model version -> MUST FAIL
    await assert.rejects(async () => {
      await client.query(`
        INSERT INTO face_enrollments (
          customer_id, model_version_id, embedding_encrypted, embedding_iv, embedding_auth_tag,
          encryption_key_reference, quality_score, status, enrolled_by, device_id
        ) VALUES (
          '${cust1AId}', '${faceModelV1Id}', '\\x010203', '\\x040506', '\\x070809',
          'vault-key-01', 0.950, 'ACTIVE', '${userAdmin1Id}', 'TAB-TASGAON-01'
        );
      `);
    }, /uq_active_customer_face_template|duplicate key/i);

    // Inserting template with status 'SUPERSEDED' -> SUCCEEDS
    const resSup = await client.query(`
      INSERT INTO face_enrollments (
        customer_id, model_version_id, embedding_encrypted, embedding_iv, embedding_auth_tag,
        encryption_key_reference, quality_score, status, enrolled_by, device_id
      ) VALUES (
        '${cust1AId}', '${faceModelV1Id}', '\\x010203', '\\x040506', '\\x070809',
        'vault-key-01', 0.910, 'SUPERSEDED', '${userAdmin1Id}', 'TAB-TASGAON-01'
      ) RETURNING id;
    `);
    assert.ok(resSup.rows[0].id);
  });

  it('6. Multiple legitimate deliveries per shift must succeed; duplicate idempotency key must be rejected', async () => {
    const shiftRes = await client.query(`
      INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time)
      VALUES ('${center1AId}', 'MORNING', '06:00:00', '09:30:00')
      RETURNING id;
    `);
    const shiftId = shiftRes.rows[0].id;

    const chartRes = await client.query(`
      INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type)
      VALUES ('${org1Id}', '${center1AId}', 'Tasgaon Cow Chart', 'COW', 'GRID')
      RETURNING id;
    `);
    const chartId = chartRes.rows[0].id;

    const verRes = await client.query(`
      INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, is_approved)
      VALUES ('${chartId}', 1, '2026-01-01 00:00:00+00', TRUE)
      RETURNING id;
    `);
    const rateVerId = verRes.rows[0].id;

    // Delivery 1: Can 1 (Morning shift, 15.4 kg)
    const session1Res = await client.query(`
      INSERT INTO collection_sessions (
        center_id, customer_id, business_date, shift_id, shift_type, selected_milk_category,
        identification_method, session_state, intake_sequence_uuid, operator_id, device_id
      ) VALUES (
        '${center1AId}', '${cust1AId}', '2026-11-13', '${shiftId}', 'MORNING', 'COW',
        'RFID', 'COMPLETED', '${crypto.randomUUID()}', '${userOperator1AId}', 'TERM-01'
      ) RETURNING id;
    `);
    const s1Id = session1Res.rows[0].id;

    const col1Res = await client.query(`
      INSERT INTO milk_collections (
        session_id, center_id, customer_id, business_date, shift_type, milk_category,
        net_weight, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit,
        total_amount, transaction_status, client_intake_uuid, idempotency_key
      ) VALUES (
        '${s1Id}', '${center1AId}', '${cust1AId}', '2026-11-13', 'MORNING', 'COW',
        15.40, 4.1, 8.5, '${rateVerId}', 38.00,
        585.20, 'COMPLETED', '${crypto.randomUUID()}', 'IDEMP-20261113-M-CAN1'
      ) RETURNING id, total_amount;
    `);
    assert.equal(col1Res.rows[0].total_amount, '585.20');

    // Delivery 2: Can 2 (SAME morning shift, SAME customer, SAME date, 12.5 kg) -> MUST SUCCEED
    const session2Res = await client.query(`
      INSERT INTO collection_sessions (
        center_id, customer_id, business_date, shift_id, shift_type, selected_milk_category,
        identification_method, session_state, intake_sequence_uuid, operator_id, device_id
      ) VALUES (
        '${center1AId}', '${cust1AId}', '2026-11-13', '${shiftId}', 'MORNING', 'COW',
        'RFID', 'COMPLETED', '${crypto.randomUUID()}', '${userOperator1AId}', 'TERM-01'
      ) RETURNING id;
    `);
    const s2Id = session2Res.rows[0].id;

    const col2Res = await client.query(`
      INSERT INTO milk_collections (
        session_id, center_id, customer_id, business_date, shift_type, milk_category,
        net_weight, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit,
        total_amount, transaction_status, client_intake_uuid, idempotency_key
      ) VALUES (
        '${s2Id}', '${center1AId}', '${cust1AId}', '2026-11-13', 'MORNING', 'COW',
        12.50, 4.0, 8.4, '${rateVerId}', 37.00,
        462.50, 'COMPLETED', '${crypto.randomUUID()}', 'IDEMP-20261113-M-CAN2'
      ) RETURNING id, total_amount;
    `);
    assert.equal(col2Res.rows[0].total_amount, '462.50');

    // Replay of Delivery 1 with duplicate idempotency key -> MUST FAIL
    await assert.rejects(async () => {
      await client.query(`
        INSERT INTO milk_collections (
          session_id, center_id, customer_id, business_date, shift_type, milk_category,
          net_weight, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit,
          total_amount, transaction_status, client_intake_uuid, idempotency_key
        ) VALUES (
          '${crypto.randomUUID()}', '${center1AId}', '${cust1AId}', '2026-11-13', 'MORNING', 'COW',
          15.40, 4.1, 8.5, '${rateVerId}', 38.00,
          585.20, 'COMPLETED', '${crypto.randomUUID()}', 'IDEMP-20261113-M-CAN1'
        );
      `);
    }, /idempotency_key|duplicate key/i);
  });

  it('7. Exact NUMERIC arithmetic and double-entry balanced subledger entries must be preserved', async () => {
    // Initialize customer ledger account
    const acctRes = await client.query(`
      INSERT INTO customer_ledger_accounts (customer_id, organization_id, current_balance)
      VALUES ('${cust1AId}', '${org1Id}', 0.00)
      RETURNING id, current_balance;
    `);
    const acctId = acctRes.rows[0].id;
    assert.equal(acctRes.rows[0].current_balance, '0.00');

    // Post Milk Collection Credit: ₹1,047.70 (585.20 + 462.50)
    const txn1Res = await client.query(`
      INSERT INTO ledger_transactions (
        organization_id, center_id, customer_id, transaction_type, direction,
        amount, balance_after, reference_entity, reference_id, idempotency_key, created_by
      ) VALUES (
        '${org1Id}', '${center1AId}', '${cust1AId}', 'MILK_COLLECTION_CREDIT', 'CREDIT',
        1047.70, 1047.70, 'MILK_COLLECTION', '${crypto.randomUUID()}', 'TXN-001', '${userOperator1AId}'
      ) RETURNING id, balance_after;
    `);
    const txn1Id = txn1Res.rows[0].id;
    assert.equal(txn1Res.rows[0].balance_after, '1047.70');

    // Insert dual-entry balanced lines
    await client.query(`
      INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
      VALUES 
      ('${txn1Id}', '${acctId}', 'CUSTOMER_PAYABLE', 'CREDIT', 1047.70),
      ('${txn1Id}', '${org1Id}', 'MILK_PURCHASE_EXPENSE', 'DEBIT', 1047.70);
    `);

    // Verify Sum of Debits == Sum of Credits
    const sumRes = await client.query(`
      SELECT 
        SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) as debit_sum,
        SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) as credit_sum
      FROM ledger_entries 
      WHERE transaction_id = '${txn1Id}';
    `);
    assert.equal(sumRes.rows[0].debit_sum, '1047.70');
    assert.equal(sumRes.rows[0].credit_sum, '1047.70');

    // Post Advance Debit of ₹300.00
    const txn2Res = await client.query(`
      INSERT INTO ledger_transactions (
        organization_id, center_id, customer_id, transaction_type, direction,
        amount, balance_after, reference_entity, reference_id, idempotency_key, created_by
      ) VALUES (
        '${org1Id}', '${center1AId}', '${cust1AId}', 'ADVANCE_DEBIT', 'DEBIT',
        300.00, 747.70, 'CUSTOMER_ADVANCE', '${crypto.randomUUID()}', 'TXN-002', '${userAdmin1Id}'
      ) RETURNING id, balance_after;
    `);
    assert.equal(txn2Res.rows[0].balance_after, '747.70');
  });

  it('8. Soft deletion must preserve historical financial and collection records; restore rules work', async () => {
    // Soft delete Customer 1A
    await client.query(`
      UPDATE customers 
      SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = '${userAdmin1Id}', deletion_reason = 'Seasonal break', status = 'SOFT_DELETED'
      WHERE id = '${cust1AId}';
    `);

    // Collections must still exist and be completely queryable
    const colCount = await client.query(`SELECT COUNT(*)::int as c FROM milk_collections WHERE customer_id = '${cust1AId}';`);
    assert.equal(colCount.rows[0].c, 2);

    // Ledger transactions must still exist
    const txnCount = await client.query(`SELECT COUNT(*)::int as c FROM ledger_transactions WHERE customer_id = '${cust1AId}';`);
    assert.equal(txnCount.rows[0].c, 2);

    // Restore customer
    await client.query(`
      UPDATE customers
      SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL, status = 'ACTIVE'
      WHERE id = '${cust1AId}';
    `);
    const restored = await client.query(`SELECT is_deleted, status FROM customers WHERE id = '${cust1AId}';`);
    assert.equal(restored.rows[0].is_deleted, false);
    assert.equal(restored.rows[0].status, 'ACTIVE');
  });

  it('9. RLS must isolate organizations (Cross-Organization queries return 0 rows)', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      await testClient.query('BEGIN;');
      // Act as Owner of Org 1
      await testClient.query('SET LOCAL ROLE authenticated;');
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: userAdmin1Id,
          app_metadata: {
            organization_id: org1Id,
            user_role: 'DAIRY_OWNER',
          },
        })}';
      `);

      // Query customers: Must see Org 1 customers, ZERO from Org 2
      const custs = await testClient.query('SELECT id, organization_id FROM customers;');
      assert.ok(custs.rows.length >= 2, 'Must see Org 1 customers');
      custs.rows.forEach(c => {
        assert.equal(c.organization_id, org1Id, 'Must NOT see any customers from Org 2');
      });

      // Query organizations: Must ONLY see Org 1
      const orgs = await testClient.query('SELECT id FROM organizations;');
      assert.equal(orgs.rows.length, 1);
      assert.equal(orgs.rows[0].id, org1Id);

      await testClient.query('COMMIT;');
    } finally {
      await testClient.end();
    }
  });

  it('10. RLS must enforce farmer customer self-service isolation (Cross-Customer queries return 0 rows)', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      await testClient.query('BEGIN;');
      // Act as Farmer Customer 1A
      await testClient.query('SET LOCAL ROLE authenticated;');
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: crypto.randomUUID(),
          app_metadata: {
            organization_id: org1Id,
            customer_id: cust1AId,
            user_role: 'FARMER_CUSTOMER',
          },
        })}';
      `);

      // Profile query: Must ONLY see self
      const myProfile = await testClient.query('SELECT id, full_name FROM customers;');
      assert.equal(myProfile.rows.length, 1);
      assert.equal(myProfile.rows[0].id, cust1AId);

      // Collections query: Must ONLY see self
      const myCollections = await testClient.query('SELECT id, customer_id FROM milk_collections;');
      assert.equal(myCollections.rows.length, 2);
      myCollections.rows.forEach(c => {
        assert.equal(c.customer_id, cust1AId);
      });

      // Ledger query: Must ONLY see self
      const myLedger = await testClient.query('SELECT id, customer_id FROM ledger_transactions;');
      assert.equal(myLedger.rows.length, 2);
      myLedger.rows.forEach(l => {
        assert.equal(l.customer_id, cust1AId);
      });

      await testClient.query('COMMIT;');
    } finally {
      await testClient.end();
    }
  });

  it('11. RLS must reject unauthorized biometric face template queries for non-admins', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      await testClient.query('BEGIN;');
      // Act as regular operator
      await testClient.query('SET LOCAL ROLE authenticated;');
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: userOperator1AId,
          app_metadata: {
            organization_id: org1Id,
            center_id: center1AId,
            user_role: 'COLLECTION_OPERATOR',
          },
        })}';
      `);

      // Query face_enrollments -> MUST RETURN 0 ROWS
      const bioRes = await testClient.query('SELECT id, quality_score FROM face_enrollments;');
      assert.equal(bioRes.rows.length, 0, 'Operators must NOT have access to raw biometric templates');

      await testClient.query('COMMIT;');
    } finally {
      await testClient.end();
    }
  });

  it('12. RLS must block unauthorized ledger transactions modification (Append-Only immutability)', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      await testClient.query('BEGIN;');
      // Act as operator attempting to alter finalized financial records
      await testClient.query('SET LOCAL ROLE authenticated;');
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: userOperator1AId,
          app_metadata: {
            organization_id: org1Id,
            center_id: center1AId,
            user_role: 'COLLECTION_OPERATOR',
          },
        })}';
      `);

      // Attempting to UPDATE or DELETE ledger transactions -> MUST AFFECT 0 ROWS (Blocked by RLS)
      const updateRes = await testClient.query(`
        UPDATE ledger_transactions 
        SET amount = 99999.00 
        WHERE customer_id = '${cust1AId}';
      `);
      assert.equal(updateRes.rowCount, 0, 'RLS must bar any UPDATE on immutable ledger transactions');

      const deleteRes = await testClient.query(`
        DELETE FROM ledger_transactions 
        WHERE customer_id = '${cust1AId}';
      `);
      assert.equal(deleteRes.rowCount, 0, 'RLS must bar any DELETE on immutable ledger transactions');

      await testClient.query('COMMIT;');
    } finally {
      await testClient.end();
    }
  });

  it('13. RLS must prevent cross-center collection injection (Center operator isolation)', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      await testClient.query('BEGIN;');
      // Act as Operator of Center 1A (Tasgaon)
      await testClient.query('SET LOCAL ROLE authenticated;');
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: userOperator1AId,
          app_metadata: {
            organization_id: org1Id,
            center_id: center1AId,
            user_role: 'COLLECTION_OPERATOR',
          },
        })}';
      `);

      // Operator of Center 1A attempts to insert collection for Center 1B (Miraj) -> MUST FAIL WITH CHECK
      await assert.rejects(async () => {
        await testClient.query(`
          INSERT INTO milk_collections (
            session_id, center_id, customer_id, business_date, shift_type, milk_category,
            net_weight, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit,
            total_amount, transaction_status, client_intake_uuid, idempotency_key
          ) VALUES (
            '${crypto.randomUUID()}', '${center1BId}', '${cust1AId}', '2026-11-13', 'MORNING', 'COW',
            10.00, 4.0, 8.5, '${crypto.randomUUID()}', 35.00,
            350.00, 'COMPLETED', '${crypto.randomUUID()}', 'ILLEGAL-CROSS-CENTER-INTAKE'
          );
        `);
      }, /new row violates row-level security policy/i);

      await testClient.query('ROLLBACK;');
    } finally {
      await testClient.end();
    }
  });

  it('14. RLS must reject unauthorized role escalation attempts', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      await testClient.query('BEGIN;');
      // Act as Operator attempting to escalate own role to SUPER_ADMIN
      await testClient.query('SET LOCAL ROLE authenticated;');
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: userOperator1AId,
          app_metadata: {
            organization_id: org1Id,
            center_id: center1AId,
            user_role: 'COLLECTION_OPERATOR',
          },
        })}';
      `);

      const updateRes = await testClient.query(`
        UPDATE users 
        SET role = 'SUPER_ADMIN' 
        WHERE id = '${userOperator1AId}';
      `);
      assert.equal(updateRes.rowCount, 0, 'Operators must not be able to escalate their own role');

      await testClient.query('COMMIT;');
    } finally {
      await testClient.end();
    }
  });

  it('15. RLS and permission model must block unauthenticated (anon) requests from accessing protected business records', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      // Unauthenticated access must be strictly rejected by permissions or return 0 rows
      await testClient.query('BEGIN;');
      await testClient.query('SET LOCAL ROLE anon;');
      await assert.rejects(
        async () => testClient.query('SELECT * FROM customers;'),
        /permission denied/i,
        'Unauthenticated users must not have access to customer records'
      );
      await testClient.query('ROLLBACK;');

      await testClient.query('BEGIN;');
      await testClient.query('SET LOCAL ROLE anon;');
      await assert.rejects(
        async () => testClient.query('SELECT * FROM milk_collections;'),
        /permission denied/i,
        'Unauthenticated users must not have access to milk collections'
      );
      await testClient.query('ROLLBACK;');

      await testClient.query('BEGIN;');
      await testClient.query('SET LOCAL ROLE anon;');
      await assert.rejects(
        async () => testClient.query('SELECT * FROM ledger_transactions;'),
        /permission denied/i,
        'Unauthenticated users must not have access to ledger records'
      );
      await testClient.query('ROLLBACK;');
    } finally {
      await testClient.end();
    }
  });

  it('16. RLS must isolate customer records, collections, and ledger between Customer A and Customer B', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      await testClient.query('BEGIN;');
      // Act as Customer 1A
      await testClient.query('SET LOCAL ROLE authenticated;');
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: crypto.randomUUID(),
          app_metadata: {
            organization_id: org1Id,
            customer_id: cust1AId,
            user_role: 'FARMER_CUSTOMER',
          },
        })}';
      `);

      // Attempt to read Customer 1B's profile by exact ID
      const bProfile = await testClient.query(`SELECT id, full_name FROM customers WHERE id = '${cust1BId}';`);
      assert.equal(bProfile.rows.length, 0, 'Customer A must NOT read Customer B profile');

      // Attempt to read Customer 1B's collections by exact ID
      const bCollections = await testClient.query(`SELECT id FROM milk_collections WHERE customer_id = '${cust1BId}';`);
      assert.equal(bCollections.rows.length, 0, 'Customer A must NOT read Customer B collections');

      // Attempt to read Customer 1B's ledger transactions by exact ID
      const bLedger = await testClient.query(`SELECT id FROM ledger_transactions WHERE customer_id = '${cust1BId}';`);
      assert.equal(bLedger.rows.length, 0, 'Customer A must NOT read Customer B ledger transactions');

      await testClient.query('COMMIT;');
    } finally {
      await testClient.end();
    }
  });

  it('17. RLS must reject customer attempts to create or modify financial and collection records', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      // 1. Attempting to INSERT into ledger_transactions -> MUST FAIL
      await testClient.query('BEGIN;');
      await testClient.query('SET LOCAL ROLE authenticated;');
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: crypto.randomUUID(),
          app_metadata: {
            organization_id: org1Id,
            customer_id: cust1AId,
            user_role: 'FARMER_CUSTOMER',
          },
        })}';
      `);

      await assert.rejects(async () => {
        await testClient.query(`
          INSERT INTO ledger_transactions (
            organization_id, center_id, customer_id, transaction_type, direction,
            amount, balance_after, reference_entity, reference_id, idempotency_key, created_by
          ) VALUES (
            '${org1Id}', '${center1AId}', '${cust1AId}', 'MILK_COLLECTION_CREDIT', 'CREDIT',
            1000.00, 1000.00, 'MILK_COLLECTION', '${crypto.randomUUID()}', 'FORGED-TXN', '${cust1AId}'
          );
        `);
      }, /new row violates row-level security policy/i);
      await testClient.query('ROLLBACK;');

      // 2. Attempting to INSERT into milk_collections -> MUST FAIL
      await testClient.query('BEGIN;');
      await testClient.query('SET LOCAL ROLE authenticated;');
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: crypto.randomUUID(),
          app_metadata: {
            organization_id: org1Id,
            customer_id: cust1AId,
            user_role: 'FARMER_CUSTOMER',
          },
        })}';
      `);

      await assert.rejects(async () => {
        await testClient.query(`
          INSERT INTO milk_collections (
            session_id, center_id, customer_id, business_date, shift_type, milk_category,
            net_weight, fat_percentage, snf_percentage, applied_rate_per_unit, total_amount,
            transaction_status, client_intake_uuid, idempotency_key
          ) VALUES (
            '${crypto.randomUUID()}', '${center1AId}', '${cust1AId}', '2026-11-13', 'MORNING', 'COW',
            10.00, 4.0, 8.5, 35.00, 350.00, 'COMPLETED', '${crypto.randomUUID()}', 'FORGED-COLLECTION'
          );
        `);
      }, /new row violates row-level security policy/i);
      await testClient.query('ROLLBACK;');
    } finally {
      await testClient.end();
    }
  });

  it('18. RLS must reject customer attempts to query biometric face templates', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      await testClient.query('BEGIN;');
      // Act as Customer 1A
      await testClient.query('SET LOCAL ROLE authenticated;');
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: crypto.randomUUID(),
          app_metadata: {
            organization_id: org1Id,
            customer_id: cust1AId,
            user_role: 'FARMER_CUSTOMER',
          },
        })}';
      `);

      // Attempting to SELECT face_enrollments -> MUST RETURN 0 ROWS
      const bioRes = await testClient.query('SELECT id, customer_id, quality_score FROM face_enrollments;');
      assert.equal(bioRes.rows.length, 0, 'Customers must never be able to retrieve face templates');

      await testClient.query('COMMIT;');
    } finally {
      await testClient.end();
    }
  });

  it('19. Unauthorized users cannot restore soft-deleted customers', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      // First, soft-delete Customer 1B using admin client
      await client.query(`
        UPDATE customers 
        SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = '${userAdmin1Id}', deletion_reason = 'Pending verification', status = 'SOFT_DELETED'
        WHERE id = '${cust1BId}';
      `);

      await testClient.query('BEGIN;');
      // Act as Operator (unauthorized to modify customer status/restore)
      await testClient.query('SET LOCAL ROLE authenticated;');
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: userOperator1AId,
          app_metadata: {
            organization_id: org1Id,
            center_id: center1AId,
            user_role: 'COLLECTION_OPERATOR',
          },
        })}';
      `);

      // Operator attempts to un-delete customer -> MUST AFFECT 0 ROWS (Blocked by RLS UPDATE policy)
      const restoreAttempt = await testClient.query(`
        UPDATE customers
        SET is_deleted = FALSE, status = 'ACTIVE'
        WHERE id = '${cust1BId}';
      `);
      assert.equal(restoreAttempt.rowCount, 0, 'Operators must NOT be able to restore soft-deleted customers');

      await testClient.query('COMMIT;');

      // Restore customer using admin client
      await client.query(`
        UPDATE customers
        SET is_deleted = FALSE, deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL, status = 'ACTIVE'
        WHERE id = '${cust1BId}';
      `);
    } finally {
      await testClient.end();
    }
  });

  it('20. Security Definer functions must not trust client-supplied user_metadata claims', async () => {
    const testClient = new Client({ connectionString: DB_URL });
    await testClient.connect();

    try {
      await testClient.query('BEGIN;');
      await testClient.query('SET LOCAL ROLE authenticated;');
      // Malicious user attempts to inject organization_id and SUPER_ADMIN role into user_metadata (client editable)
      await testClient.query(`
        SET LOCAL "request.jwt.claims" = '${JSON.stringify({
          sub: crypto.randomUUID(),
          user_metadata: {
            organization_id: org1Id,
            user_role: 'SUPER_ADMIN',
          },
          app_metadata: {},
        })}';
      `);

      // current_org_id and current_user_role must return NULL because claims are in user_metadata
      const orgCheck = await testClient.query('SELECT public.current_org_id() as org, public.current_user_role() as role;');
      assert.equal(orgCheck.rows[0].org, null);
      assert.equal(orgCheck.rows[0].role, null);

      // Querying customers with forged claims must return 0 rows
      const custs = await testClient.query('SELECT count(*)::int as c FROM customers;');
      assert.equal(custs.rows[0].c, 0, 'Forged user_metadata claims must yield 0 accessible rows');

      await testClient.query('COMMIT;');
    } finally {
      await testClient.end();
    }
  });
});
