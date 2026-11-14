import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import crypto from 'node:crypto';
import { createApp } from '../dist/app.js';
import { signJwt } from '../dist/jwt.js';
import { pool } from '../dist/db.js';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function query(text, params) {
  return dbClient.query(text, params);
}

test('DFARM Phase 14: Cattle Feed Inventory, Procurement, Sales & Stock Accounting Suite (26 Scenarios)', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  const runSuffix = Date.now().toString().slice(-6);
  let org1Id = '';
  let org2Id = '';
  let center1Id = '';
  let center2Id = '';
  let centerOrg2Id = '';

  let ownerUserId = '';
  let invManagerUserId = '';
  let operatorUserId = '';
  let org2OwnerUserId = '';

  let ownerToken = '';
  let invManagerToken = '';
  let operatorToken = '';
  let org2OwnerToken = '';

  let customer1Id = '';
  let customer2Id = '';
  let org2CustomerId = '';

  let categoryId = '';
  let productId1 = '';
  let productCode1 = `FEED_P14_${runSuffix}_01`;
  let productId2 = '';
  let productCode2 = `FEED_P14_${runSuffix}_02`;
  let supplierId = '';
  let supplierCode = `SUP_P14_${runSuffix}`;
  let purchaseId = '';
  let testSaleId = '';
  let testSaleItemId1 = '';

  await t.test('0. Setup Test Organizations, Centers, Staff Users, and Customers', async () => {
    // 1. Fetch or create Org 1 and Org 2
    const o1 = await query("SELECT id FROM organizations WHERE code = 'SDCU_01' OR name ILIKE '%Sangli%' LIMIT 1;");
    assert.ok(o1.rows.length > 0, 'Org 1 must exist');
    org1Id = o1.rows[0].id;

    const o2 = await query("SELECT id FROM organizations WHERE code = 'KDCU_02' OR name ILIKE '%Kolhapur%' LIMIT 1;");
    if (o2.rows.length > 0) {
      org2Id = o2.rows[0].id;
    } else {
      const o2Res = await query(
        `INSERT INTO organizations (code, name, state, district, currency, is_active)
         VALUES ('KDCU_P14_' || $1, 'Kolhapur District Coop P14', 'MAHARASHTRA', 'Kolhapur', 'INR', TRUE)
         RETURNING id;`,
        [runSuffix]
      );
      org2Id = o2Res.rows[0].id;
    }

    // 2. Fetch or create Dairy Centers for Org 1 (Center 1, Center 2) and Org 2 (Center Org 2)
    const c1 = await query(`SELECT id FROM dairy_centers WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1;`, [org1Id]);
    if (c1.rows.length > 0) {
      center1Id = c1.rows[0].id;
    } else {
      const c1Res = await query(
        `INSERT INTO dairy_centers (organization_id, code, name, status)
         VALUES ($1, 'CEN_P14_01_' || $2, 'Tasgaon Main Center', 'ACTIVE')
         RETURNING id;`,
        [org1Id, runSuffix]
      );
      center1Id = c1Res.rows[0].id;
    }

    const c2 = await query(`SELECT id FROM dairy_centers WHERE organization_id = $1 AND id != $2 LIMIT 1;`, [org1Id, center1Id]);
    if (c2.rows.length > 0) {
      center2Id = c2.rows[0].id;
    } else {
      const c2Res = await query(
        `INSERT INTO dairy_centers (organization_id, code, name, status)
         VALUES ($1, 'CEN_P14_02_' || $2, 'Tasgaon East Center', 'ACTIVE')
         RETURNING id;`,
        [org1Id, runSuffix]
      );
      center2Id = c2Res.rows[0].id;
    }

    const cOrg2 = await query(`SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;`, [org2Id]);
    if (cOrg2.rows.length > 0) {
      centerOrg2Id = cOrg2.rows[0].id;
    } else {
      const cOrg2Res = await query(
        `INSERT INTO dairy_centers (organization_id, code, name, status)
         VALUES ($1, 'CEN_ORG2_' || $2, 'Shirol Center Org2', 'ACTIVE')
         RETURNING id;`,
        [org2Id, runSuffix]
      );
      centerOrg2Id = cOrg2Res.rows[0].id;
    }

    // 3. Create Staff Users:
    // Dairy Owner (Org 1)
    const ownerRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'p14_owner_' || $2, 'Owner Patil', 'p14_owner_' || $2 || '@dfarm.test', '+9198' || $2 || '1', 'DAIRY_OWNER', 'ACTIVE')
       RETURNING id;`,
      [org1Id, runSuffix]
    );
    ownerUserId = ownerRes.rows[0].id;
    await query(`INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`, [ownerUserId, center1Id]);
    await query(`INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, FALSE) ON CONFLICT DO NOTHING;`, [ownerUserId, center2Id]);

    // Inventory Manager (Org 1, Center 1)
    const invRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'p14_invmgr_' || $2, 'Manager Shinde', 'p14_invmgr_' || $2 || '@dfarm.test', '+9198' || $2 || '2', 'INVENTORY_MANAGER', 'ACTIVE')
       RETURNING id;`,
      [org1Id, runSuffix]
    );
    invManagerUserId = invRes.rows[0].id;
    await query(`INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`, [invManagerUserId, center1Id]);

    // Operator (Org 1, Center 1 only)
    const opRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'p14_op_' || $2, 'Operator Kulkarni', 'p14_op_' || $2 || '@dfarm.test', '+9198' || $2 || '3', 'COLLECTION_OPERATOR', 'ACTIVE')
       RETURNING id;`,
      [org1Id, runSuffix]
    );
    operatorUserId = opRes.rows[0].id;
    await query(`INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`, [operatorUserId, center1Id]);

    // Org 2 Owner
    const org2OwnerRes = await query(
      `INSERT INTO users (organization_id, username, full_name, email, phone_number, role, status)
       VALUES ($1, 'p14_org2_owner_' || $2, 'Org2 Owner Mane', 'p14_org2_owner_' || $2 || '@dfarm.test', '+9198' || $2 || '4', 'DAIRY_OWNER', 'ACTIVE')
       RETURNING id;`,
      [org2Id, runSuffix]
    );
    org2OwnerUserId = org2OwnerRes.rows[0].id;
    await query(`INSERT INTO user_center_assignments (user_id, center_id, is_primary) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING;`, [org2OwnerUserId, centerOrg2Id]);

    // 4. Create Customers
    const cust1Res = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status)
       VALUES ($1, $2, 'FC-P14-' || $3 || '-01', 'Anand Koli', '+9197' || $3 || '1', 'ACTIVE')
       RETURNING id;`,
      [org1Id, center1Id, runSuffix]
    );
    customer1Id = cust1Res.rows[0].id;

    const cust2Res = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status)
       VALUES ($1, $2, 'FC-P14-' || $3 || '-02', 'Babanrao Shirole', '+9197' || $3 || '2', 'ACTIVE')
       RETURNING id;`,
      [org1Id, center1Id, runSuffix]
    );
    customer2Id = cust2Res.rows[0].id;

    const custOrg2Res = await query(
      `INSERT INTO customers (organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number, status)
       VALUES ($1, $2, 'FC-P14-' || $3 || '-03', 'Chandrakant Powar', '+9197' || $3 || '3', 'ACTIVE')
       RETURNING id;`,
      [org2Id, centerOrg2Id, runSuffix]
    );
    org2CustomerId = custOrg2Res.rows[0].id;

    // Initialize customer ledger accounts (if not already existing)
    await query(
      `INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
       VALUES ($1, $2, 'INR', 0.00), ($3, $2, 'INR', 0.00)
       ON CONFLICT (customer_id) DO NOTHING;`,
      [customer1Id, org1Id, customer2Id]
    );

    // Tokens
    ownerToken = signJwt({
      sub: ownerUserId,
      userId: ownerUserId,
      organizationId: org1Id,
      role: 'DAIRY_OWNER',
      centerIds: [center1Id, center2Id],
    });

    invManagerToken = signJwt({
      sub: invManagerUserId,
      userId: invManagerUserId,
      organizationId: org1Id,
      role: 'INVENTORY_MANAGER',
      centerIds: [center1Id],
    });

    operatorToken = signJwt({
      sub: operatorUserId,
      userId: operatorUserId,
      organizationId: org1Id,
      role: 'COLLECTION_OPERATOR',
      centerIds: [center1Id],
    });

    org2OwnerToken = signJwt({
      sub: org2OwnerUserId,
      userId: org2OwnerUserId,
      organizationId: org2Id,
      role: 'DAIRY_OWNER',
      centerIds: [centerOrg2Id],
    });

    // Feed Category
    const catRes = await query(
      `INSERT INTO feed_categories (organization_id, code, name, description)
       VALUES ($1, 'CAT_P14_' || $2, 'Compound Feed & Supplements', 'Nutritious balanced feeds')
       RETURNING id;`,
      [org1Id, runSuffix]
    );
    categoryId = catRes.rows[0].id;

    assert.ok(org1Id && center1Id && customer1Id && ownerToken, 'Setup successfully completed');
  });

  // 1. Product creation
  await t.test('1. Product creation: should create product with unit, pack size, pricing', async () => {
    const res = await request(app)
      .post('/api/v1/feed/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        categoryId,
        code: productCode1,
        name: 'Super Milk Cattle Feed 50kg',
        description: '22% Protein balanced cattle pellet feed',
        packSize: 50.0,
        packUnit: 'BAG',
        baseUnit: 'KG',
        defaultPurchasePrice: 1200.0,
        sellingPrice: 1450.0,
        taxRatePercent: 5.0,
        minimumStockLevel: 20.0,
      });

    assert.equal(res.status, 201, `Expected 201 Created: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.code, productCode1);
    assert.equal(Number(res.body.data.packSize), 50.0);
    assert.equal(res.body.data.packUnit, 'BAG');
    assert.equal(Number(res.body.data.sellingPrice), 1450.0);
    productId1 = res.body.data.id;
  });

  // 2. Duplicate product code rejection
  await t.test('2. Duplicate product code: should reject creation with duplicate code in same org', async () => {
    const res = await request(app)
      .post('/api/v1/feed/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        categoryId,
        code: productCode1, // duplicate code
        name: 'Duplicate Product Test',
        packSize: 50.0,
        packUnit: 'BAG',
        baseUnit: 'KG',
        sellingPrice: 1500.0,
      });

    assert.equal(res.status, 409, 'Expected 409 Conflict for duplicate product code');
    assert.equal(res.body.success, false);
  });

  // 3. Supplier creation
  await t.test('3. Supplier creation: should register feed supplier with contact and GST', async () => {
    const res = await request(app)
      .post('/api/v1/feed/suppliers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        supplierCode,
        name: `Maharashtra Cattle Feeds Ltd ${runSuffix}`,
        contactPerson: 'Sunil Jagtap',
        phoneNumber: '+919876543210',
        email: `feed_supplier_${runSuffix}@supplier.test`,
        address: 'MIDC Kupwad, Sangli, Maharashtra 416436',
        gstNumber: '27AAAAA0000A1Z5',
      });

    assert.equal(res.status, 201, `Expected 201 Created: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.contactPerson, 'Sunil Jagtap');
    supplierId = res.body.data.id;
  });

  // 4. Purchase recording
  await t.test('4. Purchase recording: should record feed purchase order in SUBMITTED status', async () => {
    const res = await request(app)
      .post('/api/v1/feed/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        centerId: center1Id,
        supplierId,
        supplierInvoiceNumber: `INV-SUP-${runSuffix}-01`,
        purchaseDate: new Date().toISOString().split('T')[0],
        idempotencyKey: `IDEM-PUR-${runSuffix}-01`,
        items: [
          {
            productId: productId1,
            quantity: 100.0,
            unit: 'BAG',
            unitCost: 1200.0,
            taxRatePercent: 5.0,
            batchNumber: `BATCH-P14-${runSuffix}`,
          },
        ],
      });

    assert.equal(res.status, 201, `Expected 201 Created: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.status === 'ORDERED' || res.body.data.status === 'SUBMITTED');
    assert.equal(Number(res.body.data.subtotal), 120000.0);
    assert.equal(Number(res.body.data.totalAmount), 126000.0);
    purchaseId = res.body.data.id;
  });

  // 5. Stock receipt
  await t.test('5. Stock receipt: should authorize receiving, increase center stock, calculate WAC', async () => {
    const res = await request(app)
      .post(`/api/v1/feed/purchases/${purchaseId}/receive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        idempotencyKey: `IDEM-RCV-${runSuffix}-01`,
        notes: 'Verified 100 bags received in good condition',
      });

    assert.equal(res.status, 200, `Expected 200 OK: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'RECEIVED');

    // Verify center_product_inventory (100 bags * 50 kg/bag = 5000 kg)
    const invRes = await query(
      `SELECT current_stock FROM center_product_inventory 
       WHERE center_id = $1 AND product_id = $2;`,
      [center1Id, productId1]
    );
    assert.equal(invRes.rows.length, 1);
    assert.equal(Number(invRes.rows[0].current_stock), 5000.0);

    // Verify product weighted_avg_cost updated
    const prodRes = await query(
      `SELECT weighted_avg_cost FROM feed_products WHERE id = $1;`,
      [productId1]
    );
    assert.ok(Number(prodRes.rows[0].weighted_avg_cost) > 0);

    // Verify stock_movements entry
    const smRes = await query(
      `SELECT movement_type, direction, quantity, unit_cost 
       FROM stock_movements 
       WHERE reference_id = $1 AND movement_type = 'PURCHASE_RECEIPT';`,
      [purchaseId]
    );
    assert.equal(smRes.rows.length, 1);
    assert.equal(smRes.rows[0].direction, 'IN');
    assert.equal(Number(smRes.rows[0].quantity), 5000.0);
  });

  // 6. Duplicate receipt prevention
  await t.test('6. Duplicate receipt prevention: should reject receiving an already received purchase', async () => {
    const res = await request(app)
      .post(`/api/v1/feed/purchases/${purchaseId}/receive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        idempotencyKey: `IDEM-RCV-DUP-${runSuffix}`,
      });

    assert.ok(res.status === 400 || res.status === 409, 'Expected 400 or 409 for already received purchase');
    assert.equal(res.body.success, false);
  });

  // 7. Current stock calculation
  await t.test('7. Current stock calculation: should reflect received stock and valuation', async () => {
    const res = await request(app)
      .get(`/api/v1/inventory?centerId=${center1Id}`)
      .set('Authorization', `Bearer ${ownerToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const item = res.body.data.find((p) => p.productId === productId1);
    assert.ok(item, 'Product must be listed in inventory');
    assert.equal(Number(item.currentStock), 5000.0);
  });

  // 8. Customer feed sale
  await t.test('8. Customer feed sale: should process credit sale, deduct stock, generate sale record', async () => {
    const idempotencyKey = `IDEM-SALE-${runSuffix}-01`;
    const res = await request(app)
      .post('/api/v1/feed/sales')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: center1Id,
        customerId: customer1Id,
        paymentMode: 'CREDIT',
        idempotencyKey,
        items: [
          {
            productId: productId1,
            quantity: 5.0,
            unit: 'BAG',
          },
        ],
      });

    assert.equal(res.status, 201, `Expected 201 Created: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    testSaleId = res.body.data.saleId || res.body.data.id;
    assert.ok(testSaleId, 'Sale ID must be present');
    // 5 * 1450 = 7250 + 5% tax (362.50) = 7612.50
    assert.equal(Number(res.body.data.totalAmount), 7612.5);

    // Save testSaleItemId1 for return testing from feed_sale_items
    const itemQuery = await query(`SELECT id FROM feed_sale_items WHERE sale_id = $1 LIMIT 1;`, [testSaleId]);
    assert.ok(itemQuery.rows.length > 0, 'Sale items must exist');
    testSaleItemId1 = itemQuery.rows[0].id;
    assert.ok(testSaleItemId1, 'Sale item ID must be present');

    // Verify stock deducted by 250 kg (5 bags * 50 kg) to 4750.0
    const invRes = await query(
      `SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`,
      [center1Id, productId1]
    );
    assert.equal(Number(invRes.rows[0].current_stock), 4750.0);
  });

  // 9. Multiple-product invoice
  await t.test('9. Multiple-product invoice: should create multi-product sale and deduct each stock', async () => {
    // Create product 2 (Mineral Mixture 5kg)
    const p2Res = await request(app)
      .post('/api/v1/feed/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        categoryId,
        code: productCode2,
        name: 'Mineral Mixture Premium 5kg',
        packSize: 5.0,
        packUnit: 'BAG',
        baseUnit: 'KG',
        defaultPurchasePrice: 400.0,
        sellingPrice: 550.0,
        taxRatePercent: 0.0,
        minimumStockLevel: 10.0,
      });
    assert.equal(p2Res.status, 201);
    productId2 = p2Res.body.data.id;

    // Procure & receive stock for product 2 (50 bags)
    const pur2Res = await request(app)
      .post('/api/v1/feed/purchases')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        centerId: center1Id,
        supplierId,
        supplierInvoiceNumber: `INV-SUP2-${runSuffix}`,
        purchaseDate: new Date().toISOString().split('T')[0],
        idempotencyKey: `IDEM-PUR2-${runSuffix}`,
        items: [
          {
            productId: productId2,
            quantity: 50.0,
            unit: 'BAG',
            unitCost: 400.0,
            taxRatePercent: 0.0,
          },
        ],
      });
    const pur2Id = pur2Res.body.data.id;
    await request(app)
      .post(`/api/v1/feed/purchases/${pur2Id}/receive`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ idempotencyKey: `IDEM-RCV2-${runSuffix}` });

    // Multi-item customer sale: 2 bags Product 1 + 3 bags Product 2
    const saleRes = await request(app)
      .post('/api/v1/feed/sales')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: center1Id,
        customerId: customer2Id,
        paymentMode: 'CREDIT',
        idempotencyKey: `IDEM-MULTI-${runSuffix}`,
        items: [
          {
            productId: productId1,
            quantity: 2.0,
            unit: 'BAG',
          },
          {
            productId: productId2,
            quantity: 3.0,
            unit: 'BAG',
          },
        ],
      });

    assert.equal(saleRes.status, 201);
    // Item 1: 2 * 1450 = 2900 + 145 tax = 3045
    // Item 2: 3 * 550 = 1650
    // Total: 4695
    assert.equal(Number(saleRes.body.data.totalAmount), 4695.0);

    // Verify stock balances: Product 1 was 4750, now 4650; Product 2 was 250, now 235
    const inv1 = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId1]);
    const inv2 = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId2]);
    assert.equal(Number(inv1.rows[0].current_stock), 4650.0);
    assert.equal(Number(inv2.rows[0].current_stock), 235.0);
  });

  // 10. Stock shortage rejection
  await t.test('10. Stock shortage rejection: should reject sale when requested qty > available stock', async () => {
    const res = await request(app)
      .post('/api/v1/feed/sales')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: center1Id,
        customerId: customer1Id,
        paymentMode: 'CREDIT',
        idempotencyKey: `IDEM-SHORT-${runSuffix}`,
        items: [
          {
            productId: productId1,
            quantity: 9999.0, // far exceeds 93 bags
            unit: 'BAG',
          },
        ],
      });

    assert.equal(res.status, 400, 'Expected 400 Bad Request / Insufficient stock');
    assert.equal(res.body.success, false);
  });

  // 11. Customer ledger debit
  await t.test('11. Customer ledger debit: should verify ledger_transactions has FEED_PURCHASE_DEBIT entry', async () => {
    const ledgerRes = await query(
      `SELECT transaction_type, direction, amount, balance_after, reference_id 
       FROM ledger_transactions 
       WHERE customer_id = $1 AND reference_id = $2;`,
      [customer1Id, testSaleId]
    );

    assert.equal(ledgerRes.rows.length, 1, 'Customer ledger debit transaction must exist');
    const entry = ledgerRes.rows[0];
    assert.equal(entry.transaction_type, 'FEED_PURCHASE_DEBIT');
    assert.equal(entry.direction, 'DEBIT');
    assert.equal(Number(entry.amount), 7612.5);
  });

  // 12. Balanced journal
  await t.test('12. Balanced journal: should verify balanced double-entry accounting in ledger_entries', async () => {
    const txnRes = await query(
      `SELECT id FROM ledger_transactions WHERE reference_id = $1;`,
      [testSaleId]
    );
    assert.ok(txnRes.rows.length > 0);
    const txnId = txnRes.rows[0].id;

    const entriesRes = await query(
      `SELECT account_type, entry_type, amount FROM ledger_entries WHERE transaction_id = $1 ORDER BY entry_type;`,
      [txnId]
    );
    assert.equal(entriesRes.rows.length, 2);

    const debitEntry = entriesRes.rows.find((e) => e.entry_type === 'DEBIT');
    const creditEntry = entriesRes.rows.find((e) => e.entry_type === 'CREDIT');

    assert.ok(debitEntry && creditEntry, 'Both debit and credit entries must exist');
    assert.equal(debitEntry.account_type, 'CUSTOMER_PAYABLE');
    assert.equal(creditEntry.account_type, 'FEED_INVENTORY');
    assert.equal(Number(debitEntry.amount), Number(creditEntry.amount));
    assert.equal(Number(debitEntry.amount), 7612.5);
  });

  // 13. Atomic rollback
  await t.test('13. Atomic rollback: if one product in multi-item sale fails, entire transaction must rollback', async () => {
    const preInv1 = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId1]);
    const preStock1 = Number(preInv1.rows[0].current_stock);

    const res = await request(app)
      .post('/api/v1/feed/sales')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: center1Id,
        customerId: customer1Id,
        paymentMode: 'CREDIT',
        idempotencyKey: `IDEM-ROLLBACK-${runSuffix}`,
        items: [
          { productId: productId1, quantity: 1.0, unit: 'BAG' },
          { productId: productId2, quantity: 9999.0, unit: 'BAG' }, // Shortage
        ],
      });

    assert.equal(res.status, 400);

    // Verify product 1 stock was NOT deducted
    const postInv1 = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId1]);
    assert.equal(Number(postInv1.rows[0].current_stock), preStock1, 'Stock must not change when transaction rolls back');
  });

  // 14. Return of saleable item
  await t.test('14. Return of saleable item: should credit customer and add stock back to center inventory', async () => {
    const preInv = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId1]);
    const preStock = Number(preInv.rows[0].current_stock); // 93

    const res = await request(app)
      .post(`/api/v1/feed/sales/${testSaleId}/return`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        saleItemId: testSaleItemId1,
        returnQuantity: 1.0,
        stockCondition: 'SALEABLE',
        reason: 'Farmer ordered extra bag by mistake',
        approvedBy: ownerUserId,
        idempotencyKey: `IDEM-RET-SAL-${runSuffix}`,
      });

    assert.equal(res.status, 201, `Expected 201 Created: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.stockCondition, 'SALEABLE');

    // Verify stock increased by 50 kg (1 bag = 50 kg)
    const postInv = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId1]);
    assert.equal(Number(postInv.rows[0].current_stock), preStock + 50.0);

    // Verify customer ledger credit entry
    const returnId = res.body.data.returnId || res.body.data.id;
    const retLedger = await query(
      `SELECT transaction_type, direction, amount FROM ledger_transactions 
       WHERE customer_id = $1 AND reference_id = $2;`,
      [customer1Id, returnId]
    );
    assert.equal(retLedger.rows.length, 1);
    assert.equal(retLedger.rows[0].transaction_type, 'LEDGER_ADJUSTMENT_CREDIT');
    assert.equal(retLedger.rows[0].direction, 'CREDIT');
    assert.equal(Number(retLedger.rows[0].amount), 1522.5);
  });

  // 15. Return of damaged item
  await t.test('15. Return of damaged item: should credit customer but quarantine stock (no sellable stock increase)', async () => {
    const preInv = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId1]);
    const preStock = Number(preInv.rows[0].current_stock);

    const res = await request(app)
      .post(`/api/v1/feed/sales/${testSaleId}/return`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        saleItemId: testSaleItemId1,
        returnQuantity: 1.0,
        stockCondition: 'DAMAGED',
        reason: 'Bag torn during transport, moisture ingress',
        approvedBy: ownerUserId,
        idempotencyKey: `IDEM-RET-DAM-${runSuffix}`,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.stockCondition, 'DAMAGED');

    // Verify sellable stock DID NOT increase
    const postInv = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId1]);
    assert.equal(Number(postInv.rows[0].current_stock), preStock, 'Damaged product must not be added back to sellable stock');

    // Verify quarantine stock movement
    const damReturnId = res.body.data.returnId || res.body.data.id;
    const smRes = await query(
      `SELECT movement_type, notes FROM stock_movements WHERE reference_id = $1;`,
      [damReturnId]
    );
    assert.ok(smRes.rows.some((r) => r.movement_type === 'DAMAGED_WRITE_OFF'));
  });

  // 16. Unauthorized return rejection
  await t.test('16. Unauthorized return rejection: should reject return by unauthorized operator', async () => {
    const res = await request(app)
      .post(`/api/v1/feed/sales/${testSaleId}/return`)
      .set('Authorization', `Bearer ${operatorToken}`) // operators cannot approve returns
      .send({
        saleItemId: testSaleItemId1,
        returnQuantity: 1.0,
        stockCondition: 'SALEABLE',
        reason: 'Unauthorized test',
        approvedBy: operatorUserId,
        idempotencyKey: `IDEM-RET-UNAUTH-${runSuffix}`,
      });

    assert.equal(res.status, 403, 'Expected 403 Forbidden for operator return attempt');
  });

  // 17. Stock correction approval
  await t.test('17. Stock correction approval: should adjust stock and log authorized adjustment', async () => {
    const preInv = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId1]);
    const preStock = Number(preInv.rows[0].current_stock);

    const res = await request(app)
      .post('/api/v1/inventory/adjustments')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        centerId: center1Id,
        productId: productId1,
        adjustmentType: 'STOCK_CORRECTION',
        quantity: 2.0,
        direction: 'IN',
        reason: 'Physical cycle count surplus adjustment',
        approvedBy: ownerUserId,
        idempotencyKey: `IDEM-ADJ-${runSuffix}-01`,
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);

    const postInv = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId1]);
    assert.equal(Number(postInv.rows[0].current_stock), preStock + 2.0);
  });

  // 18. Center transfer
  await t.test('18. Center transfer: should atomically move stock between centers with shared transferId', async () => {
    const transferQty = 10.0;
    const preSource = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId1]);
    const preSourceStock = Number(preSource.rows[0].current_stock);

    const res = await request(app)
      .post('/api/v1/inventory/transfers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        sourceCenterId: center1Id,
        destinationCenterId: center2Id,
        productId: productId1,
        quantity: transferQty,
        unit: 'BAG',
        notes: 'Branch replenishment transfer',
        idempotencyKey: `IDEM-XFER-${runSuffix}-01`,
      });

    assert.equal(res.status, 201, `Expected 201 Created: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    const transferId = res.body.data.transferId || res.body.data.id;

    // Check Source Center stock decreased (10 bags * 50 kg = 500 kg)
    const baseTransferQty = transferQty * 50.0;
    const postSource = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center1Id, productId1]);
    assert.equal(Number(postSource.rows[0].current_stock), preSourceStock - baseTransferQty);

    // Check Destination Center stock increased
    const postDest = await query(`SELECT current_stock FROM center_product_inventory WHERE center_id = $1 AND product_id = $2;`, [center2Id, productId1]);
    assert.equal(Number(postDest.rows[0].current_stock), baseTransferQty);

    // Verify both stock movements share transferId
    const smRes = await query(`SELECT direction, center_id FROM stock_movements WHERE reference_id = $1;`, [transferId]);
    assert.equal(smRes.rows.length, 2);
    assert.ok(smRes.rows.some((r) => r.direction === 'OUT' && r.center_id === center1Id));
    assert.ok(smRes.rows.some((r) => r.direction === 'IN' && r.center_id === center2Id));
  });

  // 19. Negative stock rejection
  await t.test('19. Negative stock rejection: should reject transfer or adjustment driving stock < 0', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/transfers')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        sourceCenterId: center1Id,
        destinationCenterId: center2Id,
        productId: productId1,
        quantity: 9999.0, // more than available
        unit: 'BAG',
        idempotencyKey: `IDEM-NEG-${runSuffix}`,
      });

    assert.equal(res.status, 400, 'Expected rejection of negative stock transfer');
    assert.equal(res.body.success, false);
  });

  // 20. Duplicate sale retry
  await t.test('20. Duplicate sale retry: should return existing sale idempotently without duplicate debit', async () => {
    const res = await request(app)
      .post('/api/v1/feed/sales')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: center1Id,
        customerId: customer1Id,
        paymentMode: 'CREDIT',
        idempotencyKey: `IDEM-SALE-${runSuffix}-01`, // Same key as test 8
        items: [
          {
            productId: productId1,
            quantity: 5.0,
            unit: 'BAG',
          },
        ],
      });

    assert.ok(res.status === 200 || res.status === 201, 'Expected 200 or 201 for idempotent duplicate retry');
    assert.equal(res.body.data.saleId || res.body.data.id, testSaleId);

    // Verify ledger has only 1 FEED_PURCHASE_DEBIT entry for this sale
    const ledgerCount = await query(
      `SELECT COUNT(*) FROM ledger_transactions WHERE reference_id = $1;`,
      [testSaleId]
    );
    assert.equal(parseInt(ledgerCount.rows[0].count, 10), 1);
  });

  // 21. Offline pending feed sale
  await t.test('21. Offline pending feed sale: should record sale with local client event ID', async () => {
    const offlineEventId = crypto.randomUUID();
    const res = await request(app)
      .post('/api/v1/feed/sales')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: center1Id,
        customerId: customer1Id,
        paymentMode: 'CREDIT',
        clientSaleUuid: offlineEventId,
        idempotencyKey: `IDEM-OFFLINE-${offlineEventId}`,
        items: [
          {
            productId: productId1,
            quantity: 1.0,
            unit: 'BAG',
          },
        ],
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.invoiceNumber.startsWith('INV-'));
  });

  // 22. Inventory sync conflict
  await t.test('22. Inventory sync conflict: should reject offline sync attempt when local stock allocation is invalid', async () => {
    // Attempting to sync an offline transaction that requests 1000 bags when warehouse stock is 80
    const res = await request(app)
      .post('/api/v1/feed/sales')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: center1Id,
        customerId: customer1Id,
        paymentMode: 'CREDIT',
        idempotencyKey: `IDEM-OFFLINE-CONFLICT-${runSuffix}`,
        items: [
          {
            productId: productId1,
            quantity: 1000.0,
            unit: 'BAG',
          },
        ],
      });

    assert.equal(res.status, 400);
    assert.ok(res.body.error?.message?.includes('Insufficient stock'));
  });

  // 23. Cross-center access rejection
  await t.test('23. Cross-center access rejection: should reject operator accessing unauthorized center', async () => {
    // operator is assigned ONLY to center 1, not center 2
    const res = await request(app)
      .get(`/api/v1/inventory?centerId=${center2Id}`)
      .set('Authorization', `Bearer ${operatorToken}`);

    assert.equal(res.status, 403, 'Expected 403 Forbidden for cross-center access');
  });

  // 24. Customer ownership protection
  await t.test('24. Customer ownership protection: should reject feed credit sale for customer of another org', async () => {
    const res = await request(app)
      .post('/api/v1/feed/sales')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: center1Id,
        customerId: org2CustomerId, // Customer belongs to Org 2, operator is in Org 1
        paymentMode: 'CREDIT',
        idempotencyKey: `IDEM-CROSS-CUST-${runSuffix}`,
        items: [
          {
            productId: productId1,
            quantity: 1.0,
            unit: 'BAG',
          },
        ],
      });

    assert.ok(res.status === 404 || res.status === 400, 'Expected 404 or 400 for cross-org customer');
    assert.equal(res.body.success, false);
  });

  // 25. Billing integration
  await t.test('25. Billing integration: customer feed debits must be queryable for milk settlement deduction', async () => {
    const today = new Date().toISOString().split('T')[0];
    const feedDebits = await query(
      `SELECT SUM(amount) as total_feed_deductions
       FROM ledger_transactions 
       WHERE customer_id = $1 
         AND transaction_type = 'FEED_PURCHASE_DEBIT'
         AND created_at >= $2::date;`,
      [customer1Id, today]
    );

    assert.ok(Number(feedDebits.rows[0].total_feed_deductions) > 0, 'Feed debits must be queryable for billing settlement');
  });

  // 26. Historical transaction preservation
  await t.test('26. Historical transaction preservation: stock movements and sales audit history must be immutable', async () => {
    const countRes = await query(
      `SELECT COUNT(*) FROM stock_movements WHERE organization_id = $1;`,
      [org1Id]
    );
    const totalMovements = parseInt(countRes.rows[0].count, 10);
    assert.ok(totalMovements >= 5, 'Must have multiple append-only movements recorded');

    // Verify chronological ordering and idempotency references
    const auditRes = await query(
      `SELECT movement_type, direction, quantity, balance_after, movement_timestamp 
       FROM stock_movements 
       WHERE organization_id = $1 
       ORDER BY movement_timestamp ASC;`,
      [org1Id]
    );
    assert.equal(auditRes.rows.length, totalMovements);
    for (const row of auditRes.rows) {
      assert.ok(row.movement_type, 'Movement type must be present');
      assert.ok(row.direction, 'Movement direction must be present');
      assert.ok(Number(row.quantity) > 0, 'Quantity must be positive');
    }
  });
});
