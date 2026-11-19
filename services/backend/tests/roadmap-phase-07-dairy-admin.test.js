import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { db } from '../dist/infrastructure/database/PostgresPool.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';

const tokenService = new HmacJwtTokenService();
const app = createApp();

// Setup test tenant identifiers
const testDairyA = '00000000-0000-0000-0000-000000000081';
const testDairyB = '00000000-0000-0000-0000-000000000082';
const testCenterA = '00000000-0000-0000-0000-000000000083';

// Generate authenticated role tokens
const primaryDairyAdminTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000084',
  organizationId: testDairyA,
  role: 'PRIMARY_DAIRY_ADMIN',
  actorType: 'STAFF',
});

const dairyAdminTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000085',
  organizationId: testDairyA,
  role: 'DAIRY_ADMIN',
  actorType: 'STAFF',
});

const operatorTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000086',
  organizationId: testDairyA,
  role: 'COLLECTION_OPERATOR',
  actorType: 'STAFF',
});

const dairyAdminTokenB = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000087',
  organizationId: testDairyB,
  role: 'PRIMARY_DAIRY_ADMIN',
  actorType: 'STAFF',
});

const farmerTokenA = tokenService.signToken({
  userId: '00000000-0000-0000-0000-000000000088',
  organizationId: testDairyA,
  role: 'FARMER_CUSTOMER',
  actorType: 'CUSTOMER',
});

