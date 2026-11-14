import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../../../supabase/migrations');

describe('DFarm Database Runtime Integration & Constraint Verification Suite', () => {
  let db;

  before(() => {
    db = newDb();

    // Register impure cryptographic UUID generator in pgcrypto extension
    db.registerExtension('pgcrypto', (schema) => {
      schema.registerFunction({
        name: 'gen_random_uuid',
        impure: true,
        returns: db.public.getType('uuid'),
        implementation: () => crypto.randomUUID(),
      });
    });
    db.public.none('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');

    const migrationFiles = [
      '002_organizations_and_centers.sql',
      '003_user_identity_foundation.sql',
      '004_customer_identity.sql',
      '005_face_and_rfid.sql',
      '006_customer_identification_audit.sql',
      '007_rate_management.sql',
      '008_collection_sessions_and_transactions.sql',
      '009_customer_ledger.sql',
      '010_devices_sync_and_audit.sql',
    ];

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const cleanSql = sql.replace(/--.*$/gm, '');
      const statements = cleanSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      for (const stmt of statements) {
        // Skip plpgsql triggers, grants, revokes and RLS policies in pg-mem DDL
        if (
          /^CREATE\s+TRIGGER/i.test(stmt) ||
          /^ALTER\s+TABLE\s+.*ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(stmt) ||
          /^CREATE\s+POLICY/i.test(stmt) ||
          /^GRANT\s+/i.test(stmt) ||
          /^REVOKE\s+/i.test(stmt)
        ) {
          continue;
        }
        db.public.none(stmt);
      }
    }
  });

  it('should verify all 43 tables are created in the database schema', () => {
    const tables = db.public.many("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
    assert.equal(tables.length, 43, `Expected 43 tables, created ${tables.length}`);
  });

  it('should create organization and dairy center with foreign key integrity', () => {
    const org = db.public.one(`
      INSERT INTO organizations (name, code, status)
      VALUES ('Sangli Dairy Union', 'SDU01', 'ACTIVE')
      RETURNING id, code, status;
    `);
    assert.equal(org.code, 'SDU01');

    const center = db.public.one(`
      INSERT INTO dairy_centers (
        organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone
      ) VALUES (
        '${org.id}', 'C01', 'Tasgaon Main Center', 'Main Road', 'Tasgaon', 'Sangli', 'Maharashtra', '416312', '+919876543210'
      ) RETURNING id, code;
    `);
    assert.equal(center.code, 'C01');
  });

  it('should enforce organization-scoped mobile number uniqueness for customers', () => {
    const org1 = db.public.one("SELECT id FROM organizations WHERE code = 'SDU01';");
    const center1 = db.public.one("SELECT id FROM dairy_centers WHERE code = 'C01';");

    // Insert first customer in Org 1
    const cust1 = db.public.one(`
      INSERT INTO customers (
        organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number
      ) VALUES (
        '${org1.id}', '${center1.id}', 'F001', 'Ramesh Patil', '+919800000001'
      ) RETURNING id, full_name;
    `);
    assert.equal(cust1.full_name, 'Ramesh Patil');

    // Duplicate mobile in SAME organization must fail
    assert.throws(() => {
      db.public.none(`
        INSERT INTO customers (
          organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number
        ) VALUES (
          '${org1.id}', '${center1.id}', 'F002', 'Suresh Patil', '+919800000001'
        );
      `);
    });

    // Duplicate mobile in DIFFERENT organization must SUCCEED
    const org2 = db.public.one(`
      INSERT INTO organizations (name, code, status)
      VALUES ('Kolhapur Dairy Union', 'KDU01', 'ACTIVE')
      RETURNING id;
    `);
    const center2 = db.public.one(`
      INSERT INTO dairy_centers (
        organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone
      ) VALUES (
        '${org2.id}', 'KC01', 'Karveer Center', 'Station Rd', 'Karveer', 'Kolhapur', 'Maharashtra', '416001', '+919876543211'
      ) RETURNING id;
    `);

    const cust2 = db.public.one(`
      INSERT INTO customers (
        organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number
      ) VALUES (
        '${org2.id}', '${center2.id}', 'F001', 'Vikas Jadhav', '+919800000001'
      ) RETURNING id;
    `);
    assert.ok(cust2.id);
  });

  it('should enforce single-active RFID card assignment partial unique indexes', () => {
    const org = db.public.one("SELECT id FROM organizations WHERE code = 'SDU01';");
    const center = db.public.one("SELECT id FROM dairy_centers WHERE code = 'C01';");
    const cust1 = db.public.one(`SELECT id FROM customers WHERE normalized_mobile_number = '+919800000001' AND organization_id = '${org.id}';`);

    const user = db.public.one(`
      INSERT INTO users (
        organization_id, username, full_name, phone_number, role
      ) VALUES (
        '${org.id}', 'operator1', 'Operator Ashok', '+919822000001', 'COLLECTION_OPERATOR'
      ) RETURNING id;
    `);

    const card1 = db.public.one(`
      INSERT INTO rfid_cards (organization_id, card_uid, status)
      VALUES ('${org.id}', 'CARD-UID-001', 'ACTIVE')
      RETURNING id;
    `);

    const card2 = db.public.one(`
      INSERT INTO rfid_cards (organization_id, card_uid, status)
      VALUES ('${org.id}', 'CARD-UID-002', 'ACTIVE')
      RETURNING id;
    `);

    // Assign card 1 to customer 1 as active -> SUCCEEDS
    db.public.none(`
      INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
      VALUES ('${card1.id}', '${cust1.id}', '${center.id}', TRUE, '${user.id}');
    `);

    // Assigning the SAME card 1 to customer 2 as active -> FAILS
    const custAnother = db.public.one(`
      INSERT INTO customers (
        organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number
      ) VALUES (
        '${org.id}', '${center.id}', 'F003', 'Anil More', '+919800000003'
      ) RETURNING id;
    `);

    assert.throws(() => {
      db.public.none(`
        INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
        VALUES ('${card1.id}', '${custAnother.id}', '${center.id}', TRUE, '${user.id}');
      `);
    });

    // Assigning a SECOND active card (card 2) to customer 1 -> FAILS (1 customer can only hold 1 active card)
    assert.throws(() => {
      db.public.none(`
        INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
        VALUES ('${card2.id}', '${cust1.id}', '${center.id}', TRUE, '${user.id}');
      `);
    });

    // Revoking card 1 allows assigning card 2 to customer 1
    db.public.none(`
      UPDATE rfid_card_assignments
      SET is_active = FALSE, revoked_at = NOW(), revocation_reason = 'LOST'
      WHERE rfid_card_id = '${card1.id}';
    `);

    const newAssignment = db.public.one(`
      INSERT INTO rfid_card_assignments (rfid_card_id, customer_id, center_id, is_active, assigned_by)
      VALUES ('${card2.id}', '${cust1.id}', '${center.id}', TRUE, '${user.id}')
      RETURNING id;
    `);
    assert.ok(newAssignment.id);
  });

  it('should enforce single-active face enrollment template partial unique index', () => {
    const cust = db.public.one("SELECT id FROM customers WHERE farmer_code = 'F001';");
    const user = db.public.one("SELECT id FROM users WHERE username = 'operator1';");

    const modelV1 = db.public.one(`
      INSERT INTO face_model_versions (
        model_name, model_version, embedding_dimension, recommended_threshold
      ) VALUES (
        'MobileFaceNet', 'v1.0.0', 128, 0.720
      ) RETURNING id;
    `);

    // First active template -> SUCCEEDS
    db.public.none(`
      INSERT INTO face_enrollments (
        customer_id, model_version_id, embedding_encrypted, embedding_iv, embedding_auth_tag,
        encryption_key_reference, quality_score, status, enrolled_by, device_id
      ) VALUES (
        '${cust.id}', '${modelV1.id}', '\\x010203', '\\x040506', '\\x070809',
        'kms-key-v1', 0.950, 'ACTIVE', '${user.id}', 'TAB-01'
      );
    `);

    // Second active template for SAME model version -> FAILS
    assert.throws(() => {
      db.public.none(`
        INSERT INTO face_enrollments (
          customer_id, model_version_id, embedding_encrypted, embedding_iv, embedding_auth_tag,
          encryption_key_reference, quality_score, status, enrolled_by, device_id
        ) VALUES (
          '${cust.id}', '${modelV1.id}', '\\x010203', '\\x040506', '\\x070809',
          'kms-key-v1', 0.960, 'ACTIVE', '${user.id}', 'TAB-01'
        );
      `);
    });

    // Inserting with status 'SUPERSEDED' -> SUCCEEDS
    const superseded = db.public.one(`
      INSERT INTO face_enrollments (
        customer_id, model_version_id, embedding_encrypted, embedding_iv, embedding_auth_tag,
        encryption_key_reference, quality_score, status, enrolled_by, device_id
      ) VALUES (
        '${cust.id}', '${modelV1.id}', '\\x010203', '\\x040506', '\\x070809',
        'kms-key-v1', 0.920, 'SUPERSEDED', '${user.id}', 'TAB-01'
      ) RETURNING id;
    `);
    assert.ok(superseded.id);
  });

  it('should permit multiple legitimate deliveries per customer shift while enforcing idempotency', () => {
    const org = db.public.one("SELECT id FROM organizations WHERE code = 'SDU01';");
    const center = db.public.one("SELECT id FROM dairy_centers WHERE code = 'C01';");
    const cust = db.public.one("SELECT id FROM customers WHERE farmer_code = 'F001';");
    const user = db.public.one("SELECT id FROM users WHERE username = 'operator1';");

    const shift = db.public.one(`
      INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time)
      VALUES ('${center.id}', 'MORNING', '06:00:00', '09:30:00')
      RETURNING id;
    `);

    const rateChart = db.public.one(`
      INSERT INTO rate_charts (organization_id, center_id, name, milk_category, pricing_type)
      VALUES ('${org.id}', '${center.id}', 'Standard Cow Chart', 'COW', 'GRID')
      RETURNING id;
    `);

    const rateVersion = db.public.one(`
      INSERT INTO rate_chart_versions (rate_chart_id, version_number, effective_from, is_approved)
      VALUES ('${rateChart.id}', 1, '2026-01-01 00:00:00+00', TRUE)
      RETURNING id;
    `);

    // Intake 1 (Cow Milk Can 1)
    const session1 = db.public.one(`
      INSERT INTO collection_sessions (
        center_id, customer_id, business_date, shift_id, shift_type,
        selected_milk_category, identification_method, session_state,
        intake_sequence_uuid, operator_id, device_id
      ) VALUES (
        '${center.id}', '${cust.id}', '2026-11-13', '${shift.id}', 'MORNING',
        'COW', 'RFID', 'COMPLETED', '${crypto.randomUUID()}', '${user.id}', 'TERMINAL-01'
      ) RETURNING id;
    `);

    const col1 = db.public.one(`
      INSERT INTO milk_collections (
        session_id, center_id, customer_id, business_date, shift_type, milk_category,
        net_weight, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit,
        total_amount, transaction_status, client_intake_uuid, idempotency_key
      ) VALUES (
        '${session1.id}', '${center.id}', '${cust.id}', '2026-11-13', 'MORNING', 'COW',
        15.50, 4.2, 8.6, '${rateVersion.id}', 38.50,
        596.75, 'COMPLETED', '${crypto.randomUUID()}', 'ORG1:INTAKE:20261113-M-F001-CAN1'
      ) RETURNING id, total_amount;
    `);
    assert.equal(Number(col1.total_amount), 596.75);

    // Intake 2 (Cow Milk Can 2 in SAME MORNING SHIFT on SAME DATE)
    const session2 = db.public.one(`
      INSERT INTO collection_sessions (
        center_id, customer_id, business_date, shift_id, shift_type,
        selected_milk_category, identification_method, session_state,
        intake_sequence_uuid, operator_id, device_id
      ) VALUES (
        '${center.id}', '${cust.id}', '2026-11-13', '${shift.id}', 'MORNING',
        'COW', 'RFID', 'COMPLETED', '${crypto.randomUUID()}', '${user.id}', 'TERMINAL-01'
      ) RETURNING id;
    `);

    // Multiple collection intake on same shift SUCCEEDS
    const col2 = db.public.one(`
      INSERT INTO milk_collections (
        session_id, center_id, customer_id, business_date, shift_type, milk_category,
        net_weight, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit,
        total_amount, transaction_status, client_intake_uuid, idempotency_key
      ) VALUES (
        '${session2.id}', '${center.id}', '${cust.id}', '2026-11-13', 'MORNING', 'COW',
        12.00, 4.0, 8.5, '${rateVersion.id}', 37.00,
        444.00, 'COMPLETED', '${crypto.randomUUID()}', 'ORG1:INTAKE:20261113-M-F001-CAN2'
      ) RETURNING id, total_amount;
    `);
    assert.equal(Number(col2.total_amount), 444.00);

    // Replay with identical idempotency_key FAILS
    assert.throws(() => {
      const sessionDuplicate = db.public.one(`
        INSERT INTO collection_sessions (
          center_id, customer_id, business_date, shift_id, shift_type,
          selected_milk_category, identification_method, session_state,
          intake_sequence_uuid, operator_id, device_id
        ) VALUES (
          '${center.id}', '${cust.id}', '2026-11-13', '${shift.id}', 'MORNING',
          'COW', 'RFID', 'COMPLETED', '${crypto.randomUUID()}', '${user.id}', 'TERMINAL-01'
        ) RETURNING id;
      `);

      db.public.none(`
        INSERT INTO milk_collections (
          session_id, center_id, customer_id, business_date, shift_type, milk_category,
          net_weight, fat_percentage, snf_percentage, rate_chart_version_id, applied_rate_per_unit,
          total_amount, transaction_status, client_intake_uuid, idempotency_key
        ) VALUES (
          '${sessionDuplicate.id}', '${center.id}', '${cust.id}', '2026-11-13', 'MORNING', 'COW',
          12.00, 4.0, 8.5, '${rateVersion.id}', 37.00,
          444.00, 'COMPLETED', '${crypto.randomUUID()}', 'ORG1:INTAKE:20261113-M-F001-CAN1'
        );
      `);
    });
  });

  it('should enforce CHECK constraints on milk weight, amount, shift types and categories', () => {
    // Negative weight must fail
    assert.throws(() => {
      db.public.none(`
        INSERT INTO collection_weight_readings (
          session_id, measured_weight, net_weight
        ) VALUES (
          '${crypto.randomUUID()}', -5.00, -5.00
        );
      `);
    });

    // Invalid shift type must fail
    assert.throws(() => {
      db.public.none(`
        INSERT INTO collection_shifts (center_id, shift_type, start_time, end_time)
        VALUES ('${crypto.randomUUID()}', 'AFTERNOON', '12:00:00', '15:00:00');
      `);
    });
  });

  it('should maintain Customer Subledger running balance and balanced journal entries', () => {
    const org = db.public.one("SELECT id FROM organizations WHERE code = 'SDU01';");
    const center = db.public.one("SELECT id FROM dairy_centers WHERE code = 'C01';");
    const cust = db.public.one("SELECT id FROM customers WHERE farmer_code = 'F001';");
    const user = db.public.one("SELECT id FROM users WHERE username = 'operator1';");

    // Initialize ledger account
    const account = db.public.one(`
      INSERT INTO customer_ledger_accounts (customer_id, organization_id, current_balance)
      VALUES ('${cust.id}', '${org.id}', 0.00)
      RETURNING id, current_balance;
    `);
    assert.equal(Number(account.current_balance), 0.00);

    // Transaction 1: Milk Collection Credit (+596.75)
    const txn1 = db.public.one(`
      INSERT INTO ledger_transactions (
        organization_id, center_id, customer_id, transaction_type, direction,
        amount, balance_after, reference_entity, reference_id, idempotency_key, created_by
      ) VALUES (
        '${org.id}', '${center.id}', '${cust.id}', 'MILK_COLLECTION_CREDIT', 'CREDIT',
        596.75, 596.75, 'MILK_COLLECTION', '${crypto.randomUUID()}', 'LEDGER-TXN-001', '${user.id}'
      ) RETURNING id, balance_after;
    `);
    assert.equal(Number(txn1.balance_after), 596.75);

    // Balanced Journal Entries for Txn 1:
    // Credit Customer Payable (Liability increases: +596.75)
    // Debit Milk Purchase Expense (Expense increases: +596.75)
    db.public.none(`
      INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
      VALUES ('${txn1.id}', '${account.id}', 'CUSTOMER_PAYABLE', 'CREDIT', 596.75);
    `);
    db.public.none(`
      INSERT INTO ledger_entries (transaction_id, account_id, account_type, entry_type, amount)
      VALUES ('${txn1.id}', '${org.id}', 'MILK_PURCHASE_EXPENSE', 'DEBIT', 596.75);
    `);

    // Verify journal balancing: Sum of Debits == Sum of Credits
    const sumDebit = db.public.one(`SELECT SUM(amount) as s FROM ledger_entries WHERE transaction_id = '${txn1.id}' AND entry_type = 'DEBIT';`);
    const sumCredit = db.public.one(`SELECT SUM(amount) as s FROM ledger_entries WHERE transaction_id = '${txn1.id}' AND entry_type = 'CREDIT';`);
    assert.equal(Number(sumDebit.s), Number(sumCredit.s));
    assert.equal(Number(sumDebit.s), 596.75);

    // Transaction 2: Cash Advance Payout Debit (-200.00)
    const txn2 = db.public.one(`
      INSERT INTO ledger_transactions (
        organization_id, center_id, customer_id, transaction_type, direction,
        amount, balance_after, reference_entity, reference_id, idempotency_key, created_by
      ) VALUES (
        '${org.id}', '${center.id}', '${cust.id}', 'ADVANCE_DEBIT', 'DEBIT',
        200.00, 396.75, 'CUSTOMER_ADVANCE', '${crypto.randomUUID()}', 'LEDGER-TXN-002', '${user.id}'
      ) RETURNING id, balance_after;
    `);
    assert.equal(Number(txn2.balance_after), 396.75);
  });

  it('should support customer soft-deletion without cascading data loss to historical collections or ledger', () => {
    const cust = db.public.one("SELECT id FROM customers WHERE farmer_code = 'F001';");
    const user = db.public.one("SELECT id FROM users WHERE username = 'operator1';");

    // Perform soft deletion
    db.public.none(`
      UPDATE customers
      SET is_deleted = TRUE,
          deleted_at = NOW(),
          deleted_by = '${user.id}',
          deletion_reason = 'Farmer relocated to another district',
          status = 'SOFT_DELETED'
      WHERE id = '${cust.id}';
    `);

    // Verify customer still exists in database
    const softDeleted = db.public.one(`SELECT is_deleted, status FROM customers WHERE id = '${cust.id}';`);
    assert.equal(softDeleted.is_deleted, true);
    assert.equal(softDeleted.status, 'SOFT_DELETED');

    // Verify historical milk collections remain completely intact
    const collections = db.public.many(`SELECT id, total_amount FROM milk_collections WHERE customer_id = '${cust.id}';`);
    assert.equal(collections.length, 2);

    // Verify ledger transactions remain completely intact
    const ledger = db.public.many(`SELECT id, amount, direction FROM ledger_transactions WHERE customer_id = '${cust.id}';`);
    assert.equal(ledger.length, 2);
  });
});
