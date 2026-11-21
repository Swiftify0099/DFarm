import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { createApp } from '../dist/app.js';
import { tenantDbManager } from '../dist/infrastructure/database/TenantDatabaseManager.js';
import { HmacJwtTokenService } from '../dist/infrastructure/security/HmacJwtTokenService.js';
import { PostgresCustomerMembershipRepository } from '../dist/infrastructure/repositories/PostgresCustomerMembershipRepository.js';
import { PostgresCustomerRepository } from '../dist/infrastructure/repositories/PostgresCustomerRepository.js';
import { PostgresCollectionTransactionRepository } from '../dist/infrastructure/repositories/PostgresCollectionTransactionRepository.js';
import { PostgresLedgerRepository } from '../dist/infrastructure/repositories/PostgresLedgerRepository.js';

describe('DFarm P0 End-to-End Customer Data Lifecycle & Multi-Tenant Isolation', () => {
  let server;
  let baseUrl;
  let tokenService;
  let membershipRepo;
  let customerRepo;
  let transactionRepo;
  let ledgerRepo;

  const dairyAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const dairyACode = 'SAHYADRI_01';
  const dairyAName = 'Sahyadri Cooperative Dairy';

  const dairyBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const dairyBCode = 'KRISHNA_02';
  const dairyBName = 'Krishna Valley Milk Producers';

  const centerAId = 'a1111111-1111-1111-1111-111111111111';
  const centerBId = 'b2222222-2222-2222-2222-222222222222';
  const sessionAId = '11111111-1111-1111-1111-111111111111';
  const operatorAId = '00000000-0000-0000-0000-000000000011';

  let testMobile = '+919876543210';
  let farmerCodeA = 'F-101';
  let farmerCodeB = 'K-405';
  const customerRealName = 'Pankaj Patil';

  let superAdminToken;

  before(async () => {
    testMobile = '+9198' + Math.floor(10000000 + Math.random() * 90000000);
    farmerCodeA = 'F-' + Math.floor(100 + Math.random() * 900);
    farmerCodeB = 'K-' + Math.floor(100 + Math.random() * 900);
    tokenService = new HmacJwtTokenService();
    membershipRepo = new PostgresCustomerMembershipRepository();
    customerRepo = new PostgresCustomerRepository();
    transactionRepo = new PostgresCollectionTransactionRepository();
    ledgerRepo = new PostgresLedgerRepository();

    const app = createApp();
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    superAdminToken = tokenService.signToken({
      userId: '00000000-0000-0000-0000-000000000099',
      role: 'SUPER_ADMIN',
      actorType: 'SUPER_ADMIN',
      organizationId: '00000000-0000-0000-0000-000000000001',
    });

    // Ensure control plane DB initialized
    await tenantDbManager.initialize();
    const controlDb = tenantDbManager.getControlPlaneDb();

    // Ensure clean state in control plane DB for re-runnable test isolation
    try {
      await controlDb.query(`DELETE FROM customer_dairy_memberships WHERE dairy_code IN ($1, $2);`, [dairyACode, dairyBCode]);
      await controlDb.query(`DELETE FROM dairy_database_mappings WHERE dairy_code IN ($1, $2);`, [dairyACode, dairyBCode]);
      await controlDb.query(`DELETE FROM organizations WHERE code IN ($1, $2) OR id IN ($3, $4);`, [dairyACode, dairyBCode, dairyAId, dairyBId]);
    } catch {}

    // Register organizations in control plane DB
    await controlDb.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES 
        ($1, $2, $3, 'ACTIVE'),
        ($4, $5, $6, 'ACTIVE');
    `, [dairyAId, dairyAName, dairyACode, dairyBId, dairyBName, dairyBCode]);

    // Provision separate tenant databases
    await tenantDbManager.provisionTenantDatabase({
      dairyId: dairyAId,
      dairyCode: dairyACode,
      dairyName: dairyAName,
    });

    await tenantDbManager.provisionTenantDatabase({
      dairyId: dairyBId,
      dairyCode: dairyBCode,
      dairyName: dairyBName,
    });

    // Seed center in Dairy A
    const tenantDbA = await tenantDbManager.getTenantDb(dairyAId);
    await tenantDbA.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES ($1, $2, $3, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `, [dairyAId, dairyAName, dairyACode]);

    await tenantDbA.query(`
      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
      VALUES ($1, $2, 'C-01', 'Sahyadri Main Center', 'Main Road', 'Piran', 'Sangli', 'Maharashtra', '416417', '+919876543210', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `, [centerAId, dairyAId]);

    // Seed operator and shift session in Dairy A
    await tenantDbA.query(`
      INSERT INTO users (id, organization_id, username, full_name, email, phone_number, role, status)
      VALUES ($1, $2, 'op1_sahyadri', 'Operator One', 'op1@sahyadri.in', '+919876543299', 'COLLECTION_OPERATOR', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `, [operatorAId, dairyAId]);

    await tenantDbA.query(`
      INSERT INTO kiosk_shift_sessions (
        id, session_code, organization_id, center_id, business_date, shift,
        status, opened_at, opening_operator_id, device_identifier, device_name,
        total_liters, cow_liters, buffalo_liters, transaction_count, total_amount, average_fat, average_snf, created_at, updated_at
      ) VALUES (
        $1, 'SESS-01', $2, $3, CURRENT_DATE, 'MORNING',
        'OPEN', NOW(), $4, 'DEVICE-KIOSK-01', 'Kiosk 1',
        0, 0, 0, 0, 0, 0, 0, NOW(), NOW()
      ) ON CONFLICT (id) DO NOTHING;
    `, [sessionAId, dairyAId, centerAId, operatorAId]);

    // Seed center in Dairy B
    const tenantDbB = await tenantDbManager.getTenantDb(dairyBId);
    await tenantDbB.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES ($1, $2, $3, 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `, [dairyBId, dairyBName, dairyBCode]);

    await tenantDbB.query(`
      INSERT INTO dairy_centers (id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, status)
      VALUES ($1, $2, 'C-02', 'Krishna Main Center', 'River Road', 'Miraj', 'Sangli', 'Maharashtra', '416410', '+919876543211', 'ACTIVE')
      ON CONFLICT (id) DO NOTHING;
    `, [centerBId, dairyBId]);

    // Clean any residual test customer records for idempotent test execution
    try {
      await controlDb.query(`DELETE FROM customer_dairy_memberships WHERE global_customer_id IN (SELECT id FROM global_customer_identities WHERE phone_number = $1);`, [testMobile]);
      await controlDb.query(`DELETE FROM global_customer_identities WHERE phone_number = $1;`, [testMobile]);
      await tenantDbA.query(`DELETE FROM customers WHERE normalized_mobile_number = $1;`, [testMobile]);
      await tenantDbB.query(`DELETE FROM customers WHERE normalized_mobile_number = $1;`, [testMobile]);
    } catch {}
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  let globalId;
  let tenantCustAId;
  let tenantCustBId;
  let customerTokenDairyA;

  test('Step 1: Customer registers at Dairy A; global identity and tenant record are mapped', async () => {
    // 1. Create global identity
    const gIdentity = await membershipRepo.createGlobalIdentity(testMobile);
    assert.ok(gIdentity.id, 'Global customer identity must have an ID');
    globalId = gIdentity.id;

    // 2. Insert customer into Dairy A tenant DB
    tenantCustAId = crypto.randomUUID();
    const tenantDbA = await tenantDbManager.getTenantDb(dairyAId);
    await tenantDbA.query(`
      INSERT INTO customers (
        id, organization_id, primary_center_id, farmer_code, full_name,
        normalized_mobile_number, status, registration_status,
        is_deleted, global_customer_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $7, $4, $5, 'ACTIVE', 'APPROVED', FALSE, $6, NOW(), NOW());
    `, [tenantCustAId, dairyAId, centerAId, customerRealName, testMobile, globalId, farmerCodeA]);

    // 3. Save central membership with customerName
    const { CustomerMembership } = await import('../dist/domain/entities/CustomerMembership.js');
    const membershipA = new CustomerMembership({
      id: crypto.randomUUID(),
      globalCustomerId: globalId,
      organizationId: dairyAId,
      tenantCustomerId: tenantCustAId,
      farmerCode: farmerCodeA,
      customerName: customerRealName,
      membershipStatus: 'APPROVED',
      dairyName: dairyAName,
      dairyCode: dairyACode,
      centerId: centerAId,
      centerName: 'Sahyadri Main Center',
    });
    await membershipRepo.saveMembership(membershipA);

    // Verify membership lookup
    const memberships = await membershipRepo.listMembershipsByGlobalId(globalId);
    assert.equal(memberships.length, 1);
    assert.equal(memberships[0].customerName, customerRealName);
    assert.equal(memberships[0].dairyName, dairyAName);
  });

  test('Step 2: Customer App OTP verify returns REAL customer name (NOT dairy name)', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/customer/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobileNumber: testMobile,
        otp: '123456',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.isRegistered, true);
    assert.equal(body.customer.fullName, customerRealName, 'Customer fullName must be the farmer name, NOT the dairy name!');
    assert.equal(body.user.customerProfile.name, customerRealName, 'CustomerProfile name must be the farmer name!');
    assert.equal(body.user.customerProfile.dairyName, dairyAName);

    customerTokenDairyA = body.accessToken;
    assert.ok(customerTokenDairyA);
  });

  test('Step 3: GET /customers/me returns accurate dairy details and membershipStatus', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customers/me`, {
      headers: {
        Authorization: `Bearer ${customerTokenDairyA}`,
        'x-dairy-tenant-id': dairyAId,
      },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    const data = body.data;
    assert.equal(data.fullName, customerRealName);
    assert.equal(data.dairyName, dairyAName);
    assert.equal(data.dairyCode, dairyACode);
    assert.equal(data.membershipStatus, 'APPROVED');
    assert.equal(data.farmerCode, farmerCodeA);
  });

  test('Step 4: Customer registers at Dairy B; shares global identity with zero operational leakage', async () => {
    // Insert independent customer record in Dairy B tenant DB
    tenantCustBId = crypto.randomUUID();
    const tenantDbB = await tenantDbManager.getTenantDb(dairyBId);
    await tenantDbB.query(`
      INSERT INTO customers (
        id, organization_id, primary_center_id, farmer_code, full_name,
        normalized_mobile_number, status, registration_status,
        is_deleted, global_customer_id, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 'APPROVED', FALSE, $7, NOW(), NOW());
    `, [tenantCustBId, dairyBId, centerBId, farmerCodeB, customerRealName, testMobile, globalId]);

    // Save central membership for Dairy B
    const { CustomerMembership } = await import('../dist/domain/entities/CustomerMembership.js');
    const membershipB = new CustomerMembership({
      id: crypto.randomUUID(),
      globalCustomerId: globalId,
      organizationId: dairyBId,
      tenantCustomerId: tenantCustBId,
      farmerCode: farmerCodeB,
      customerName: customerRealName,
      membershipStatus: 'APPROVED',
      dairyName: dairyBName,
      dairyCode: dairyBCode,
      centerId: centerBId,
      centerName: 'Krishna Main Center',
    });
    await membershipRepo.saveMembership(membershipB);

    // Verify customer now has 2 independent memberships
    const memberships = await membershipRepo.listMembershipsByGlobalId(globalId);
    assert.equal(memberships.length, 2);
    const codes = memberships.map((m) => m.farmerCode);
    assert.ok(codes.includes(farmerCodeA));
    assert.ok(codes.includes(farmerCodeB));
  });

  test('Step 5: Switch dairy to Dairy B preserves customer real name', async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/customer/select-dairy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerTokenDairyA}`,
      },
      body: JSON.stringify({
        dairyId: dairyBId,
        globalCustomerId: globalId,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.selectedDairy.dairyId, dairyBId);
    assert.equal(body.selectedDairy.dairyName, dairyBName);
    assert.equal(body.user.customerProfile.name, customerRealName, 'Profile name must remain Pankaj Patil upon switching!');
  });

  test('Step 6: Milk collection and ledger in Dairy A are isolated from Dairy B', async () => {
    const { MilkCollectionTransaction } = await import('../dist/domain/entities/MilkCollectionTransaction.js');
    const today = new Date().toISOString().split('T')[0];
    const txn = new MilkCollectionTransaction({
      id: crypto.randomUUID(),
      transactionCode: `TXN-${Date.now()}`,
      sessionId: sessionAId,
      dairyId: dairyAId,
      centerId: centerAId,
      customerId: tenantCustAId,
      customerCode: farmerCodeA,
      customerName: customerRealName,
      timestamp: new Date().toISOString(),
      date: today,
      shift: 'MORNING',
      milkCategory: 'COW',
      weightLiters: 20.5,
      fatPercentage: 4.5,
      snfPercentage: 8.8,
      clrDensity: 28.5,
      appliedRatePerLiter: 42.0,
      rateChartVersion: 1,
      totalAmount: 861.0,
      identificationMethod: 'FACE_YUNET_SFACE',
      syncStatus: 'SYNCED_CLOUD',
      deviceId: 'DEVICE-KIOSK-01',
      operatorName: 'Operator',
      idempotencyKey: `IDEMP-${Date.now()}`,
    });

    await transactionRepo.save(txn);

    // 2. Post double-entry financial ledger journal
    const { CustomerLedgerAccount } = await import('../dist/domain/entities/CustomerLedgerAccount.js');
    let ledgerA = await ledgerRepo.findByCustomer(tenantCustAId, dairyAId);
    if (!ledgerA) {
      ledgerA = new CustomerLedgerAccount({
        id: crypto.randomUUID(),
        customerId: tenantCustAId,
        organizationId: dairyAId,
        currency: 'INR',
        currentBalance: 0.0,
      });
    }
    const ledgerEntry = ledgerA.postCredit(861.0, 'Milk Intake Credit (COW 20.5L @ ₹42/L)', txn.id);
    await ledgerRepo.save(ledgerA, ledgerEntry);

    // Verify balanced double-entry in physical tenant database: SUM(Debit) = SUM(Credit)
    const tenantDbA = await tenantDbManager.getTenantDb(dairyAId);
    const journalRes = await tenantDbA.query(`
      SELECT entry_type, account_type, amount 
      FROM ledger_entries 
      WHERE transaction_id = $1;
    `, [ledgerEntry.id]);
    assert.equal(journalRes.rows.length, 2, 'Must have exactly 2 balanced journal lines');
    const debitLine = journalRes.rows.find(r => r.entry_type === 'DEBIT');
    const creditLine = journalRes.rows.find(r => r.entry_type === 'CREDIT');
    assert.ok(debitLine && creditLine, 'Must have both DEBIT and CREDIT lines');
    assert.equal(debitLine.account_type, 'MILK_PURCHASE_EXPENSE');
    assert.equal(creditLine.account_type, 'CUSTOMER_PAYABLE');
    assert.equal(Number(debitLine.amount), 861.00);
    assert.equal(Number(creditLine.amount), 861.00);

    // Query collection history in Dairy A
    const resA = await fetch(`${baseUrl}/api/v1/collection/history?limit=10&page=1`, {
      headers: {
        Authorization: `Bearer ${customerTokenDairyA}`,
        'x-dairy-tenant-id': dairyAId,
      },
    });
    assert.equal(resA.status, 200);
    const bodyA = await resA.json();
    assert.ok(bodyA.data.length >= 1);
    assert.equal(Number(bodyA.data[0].quantityLiters || bodyA.data[0].netWeight), 20.5);

    // Query collection history in Dairy B (must be 0 rows - ZERO CROSS-TENANT LEAKAGE)
    const tokenB = tokenService.signToken({
      userId: tenantCustBId,
      organizationId: dairyBId,
      globalCustomerId: globalId,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
    });
    const resB = await fetch(`${baseUrl}/api/v1/collection/history?limit=10&page=1`, {
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'x-dairy-tenant-id': dairyBId,
      },
    });
    assert.equal(resB.status, 200);
    const bodyB = await resB.json();
    assert.equal(bodyB.data.length, 0, 'Dairy B collection history must be 0 for this farmer!');
  });

  test('Step 7: Bill generation in Dairy A writes to tenant DB and is visible in bills API', async () => {
    // Generate bill for customer at Dairy A
    const genRes = await fetch(`${baseUrl}/api/v1/bills/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
        'x-dairy-tenant-id': dairyAId,
      },
      body: JSON.stringify({
        customerId: tenantCustAId,
        organizationId: dairyAId,
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
      }),
    });
    assert.equal(genRes.status, 201);
    const genBody = await genRes.json();
    assert.equal(genBody.success, true);
    assert.equal(genBody.data.totalMilkWeight, 20.5);
    assert.equal(genBody.data.netPayableAmount, 861.00);

    // Customer App queries bills
    const billsRes = await fetch(`${baseUrl}/api/v1/bills`, {
      headers: {
        Authorization: `Bearer ${customerTokenDairyA}`,
        'x-dairy-tenant-id': dairyAId,
      },
    });
    assert.equal(billsRes.status, 200);
    const billsBody = await billsRes.json();
    assert.ok(billsBody.data.length >= 1);
    assert.equal(billsBody.data[0].totalLiters, 20.5);
    assert.equal(billsBody.data[0].netPayableAmount, 861.00);
  });

  test('Step 8: Super Admin permanently deprovisions Dairy A', async () => {
    const delRes = await fetch(`${baseUrl}/api/v1/dairies/${dairyAId}/deprovision`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
      },
      body: JSON.stringify({
        confirmDairyCode: dairyACode,
      }),
    });
    assert.equal(delRes.status, 200);
    const delBody = await delRes.json();
    assert.equal(delBody.success, true);
    assert.ok(delBody.message.includes('successfully deprovisioned'));

    // Verify Dairy A central membership is removed
    const memberships = await membershipRepo.listMembershipsByGlobalId(globalId);
    assert.equal(memberships.length, 1, 'Only Dairy B membership should remain!');
    assert.equal(memberships[0].organizationId, dairyBId);

    // Verify global customer identity is PRESERVED
    const identity = await membershipRepo.findGlobalIdentityByPhone(testMobile);
    assert.ok(identity, 'Global customer identity must NOT be deleted!');
    assert.equal(identity.id, globalId);

    // Verify Dairy B remains functional
    const tokenB = tokenService.signToken({
      userId: tenantCustBId,
      organizationId: dairyBId,
      globalCustomerId: globalId,
      role: 'FARMER_CUSTOMER',
      actorType: 'CUSTOMER',
    });
    const profileRes = await fetch(`${baseUrl}/api/v1/customers/me`, {
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'x-dairy-tenant-id': dairyBId,
      },
    });
    assert.equal(profileRes.status, 200);
    const profileData = (await profileRes.json()).data;
    assert.equal(profileData.fullName, customerRealName);
    assert.equal(profileData.dairyName, dairyBName);
    assert.equal(profileData.farmerCode, farmerCodeB);
  });

  test('Step 9: Clean recreation of Dairy with fresh empty tenant DB', async () => {
    const newDairyId = crypto.randomUUID();
    const controlDb = tenantDbManager.getControlPlaneDb();

    await controlDb.query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES ($1, $2, $3, 'ACTIVE');
    `, [newDairyId, 'Sahyadri New Cooperative', dairyACode]);

    // Provision fresh database
    await tenantDbManager.provisionTenantDatabase({
      dairyId: newDairyId,
      dairyCode: dairyACode,
      dairyName: 'Sahyadri New Cooperative',
    });

    const newTenantDb = await tenantDbManager.getTenantDb(newDairyId);
    const checkCusts = await newTenantDb.query(`SELECT COUNT(*) as cnt FROM customers;`);
    assert.equal(Number(checkCusts.rows[0].cnt), 0, 'Clean recreated dairy must have 0 customer records (no ghost data)');

    const checkColls = await newTenantDb.query(`SELECT COUNT(*) as cnt FROM milk_collections;`);
    assert.equal(Number(checkColls.rows[0].cnt), 0, 'Clean recreated dairy must have 0 milk collections');
  });
});