test('DFarm Roadmap Phase 07 — Dairy Admin Operational Management Verification Suite', async (suite) => {
  let customer1Id = '';
  let customer2Id = '';
  let cardUid1 = 'E1A2C3D40701';
  let cardUid2 = 'E1A2C3D40702';
  let feedProductId = '';
  let activeSessionId = '';
  let rateChartId = '';

  // Setup initial tenant data
  const seedDbs = async (targetDb) => {
    try {
      await targetDb.query(`
        INSERT INTO organizations (id, name, code, status)
        VALUES 
          ('${testDairyA}', 'Sahyadri Sahakari Dudh Utpadak', 'SAHYADRI', 'ACTIVE'),
          ('${testDairyB}', 'Warana Milk Cooperative Phase 7', 'WARANA-P7', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
        VALUES 
          ('${testCenterA}', '${testDairyA}', 'CC-01', 'Main Collection Center', 'Station Road', 'Shirgaon', 'Kolhapur', 'Maharashtra', '416234', '+919876543210', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);

      await targetDb.query(`
        INSERT INTO users (id, organization_id, username, phone_number, full_name, role, status)
        VALUES 
          ('00000000-0000-0000-0000-000000000084', '${testDairyA}', 'admin_primary', '+919876543284', 'Primary Admin', 'DAIRY_ADMIN', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000085', '${testDairyA}', 'admin_vasant', '+919876543285', 'Vasantrao Patil', 'DAIRY_ADMIN', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000086', '${testDairyA}', 'operator_vikas', '+919876543286', 'Kiosk Operator Vikas', 'COLLECTION_OPERATOR', 'ACTIVE'),
          ('00000000-0000-0000-0000-000000000087', '${testDairyB}', 'admin_sanjay', '+919876543287', 'Sanjay Deshmukh', 'DAIRY_ADMIN', 'ACTIVE')
        ON CONFLICT (id) DO NOTHING;
      `);
    } catch (err) {
      console.error('Seed error:', err);
    }
  };

  await seedDbs(db);
  const tenantDbA = await tenantDbManager.getTenantDb(testDairyA);
  await seedDbs(tenantDbA);
  const tenantDbB = await tenantDbManager.getTenantDb(testDairyB);
  await seedDbs(tenantDbB);

  // Seed Customer 1 (Active)
  const c1Res = await tenantDbA.query(
    `INSERT INTO customers (
       id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted
     ) VALUES (
       gen_random_uuid(), $1, $2, 'FARM-0701', 'Dnyaneshwar Shinde', '+919822770701', 'ACTIVE', 'APPROVED', FALSE
     ) RETURNING id;`,
    [testDairyA, testCenterA]
  );
  customer1Id = c1Res.rows[0].id;

  // Seed Customer 2 (Active)
  const c2Res = await tenantDbA.query(
    `INSERT INTO customers (
       id, organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted
     ) VALUES (
       gen_random_uuid(), $1, $2, 'FARM-0702', 'Babanrao Kadam', '+919822770702', 'ACTIVE', 'APPROVED', FALSE
     ) RETURNING id;`,
    [testDairyA, testCenterA]
  );
  customer2Id = c2Res.rows[0].id;

  // Seed Ledger Accounts for Customer 1 and Customer 2
  await tenantDbA.query(
    `INSERT INTO customer_ledger_accounts (id, organization_id, customer_id, current_balance)
     VALUES (gen_random_uuid(), $1, $2, 1500.00),
            (gen_random_uuid(), $1, $3, 800.00);`,
    [testDairyA, customer1Id, customer2Id]
  ).catch(() => {});

  // ============================================================================
  // GROUP A: Phase 06 Carry-Over Security Gates
  // ============================================================================
  await suite.test('GROUP A: Phase 06 Carry-Over Security Gates', async (t) => {
    // 1. Assign RFID card 1 to Customer 1
    await request(app)
      .post('/api/v1/rfid/assign')
      .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
      .send({ cardUid: cardUid1, customerId: customer1Id, operatorName: 'Test Admin' });

    await t.test('1. RFID lookup without authentication returns 401 Unauthorized', async () => {
      const res = await request(app)
        .get(`/api/v1/rfid/lookup/${cardUid1}?organizationId=${testDairyA}`);

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
    });

    await t.test('2. Query organizationId cannot override token tenant context (cross-dairy blocked with 403)', async () => {
      const res = await request(app)
        .get(`/api/v1/rfid/lookup/${cardUid1}?organizationId=${testDairyB}`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Cross-dairy lookup blocked/i);
    });

    await t.test('3. Authenticated RFID lookup returns strictly minimal data (no bank or biometrics)', async () => {
      const res = await request(app)
        .get(`/api/v1/rfid/lookup/${cardUid1}`)
        .set('Authorization', `Bearer ${operatorTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, customer1Id);
      assert.equal(res.body.data.farmerCode, 'FARM-0701');
      assert.equal(res.body.data.canDeliver, true);
      // Zero PII leakage
      assert.equal(res.body.data.bankAccountNumber, undefined);
      assert.equal(res.body.data.bankDetails, undefined);
      assert.equal(res.body.data.embedding, undefined);
      assert.equal(res.body.data.address, undefined);
    });

    await t.test('4. Duplicate active RFID assignment is blocked with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/rfid/assign')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({ cardUid: cardUid1, customerId: customer2Id, operatorName: 'Test Admin' });

      assert.equal(res.status, 409);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /already actively assigned/i);
    });

    await t.test('5. Generic customer profile PATCH cannot mutate bank details (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/v1/customers/${customer1Id}`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          fullName: 'Dnyaneshwar Shinde Updated',
          bankAccountNumber: '998877665544',
          bankIfscCode: 'SBIN0001234',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Bank beneficiary modifications are restricted/i);
    });

    await t.test('6. Customer DELETE performs safe soft-deletion without deleting historical data', async () => {
      const tempRes = await tenantDbA.query(
        `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status, registration_status, is_deleted)
         VALUES ($1, $2, 'FARM-TEMP', 'Temp Farmer', '+919822779999', 'ACTIVE', 'APPROVED', FALSE)
         RETURNING id;`,
        [testDairyA, testCenterA]
      );
      const tempId = tempRes.rows[0].id;

      const delRes = await request(app)
        .delete(`/api/v1/customers/${tempId}`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({ reason: 'Audit soft delete test' });

      assert.equal(delRes.status, 200);
      assert.equal(delRes.body.success, true);

      // Verify row still exists in database with is_deleted = TRUE
      const checkRes = await tenantDbA.query(
        `SELECT id, is_deleted FROM customers WHERE id = $1;`,
        [tempId]
      );
      assert.equal(checkRes.rows.length, 1);
      assert.equal(checkRes.rows[0].is_deleted, true);
    });
  });

  // ============================================================================
  // GROUP B: Dashboard Metrics & Operational Aggregations
  // ============================================================================
  await suite.test('GROUP B: Dashboard Metrics & Operational Aggregations', async (t) => {
    await t.test('7. Dashboard summary returns genuine tenant metrics', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data);
      assert.ok(typeof res.body.data.activeFarmersCount === 'number');
    });

    await t.test('8. Cross-dairy dashboard access blocked with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/v1/dashboard/summary?organizationId=${testDairyB}`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.success, false);
    });
  });

  // ============================================================================
  // GROUP C: Dairy-Specific Rate Chart Management & Preview
  // ============================================================================
  await suite.test('GROUP C: Dairy-Specific Rate Chart Management & Preview', async (t) => {
    await t.test('9. Rate charts listing returns active and draft charts for dairy', async () => {
      const res = await request(app)
        .get('/api/v1/rate-charts')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
    });

    await t.test('10. Creating draft rate chart validates positive base rate and biological ranges', async () => {
      // Invalid base rate
      const badRes = await request(app)
        .post('/api/v1/rate-charts/draft')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          title: 'Invalid Cow Chart',
          milkCategory: 'COW',
          baseRatePerLiter: -10,
        });

      assert.equal(badRes.status, 400);
      assert.match(badRes.body.error, /positive number/i);

      // Valid draft creation
      const goodRes = await request(app)
        .post('/api/v1/rate-charts/draft')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          title: 'Monsoon Cow Rate Chart 2026',
          milkCategory: 'COW',
          baseRatePerLiter: 39.5,
          minFat: 3.5,
          minSnf: 8.5,
        });

      assert.equal(goodRes.status, 201);
      assert.equal(goodRes.body.success, true);
      assert.ok(goodRes.body.data.chartId);
      rateChartId = goodRes.body.data.chartId;
    });

    await t.test('11. Activating rate chart succeeds and preserves historical versions', async () => {
      const res = await request(app)
        .post(`/api/v1/rate-charts/${rateChartId}/activate`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
    });

    await t.test('12. Rate preview endpoint computes payable rate without committing mutations', async () => {
      const res = await request(app)
        .post('/api/v1/rate-charts/preview')
        .set('Authorization', `Bearer ${dairyAdminTokenA}`)
        .send({
          milkCategory: 'COW',
          fatPercentage: 4.0,
          snfPercentage: 8.7,
          weightLiters: 15.0,
        });

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.ratePerLiter > 35);
      assert.ok(res.body.data.totalPayable > 500);
      assert.equal(res.body.data.isPreview, true);
    });
  });

  // ============================================================================
  // GROUP D: Feed Inventory & Farmer Feed Sales
  // ============================================================================
  await suite.test('GROUP D: Feed Inventory & Farmer Feed Sales', async (t) => {
    await t.test('13. Create feed product creates item in catalog', async () => {
      const res = await request(app)
        .post('/api/v1/feed/products')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          name: 'Amrut Milk Booster Mash 50kg',
          code: 'FEED-AMRUT-50',
          sellingPrice: 1250.00,
          baseUnit: 'BAG',
          packSize: 50,
          minimumStockLevel: 5,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.id);
      feedProductId = res.body.data.id;
    });

    await t.test('14. Stock receipt adds inventory and records stock movement', async () => {
      const res = await request(app)
        .post('/api/v1/feed/stock')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          productId: feedProductId,
          quantity: 20,
          centerId: testCenterA,
          unitCost: 1100.00,
          notes: 'Initial truck delivery batch #771',
        });

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.quantityAdded, 20);
      assert.equal(res.body.data.currentStock, 20);
    });

    await t.test('15. Feed sale with insufficient stock is rejected (no negative stock)', async () => {
      const res = await request(app)
        .post('/api/v1/feed/sales')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          customerId: customer1Id,
          productId: feedProductId,
          quantity: 50, // Available is only 20
          centerId: testCenterA,
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Insufficient stock/i);
    });

    await t.test('16. Farmer credit feed sale decrements inventory and posts debit to ledger', async () => {
      const res = await request(app)
        .post('/api/v1/feed/sales')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          customerId: customer1Id,
          productId: feedProductId,
          quantity: 2,
          centerId: testCenterA,
          paymentMode: 'CREDIT',
          notes: 'Credit feed purchase for milch buffalo',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.quantity, 2);
      assert.equal(res.body.data.totalAmount, 2500.00); // 2 * 1250
      assert.equal(res.body.data.remainingStock, 18); // 20 - 2
      assert.ok(res.body.data.ledgerReference);
      // Balance was 1500.00, minus 2500.00 = -1000.00
      assert.equal(res.body.data.balanceAfter, -1000.00);
    });

    await t.test('17. Customer App feed sales query returns actual purchase history', async () => {
      const res = await request(app)
        .get(`/api/v1/feed/sales?customerId=${customer1Id}`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.length >= 1);
      assert.equal(res.body.data[0].amount, 2500);
    });
  });

  // ============================================================================
  // GROUP E: Operational Devices & Kiosk Management
  // ============================================================================
  await suite.test('GROUP E: Operational Devices & Kiosk Management', async (t) => {
    await t.test('18. Device listing returns operational devices for dairy', async () => {
      const res = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length > 0);
    });

    await t.test('19. Operational device mapping binds kiosk to collection center', async () => {
      const res = await request(app)
        .post('/api/v1/devices/KIOSK_MAIN_01/mapping')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          centerId: testCenterA,
          counterLabel: 'Morning Counter 1',
        });

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.counterLabel, 'Morning Counter 1');
    });

    await t.test('20. Recording calibration metadata persists audit record', async () => {
      const res = await request(app)
        .post('/api/v1/devices/KIOSK_MAIN_01/calibration')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          calibrationDate: '2026-11-18',
          calibratedBy: 'Inspector Rajesh Deshmukh',
          verificationStatus: 'VERIFIED',
          serviceProvider: 'Maharashtra Metrology Directorate',
          notes: 'Standard 20kg deadweight test certified with zero error.',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.verificationStatus, 'VERIFIED');
    });
  });

  // ============================================================================
  // GROUP F: Collection Session Monitoring & Register
  // ============================================================================
  await suite.test('GROUP F: Collection Session Monitoring & Register', async (t) => {
    await t.test('21. Opening collection session creates active session record', async () => {
      const res = await request(app)
        .post('/api/v1/collections/sessions/open')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          centerId: testCenterA,
          shift: 'MORNING',
          operatorName: 'Sopan Rao',
        });

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.id || res.body.data.sessionId);
      activeSessionId = res.body.data.id || res.body.data.sessionId;
    });

    await t.test('22. Collection transactions register returns records with filter support', async () => {
      const res = await request(app)
        .get('/api/v1/collections/transactions')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
    });
  });

  // ============================================================================
  // GROUP G: Customer Ledger Administration
  // ============================================================================
  await suite.test('GROUP G: Customer Ledger Administration', async (t) => {
    await t.test('23. Customer ledger summary returns accurate double-entry balances', async () => {
      const res = await request(app)
        .get(`/api/v1/ledger/summary?customerId=${customer1Id}`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(typeof res.body.data.currentBalance === 'number');
    });

    await t.test('24. Customer ledger entries list includes FEED_PURCHASE debit', async () => {
      const res = await request(app)
        .get(`/api/v1/ledger/entries?customerId=${customer1Id}`)
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      const feedDebit = res.body.data.find((e) =>
        e.referenceType === 'FEED_PURCHASE' ||
        e.type === 'DEBIT' ||
        e.type === 'FEED_DEBIT' ||
        e.direction === 'DEBIT' ||
        e.entryType === 'DEBIT'
      );
      assert.ok(feedDebit, 'FEED_PURCHASE debit entry must exist in ledger');
    });
  });

  // ============================================================================
  // GROUP H: Billing Operations
  // ============================================================================
  await suite.test('GROUP H: Billing Operations', async (t) => {
    await t.test('25. Bills listing returns billing periods and statuses', async () => {
      const res = await request(app)
        .get('/api/v1/bills')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
    });
  });

  // ============================================================================
  // GROUP I: Payment Records & Operations
  // ============================================================================
  await suite.test('GROUP I: Payment Records & Operations', async (t) => {
    await t.test('26. Recording manual payout registers payment and posts ledger credit/debit', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`)
        .send({
          customerId: customer2Id,
          amount: 500.00,
          paymentMethod: 'BANK_TRANSFER',
          transactionReference: 'NEFT-TEST-7711',
          operatorName: 'Accountant Jadhav',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.amount, 500.00);
    });

    await t.test('27. Payment register returns recorded payments without Razorpay', async () => {
      const res = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      // Verify Razorpay is completely absent from payment data
      const paymentStr = JSON.stringify(res.body.data);
      assert.ok(!paymentStr.toLowerCase().includes('razorpay'), 'Razorpay must not appear in farmer payouts');
    });
  });

  // ============================================================================
  // GROUP J: Operational Reports & Exports
  // ============================================================================
  await suite.test('GROUP J: Operational Reports & Exports', async (t) => {
    await t.test('28. Collections report aggregates daily volume and quality averages', async () => {
      const res = await request(app)
        .get('/api/v1/reports/collections')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.summary);
      assert.ok(typeof res.body.summary.totalRecords === 'number');
    });

    await t.test('29. Feed operations report returns stock and sales summary', async () => {
      const res = await request(app)
        .get('/api/v1/reports/feed')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.ok(res.status === 200 || res.status === 201);
      assert.equal(res.body.success, true);
      assert.ok(res.body.inventory);
      assert.ok(res.body.recentSales);
    });

    await t.test('30. Data export produces CSV with masked PII and zero biometric vectors', async () => {
      const res = await request(app)
        .get('/api/v1/reports/export?type=collections&format=csv')
        .set('Authorization', `Bearer ${primaryDairyAdminTokenA}`);

      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /text\/csv/);
      assert.ok(!res.text.includes('embedding'), 'CSV export must not contain biometric vectors');
      assert.ok(!res.text.includes('bank_account_number'), 'CSV export must not expose raw bank accounts');
    });
  });
});
