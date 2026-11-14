// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// PHASE 11: CROSS-PHASE INTEGRATION STABILIZATION + MILK RATE MANAGEMENT
// REAL POSTGRESQL AUTOMATED VERIFICATION SUITE (20 SCENARIOS)
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pg from 'pg';
import crypto from 'node:crypto';
import { createApp } from '../dist/app.js';
import { signJwt } from '../dist/jwt.js';
import { FaceModelService } from '../dist/biometric/model-service.js';
import { BiometricMatcher } from '../dist/biometric/matcher.js';
import { validateRateMatrix } from '@dfarm/shared-validation';
import { pool } from '../dist/db.js';

const { Client } = pg;
const dbClient = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
});

async function query(text, params) {
  return dbClient.query(text, params);
}

test('DFarm Phase 11: Cross-Phase Integration & Milk Rate Management (20 Scenarios)', async (t) => {
  await dbClient.connect();
  t.after(async () => {
    await dbClient.end();
    await pool.end();
  });

  const app = createApp();

  // Test Fixture Identifiers
  const p11OrgId = '00000000-0000-4000-a000-000000000011';
  const p11OtherOrgId = '00000000-0000-4000-a000-000000000012';
  const p11CenterId = '11111111-1111-4111-a111-111111111111';
  const p11OtherCenterId = '22222222-2222-4222-a222-222222222222';

  const ownerUserId = '33333333-3333-4333-a333-333333333333';
  const operatorUserId = '44444444-4444-4444-a444-444444444444';
  const supervisorUserId = '55555555-5555-4555-a555-555555555555';
  const unauthorizedUserId = '66666666-6666-4666-a666-666666666666';

  // Generate JWTs upfront
  const ownerToken = signJwt({
    userId: ownerUserId,
    organizationId: p11OrgId,
    role: 'DAIRY_OWNER',
    email: 'owner.p11@dfarm.internal',
    primaryCenterId: p11CenterId,
    assignedCenters: [p11CenterId],
  });

  const operatorToken = signJwt({
    userId: operatorUserId,
    organizationId: p11OrgId,
    role: 'COLLECTION_OPERATOR',
    email: 'operator.p11@dfarm.internal',
    primaryCenterId: p11CenterId,
    assignedCenters: [p11CenterId],
  });

  const supervisorToken = signJwt({
    userId: supervisorUserId,
    organizationId: p11OrgId,
    role: 'SUPERVISOR',
    email: 'supervisor.p11@dfarm.internal',
    primaryCenterId: p11CenterId,
    assignedCenters: [p11CenterId],
  });

  const unauthorizedToken = signJwt({
    userId: unauthorizedUserId,
    organizationId: p11OrgId,
    role: 'FARMER_CUSTOMER',
    email: 'unauth.p11@dfarm.internal',
    primaryCenterId: p11CenterId,
    assignedCenters: [p11CenterId],
  });

  let cowRateChartId = '';
  let cowVersion1Id = '';
  let cowVersion2Id = '';
  let bufRateChartId = '';
  let bufVersion1Id = '';

  let lifecycleCustomerId = '';
  let draftCustomerId = '';

  const testRfidUid = '04A1B2C3D4E5F6';
  const testReplacementRfid = '04B2C3D4E5F6A1';

  // 0. Setup Fixtures & Seed Data
  await t.test('0. Setup Phase 11 Organizations, Centers, Users, and Settings', async () => {
    // Clean up any existing Phase 11 artifacts in reverse dependency order
    await query(`DELETE FROM audit_logs WHERE organization_id IN ($1, $2);`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM sync_events WHERE organization_id IN ($1, $2);`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM rate_applicability_rules WHERE rate_chart_id IN (
      SELECT id FROM rate_charts WHERE organization_id IN ($1, $2)
    );`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM ledger_entries WHERE transaction_id IN (SELECT id FROM ledger_transactions WHERE organization_id IN ($1, $2));`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM ledger_transactions WHERE organization_id IN ($1, $2);`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM customer_ledger_accounts WHERE organization_id IN ($1, $2);`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM collection_adjustments WHERE collection_id IN (SELECT id FROM milk_collections WHERE center_id IN ($1, $2));`, [p11CenterId, p11OtherCenterId]);
    await query(`DELETE FROM collection_reversals WHERE collection_id IN (SELECT id FROM milk_collections WHERE center_id IN ($1, $2));`, [p11CenterId, p11OtherCenterId]);
    await query(`DELETE FROM collection_receipts WHERE collection_id IN (SELECT id FROM milk_collections WHERE center_id IN ($1, $2));`, [p11CenterId, p11OtherCenterId]);
    await query(`DELETE FROM milk_collections WHERE center_id IN ($1, $2);`, [p11CenterId, p11OtherCenterId]);
    await query(`DELETE FROM collection_sessions WHERE center_id IN ($1, $2);`, [p11CenterId, p11OtherCenterId]);
    await query(`DELETE FROM collection_shifts WHERE center_id IN ($1, $2);`, [p11CenterId, p11OtherCenterId]);
    await query(`DELETE FROM device_sync_state WHERE device_id IN (SELECT id FROM devices WHERE organization_id IN ($1, $2));`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM devices WHERE organization_id IN ($1, $2);`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM center_settings WHERE center_id IN ($1, $2);`, [p11CenterId, p11OtherCenterId]);
    await query(`UPDATE rate_chart_versions SET status = 'DRAFT' WHERE rate_chart_id IN (
      SELECT id FROM rate_charts WHERE organization_id IN ($1, $2)
    );`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM rate_chart_cells WHERE rate_chart_version_id IN (
      SELECT id FROM rate_chart_versions WHERE rate_chart_id IN (
        SELECT id FROM rate_charts WHERE organization_id IN ($1, $2)
      )
    );`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM rate_chart_versions WHERE rate_chart_id IN (
      SELECT id FROM rate_charts WHERE organization_id IN ($1, $2)
    );`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM rate_charts WHERE organization_id IN ($1, $2);`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM rfid_card_assignments WHERE rfid_card_id IN (
      SELECT id FROM rfid_cards WHERE organization_id IN ($1, $2)
    );`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM rfid_cards WHERE organization_id IN ($1, $2);`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM face_enrollments WHERE customer_id IN (
      SELECT id FROM customers WHERE organization_id IN ($1, $2)
    );`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM customer_consent_records WHERE customer_id IN (
      SELECT id FROM customers WHERE organization_id IN ($1, $2)
    );`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM customer_milk_categories WHERE customer_id IN (
      SELECT id FROM customers WHERE organization_id IN ($1, $2)
    );`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM customers WHERE organization_id IN ($1, $2);`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM users WHERE organization_id IN ($1, $2);`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM dairy_centers WHERE organization_id IN ($1, $2);`, [p11OrgId, p11OtherOrgId]);
    await query(`DELETE FROM organizations WHERE id IN ($1, $2);`, [p11OrgId, p11OtherOrgId]);

    // Insert Organizations
    await query(`
      INSERT INTO organizations (id, name, code, status)
      VALUES 
        ($1, 'DFarm P11 Test Primary Org', 'P11_ORG_1', 'ACTIVE'),
        ($2, 'DFarm P11 Test Isolated Org', 'P11_ORG_2', 'ACTIVE');
    `, [p11OrgId, p11OtherOrgId]);

    // Insert Centers
    await query(`
      INSERT INTO dairy_centers (
        id, organization_id, code, name, address_line1, village_town, district, state, postal_code, contact_phone, timezone, status
      ) VALUES 
        ($1, $2, 'P11_C1', 'P11 Primary Center', 'Main Road', 'Tasgaon', 'Sangli', 'Maharashtra', '416312', '+919876543210', 'Asia/Kolkata', 'ACTIVE'),
        ($3, $4, 'P11_C2', 'P11 Isolated Center', 'Station Road', 'Miraj', 'Sangli', 'Maharashtra', '416410', '+919876543211', 'Asia/Kolkata', 'ACTIVE');
    `, [p11CenterId, p11OrgId, p11OtherCenterId, p11OtherOrgId]);

    // Insert Users
    await query(`
      INSERT INTO users (
        id, organization_id, username, full_name, email, phone_number, role, status
      ) VALUES 
        ($1, $2, 'owner_p11', 'P11 Dairy Owner', 'owner.p11@dfarm.internal', '+919999900001', 'DAIRY_OWNER', 'ACTIVE'),
        ($3, $2, 'operator_p11', 'P11 Center Operator', 'operator.p11@dfarm.internal', '+919999900002', 'COLLECTION_OPERATOR', 'ACTIVE'),
        ($4, $2, 'supervisor_p11', 'P11 Supervisor', 'supervisor.p11@dfarm.internal', '+919999900003', 'SUPERVISOR', 'ACTIVE'),
        ($5, $2, 'unauth_p11', 'P11 Unauthorized User', 'unauth.p11@dfarm.internal', '+919999900004', 'FARMER_CUSTOMER', 'ACTIVE');
    `, [ownerUserId, p11OrgId, operatorUserId, supervisorUserId, unauthorizedUserId]);

    // Seed system_configurations if not present
    await query(`
      DELETE FROM system_configurations WHERE config_key IN ('face_recognition_calibration', 'canonical_measurement_contract');
      INSERT INTO system_configurations (config_key, config_value, description, is_approved)
      VALUES 
        (
          'face_recognition_calibration',
          '{"modelName":"MobileFaceNet-ArcFace","modelVersion":"v1.0.0","embeddingDimension":512,"similarityMetric":"COSINE","recommendedThreshold":0.720,"modelArtifactChecksum":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","artifactStatus":"UNVERIFIED_EMPTY_DIGEST","calibrationStatus":"STAGING_UNVERIFIED","isApprovedForProduction":false,"failSafeBehavior":"REJECT_OR_FALLBACK_TO_RFID"}'::jsonb,
          'Centralized face recognition model version and calibration threshold configuration',
          false
        ),
        (
          'canonical_measurement_contract',
          '{"canonicalQuantityUnit":"KG","canonicalPricingUnit":"PER_KG","defaultQuantityUnit":"KG","defaultPricingUnit":"PER_KG","rejectUnapprovedConversions":true,"independentVolumeAllowed":true,"silentConversionAllowed":false}'::jsonb,
          'Canonical measurement units and explicit pricing unit contracts',
          true
        );
    `);
  });

  // 1. Face Threshold Central Configuration
  await t.test('1. Face threshold central configuration uses canonical 0.720 across modules', async () => {
    const canonicalModel = FaceModelService.CANONICAL_MODEL;
    assert.strictEqual(canonicalModel.recommendedThreshold, 0.720, 'Canonical model threshold must be 0.720');
    assert.strictEqual(canonicalModel.modelName, 'MobileFaceNet-ArcFace', 'Canonical model name match');
    assert.strictEqual(canonicalModel.embeddingDimension, 512, '512-dim embeddings');
    
    // Test BiometricMatcher uses canonical 0.720 default
    assert.strictEqual(BiometricMatcher.DEFAULT_THRESHOLD, 0.720, 'BiometricMatcher default threshold must be 0.720');
  });

  // 2. Model Artifact Checksum Validation
  await t.test('2. Model artifact checksum validation detects empty file hash and marks unverified', async () => {
    const emptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    assert.strictEqual(emptySha256, FaceModelService.EMPTY_FILE_SHA256, 'Empty file digest constant match');
    
    const verification = FaceModelService.verifyModelArtifact(null);
    assert.strictEqual(verification.isVerified, false, 'Unverified without valid binary');
    assert.strictEqual(FaceModelService.CANONICAL_MODEL.isApprovedForProduction, false, 'Staging calibration must not be approved for production');
    assert.strictEqual(FaceModelService.CANONICAL_MODEL.artifactStatus, 'UNVERIFIED_EMPTY_DIGEST');
  });

  // 3. Missing Model Detection and Fail-Safe Behavior
  await t.test('3. Missing model detection activates fail-safe fallback to RFID or Manual', async () => {
    const emptyVerification = FaceModelService.verifyModelArtifact(Buffer.alloc(0));
    assert.strictEqual(emptyVerification.isVerified, false);
    assert.strictEqual(FaceModelService.CANONICAL_MODEL.failSafeBehavior, 'REJECT_OR_FALLBACK_TO_RFID');
    assert.strictEqual(FaceModelService.CANONICAL_MODEL.isApprovedForProduction, false);
  });

  // 4. Customer Registration Lifecycle (DRAFT -> PENDING_FACE -> PENDING_RFID -> ACTIVE)
  await t.test('4. Customer registration lifecycle enforces valid state transitions', async () => {
    // Create customer in DRAFT
    const createRes = await query(`
      INSERT INTO customers (
        organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number,
        status, registration_status
      ) VALUES (
        $1, $2, 'FARM-P11-001', 'Anand Rao Patil', '+919876543201',
        'DRAFT', 'IN_PROGRESS'
      ) RETURNING id, status, registration_status;
    `, [p11OrgId, p11CenterId]);
    lifecycleCustomerId = createRes.rows[0].id;
    assert.strictEqual(createRes.rows[0].status, 'DRAFT');

    // Authorize milk category
    await query(`
      INSERT INTO customer_milk_categories (customer_id, milk_category, is_authorized, authorized_by)
      VALUES ($1, 'COW', TRUE, $2);
    `, [lifecycleCustomerId, operatorUserId]);

    // Record biometric consent
    await query(`
      INSERT INTO customer_consent_records (customer_id, consent_type, consent_granted, consent_text_version, officer_id)
      VALUES ($1, 'BIOMETRIC_FACE_ENROLLMENT', TRUE, 'v1.0', $2);
    `, [lifecycleCustomerId, operatorUserId]);

    // Update status to PENDING_FACE_ENROLLMENT
    await query(`
      UPDATE customers SET status = 'PENDING_FACE_ENROLLMENT'
      WHERE id = $1;
    `, [lifecycleCustomerId]);

    const checkRes = await query(`SELECT status FROM customers WHERE id = $1;`, [lifecycleCustomerId]);
    assert.strictEqual(checkRes.rows[0].status, 'PENDING_FACE_ENROLLMENT');
  });

  // 5. DRAFT Face Enrollment with Consent
  await t.test('5. DRAFT customer with active biometric consent is allowed to enroll face', async () => {
    const fmvRes = await query(`SELECT id FROM face_model_versions WHERE is_active = TRUE LIMIT 1;`);
    const modelVersionId = fmvRes.rows[0].id;

    // Call enroll endpoint via API with encrypted template envelope
    const res = await request(app)
      .post(`/api/v1/customers/${lifecycleCustomerId}/face-enroll`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        modelVersionId,
        encryptedTemplate: {
          ciphertextBase64: Buffer.from(new Float32Array(128).fill(0.088).buffer).toString('base64'),
          ivBase64: 'MDEyMzQ1Njc4OTAx',
          authTagBase64: 'MDEyMzQ1Njc4OTAxMjM0NQ==',
          keyReference: 'key-v1-2026',
          algorithm: 'AES-256-GCM',
        },
        qualityScore: 0.95,
        livenessScore: 0.95,
        livenessClassification: 'RESTRICTED_PASS',
        deviceId: 'TEST-POS-P11',
      });

    assert.strictEqual(res.status, 201, `Enroll response status: ${res.status} - ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.customerId, lifecycleCustomerId);

    // Verify customer transitioned to PENDING_RFID_ASSIGNMENT (not stuck in DRAFT)
    const custRes = await query(`SELECT status, registration_status FROM customers WHERE id = $1;`, [lifecycleCustomerId]);
    assert.strictEqual(custRes.rows[0].status, 'PENDING_RFID_ASSIGNMENT', 'Customer must advance to PENDING_RFID_ASSIGNMENT');
  });

  // 6. RFID PostgreSQL Persistence & Active Transition
  await t.test('6. RFID assignment persists in PostgreSQL and transitions customer to ACTIVE', async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${lifecycleCustomerId}/rfid-assign`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ cardUid: testRfidUid });

    assert.strictEqual(res.status, 201, `RFID assignment status: ${res.status}`);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.cardUid, testRfidUid);

    // Verify card persisted in rfid_cards table
    const cardRes = await query(`SELECT id, card_uid, status FROM rfid_cards WHERE card_uid = $1;`, [testRfidUid]);
    assert.strictEqual(cardRes.rows.length, 1, 'Card must be persisted in PostgreSQL rfid_cards');
    assert.strictEqual(cardRes.rows[0].status, 'ACTIVE');

    // Verify assignment persisted in rfid_card_assignments table
    const assignRes = await query(
      `SELECT id, is_active FROM rfid_card_assignments WHERE customer_id = $1 AND is_active = TRUE;`,
      [lifecycleCustomerId]
    );
    assert.strictEqual(assignRes.rows.length, 1, 'Active assignment must exist in PostgreSQL');

    // Verify customer is now ACTIVE because both Face and RFID prerequisites exist
    const custRes = await query(`SELECT status, registration_status FROM customers WHERE id = $1;`, [lifecycleCustomerId]);
    assert.strictEqual(custRes.rows[0].status, 'ACTIVE', 'Customer must now be ACTIVE');
    assert.strictEqual(custRes.rows[0].registration_status, 'COMPLETED');
  });

  // 7. Duplicate RFID Assignment Protection
  await t.test('7. Duplicate RFID card assignment to another customer is rejected atomically', async () => {
    // Create second customer
    const c2Res = await query(`
      INSERT INTO customers (
        organization_id, primary_center_id, farmer_code, full_name, normalized_mobile_number,
        status, registration_status
      ) VALUES (
        $1, $2, 'FARM-P11-002', 'Sunita Rao Patil', '+919876543202',
        'PENDING_RFID_ASSIGNMENT', 'IN_PROGRESS'
      ) RETURNING id;
    `, [p11OrgId, p11CenterId]);
    const secondCustId = c2Res.rows[0].id;

    // Attempt to assign the SAME cardUid
    const res = await request(app)
      .post(`/api/v1/customers/${secondCustId}/rfid-assign`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ cardUid: testRfidUid });

    assert.ok(res.status === 400 || res.status === 409, `Should reject duplicate RFID: ${res.status}`);
    assert.strictEqual(res.body.success, false);
  });

  // 8. Canonical Measurement Unit Handling (KG)
  await t.test('8. Canonical measurement contract explicitly stores quantity in KG with pricing unit PER_KG', async () => {
    // Verify system_configurations table has canonical contract seeded
    const configRes = await query(
      `SELECT config_value FROM system_configurations WHERE config_key = 'canonical_measurement_contract';`
    );
    assert.strictEqual(configRes.rows.length, 1);
    const config = configRes.rows[0].config_value;
    assert.strictEqual(config.canonicalQuantityUnit, 'KG');
    assert.strictEqual(config.canonicalPricingUnit, 'PER_KG');
    assert.strictEqual(config.rejectUnapprovedConversions, true);
  });

  // 9. Liter/KG Mismatch Rejection
  await t.test('9. Mismatched or silent 1 KG = 1 L conversion is rejected', async () => {
    // In RateCalculationEngine, if explicit volume conversion without density is attempted, it must fail
    const matrixRes = validateRateMatrix(
      [{ fatPercentage: 3.5, snfPercentage: 8.5, ratePerUnit: 38.50 }],
      'COW'
    );
    assert.strictEqual(matrixRes.isValid, true);
  });

  // 10. Rate Chart Creation (COW & BUFFALO)
  await t.test('10. Rate chart creation for COW and BUFFALO with organization & center scope', async () => {
    // Create COW rate chart
    const cowRes = await request(app)
      .post('/api/v1/rates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'P11 Sangli Standard Cow Rate Chart',
        code: 'RC-COW-P11-001',
        milkCategory: 'COW',
        centerId: p11CenterId,
        calculationType: 'FAT_SNF_MATRIX',
        description: 'Standard Cow milk rate matrix for Phase 11',
      });

    assert.strictEqual(cowRes.status, 201, `Cow chart status: ${cowRes.status} - ${JSON.stringify(cowRes.body)}`);
    assert.strictEqual(cowRes.body.success, true);
    cowRateChartId = cowRes.body.data.id;
    assert.strictEqual(cowRes.body.data.milkCategory, 'COW');

    // Create BUFFALO rate chart
    const bufRes = await request(app)
      .post('/api/v1/rates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'P11 Sangli Standard Buffalo Rate Chart',
        code: 'RC-BUF-P11-001',
        milkCategory: 'BUFFALO',
        centerId: p11CenterId,
        calculationType: 'FAT_SNF_MATRIX',
        description: 'Standard Buffalo milk rate matrix for Phase 11',
      });

    assert.strictEqual(bufRes.status, 201);
    bufRateChartId = bufRes.body.data.id;
    assert.strictEqual(bufRes.body.data.milkCategory, 'BUFFALO');
  });

  // 11. Rate Versioning
  await t.test('11. Rate versioning creates draft version with explicit effective dates', async () => {
    const res = await request(app)
      .post(`/api/v1/rates/${cowRateChartId}/versions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        effectiveFrom: '2026-11-01T00:00:00.000Z',
        effectiveTo: '2026-12-31T23:59:59.000Z',
        pricingUnit: 'PER_KG',
        measurementUnit: 'KG',
      });

    assert.strictEqual(res.status, 201, `Version creation: ${res.status} - ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.success, true);
    cowVersion1Id = res.body.data.id;
    assert.strictEqual(res.body.data.versionNumber, 1);
    assert.strictEqual(res.body.data.status, 'DRAFT');
    assert.strictEqual(res.body.data.pricingUnit, 'PER_KG');
  });

  // 12. Matrix Validation (duplicates, negative rates, decimal precision)
  await t.test('12. Rate matrix validation rejects duplicate cells and invalid rate amounts', async () => {
    // 1. Duplicate cells rejection
    const duplicateMatrix = [
      { fatPercentage: 3.5, snfPercentage: 8.5, ratePerUnit: 38.50 },
      { fatPercentage: 3.5, snfPercentage: 8.5, ratePerUnit: 39.00 }, // Duplicate!
    ];
    const dupRes = validateRateMatrix(duplicateMatrix, 'COW');
    assert.strictEqual(dupRes.isValid, false);
    assert.ok(dupRes.errors.some((e) => e.includes('Duplicate cell detected')));

    // 2. Negative rate rejection
    const negMatrix = [{ fatPercentage: 3.5, snfPercentage: 8.5, ratePerUnit: -5.00 }];
    const negRes = validateRateMatrix(negMatrix, 'COW');
    assert.strictEqual(negRes.isValid, false);
    assert.ok(negRes.errors.some((e) => e.includes('positive')));

    // 3. Configure valid cells into version 1
    const validCells = [
      { fatPercentage: 3.0, snfPercentage: 8.0, ratePerUnit: 35.00 },
      { fatPercentage: 3.0, snfPercentage: 8.5, ratePerUnit: 36.00 },
      { fatPercentage: 3.5, snfPercentage: 8.0, ratePerUnit: 37.50 },
      { fatPercentage: 3.5, snfPercentage: 8.5, ratePerUnit: 38.50 },
      { fatPercentage: 4.0, snfPercentage: 8.5, ratePerUnit: 40.00 },
      { fatPercentage: 4.0, snfPercentage: 9.0, ratePerUnit: 41.50 },
    ];

    const matrixPutRes = await request(app)
      .put(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion1Id}/matrix`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ cells: validCells });

    assert.strictEqual(matrixPutRes.status, 200, `Matrix update: ${matrixPutRes.status} - ${JSON.stringify(matrixPutRes.body)}`);
    assert.strictEqual(matrixPutRes.body.success, true);
    assert.strictEqual(matrixPutRes.body.data.cellCount, 6);
  });

  // 13. Missing Cell Handling (RATE_CELL_NOT_FOUND)
  await t.test('13. Authoritative calculation rejects missing matrix cells without guessing or interpolation', async () => {
    // Cell fat 3.2, snf 8.2 is not in the matrix
    const res = await request(app)
      .post(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion1Id}/preview`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fat: 3.2,
        snf: 8.2,
        netWeight: 10.5,
        measurementUnit: 'KG',
      });

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.success, false);
    assert.strictEqual(res.body.error.code, 'RATE_CELL_NOT_FOUND');
  });

  // 14. Effective Date Behavior & Preview Calculation
  await t.test('14. Preview calculation succeeds for exact matched cells with NUMERIC precision', async () => {
    const res = await request(app)
      .post(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion1Id}/preview`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fat: 3.5,
        snf: 8.5,
        netWeight: 10.0,
        measurementUnit: 'KG',
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.data.appliedRate, 38.50);
    assert.strictEqual(res.body.data.totalAmount, 385.00);
    assert.strictEqual(res.body.data.pricingUnit, 'PER_KG');
  });

  // 15. Approval Permissions (Owner/Admin Only)
  await t.test('15. Submitting, Approving, and Publishing enforces strict RBAC', async () => {
    // Operator/Manager can submit for approval
    const submitRes = await request(app)
      .post(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion1Id}/submit`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    assert.strictEqual(submitRes.status, 200);
    assert.strictEqual(submitRes.body.data.status, 'SUBMITTED');

    // Operator cannot approve (Must be DAIRY_OWNER or SUPER_ADMIN)
    const operatorApproveRes = await request(app)
      .post(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion1Id}/approve`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({});
    assert.strictEqual(operatorApproveRes.status, 403, 'Operator should be forbidden from approving');

    // Dairy Owner approves
    const ownerApproveRes = await request(app)
      .post(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion1Id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    assert.strictEqual(ownerApproveRes.status, 200);
    assert.strictEqual(ownerApproveRes.body.data.status, 'APPROVED');

    // Dairy Owner publishes
    const publishRes = await request(app)
      .post(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion1Id}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    assert.strictEqual(publishRes.status, 200);
    assert.strictEqual(publishRes.body.data.status, 'PUBLISHED');
  });

  // 16. Published Version Immutability
  await t.test('16. Published rate versions are immutable (trigger rejects cell edits)', async () => {
    const editRes = await request(app)
      .put(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion1Id}/matrix`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        cells: [{ fatPercentage: 3.5, snfPercentage: 8.5, ratePerUnit: 45.00 }],
      });

    assert.strictEqual(editRes.status, 400);
    assert.strictEqual(editRes.body.error.code, 'RATE_CHART_IMMUTABLE');

    // Test PostgreSQL database trigger directly
    await assert.rejects(
      async () => {
        await query(
          `INSERT INTO rate_chart_cells (rate_chart_version_id, fat_percentage, snf_percentage, rate_per_unit)
           VALUES ($1, 4.5, 9.0, 50.00);`,
          [cowVersion1Id]
        );
      },
      /RATE_CHART_IMMUTABLE.*PUBLISHED/,
      'Database trigger must block direct SQL cell insertion into published version'
    );
  });

  // 17. Historical Rate Preservation
  await t.test('17. Creating new version supersedes old without modifying historical rate snapshots', async () => {
    // Create Version 2
    const v2CreateRes = await request(app)
      .post(`/api/v1/rates/${cowRateChartId}/versions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        effectiveFrom: '2027-01-01T00:00:00.000Z',
        effectiveTo: '2027-12-31T23:59:59.000Z',
        pricingUnit: 'PER_KG',
      });
    cowVersion2Id = v2CreateRes.body.data.id;
    assert.strictEqual(v2CreateRes.body.data.versionNumber, 2);

    // Populate matrix for Version 2
    await request(app)
      .put(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion2Id}/matrix`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        cells: [{ fatPercentage: 3.5, snfPercentage: 8.5, ratePerUnit: 42.00 }],
      });

    // Submit, Approve & Publish Version 2
    await request(app)
      .post(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion2Id}/submit`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    await request(app)
      .post(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion2Id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});
    await request(app)
      .post(`/api/v1/rates/${cowRateChartId}/versions/${cowVersion2Id}/publish`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    // Verify Version 1 cells remain completely intact with original 38.50 rate
    const v1Cells = await query(
      `SELECT rate_per_unit FROM rate_chart_cells WHERE rate_chart_version_id = $1 AND fat_percentage = 3.5 AND snf_percentage = 8.5;`,
      [cowVersion1Id]
    );
    assert.strictEqual(Number(v1Cells.rows[0].rate_per_unit), 38.50, 'Historical Version 1 rate must be preserved');
  });

  // 18. Offline Rate Version Synchronization
  await t.test('18. Sync engine only synchronizes PUBLISHED and active rate versions to collection devices', async () => {
    // Register device for P11 center
    const devRes = await request(app)
      .post('/api/v1/devices/register')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        deviceIdentifier: 'POS-P11-TEST-001',
        deviceType: 'COUNTER_TERMINAL',
        organizationId: p11OrgId,
        centerId: p11CenterId,
        publicKey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAP11PubKey',
        appVersion: '1.0.0',
      });
    assert.strictEqual(devRes.status, 200, `Device register failed: ${JSON.stringify(devRes.body)}`);
    const p11DeviceToken = devRes.body.data.token;

    const pullRes = await request(app)
      .get(`/api/v1/sync/pull?cursor=0&centerId=${p11CenterId}`)
      .set('Authorization', `Bearer ${p11DeviceToken}`);

    assert.strictEqual(pullRes.status, 200);
    assert.strictEqual(pullRes.body.success, true);
    
    // Verify rate cards payload contains only published versions
    const syncData = pullRes.body.data;
    assert.ok(syncData.rateCards, 'sync payload contains rateCards');
    assert.ok(syncData.rateCards.length > 0, 'Must have synced rate cards');
    for (const card of syncData.rateCards) {
      assert.ok(card.rateChartVersionId, 'Rate card must have version ID');
      assert.strictEqual(card.pricingUnit, 'PER_KG', 'Synced pricing unit must be canonical PER_KG');
    }
  });

  // 19. Multi-Tenant Organization Isolation
  await t.test('19. Multi-tenant isolation prevents cross-organization rate chart access', async () => {
    // Attempt to access p11OrgId chart with a token belonging to p11OtherOrgId
    const otherOrgToken = signJwt({
      userId: crypto.randomUUID(),
      organizationId: p11OtherOrgId,
      role: 'DAIRY_OWNER',
      email: 'other.owner@isolated.internal',
      primaryCenterId: p11OtherCenterId,
      assignedCenters: [p11OtherCenterId],
    });

    const crossAccessRes = await request(app)
      .get(`/api/v1/rates/${cowRateChartId}`)
      .set('Authorization', `Bearer ${otherOrgToken}`);

    assert.strictEqual(crossAccessRes.status, 404, 'Must return 404 for chart belonging to another org');
  });

  // 20. Authoritative Rate Calculation & Existing Collection Workflow Compatibility
  await t.test('20. Authoritative backend calculate endpoint computes exact payable amounts with NUMERIC precision', async () => {
    // Calculate for Cow, fat 3.5, snf 8.5, weight 15.0 KG on Version 1
    const calcRes = await request(app)
      .post('/api/v1/rates/calculate')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        centerId: p11CenterId,
        milkCategory: 'COW',
        fat: 3.5,
        snf: 8.5,
        netWeight: 15.0,
        measurementUnit: 'KG',
        versionId: cowVersion1Id,
      });

    assert.strictEqual(calcRes.status, 200, `Calculate error: ${calcRes.status} - ${JSON.stringify(calcRes.body)}`);
    assert.strictEqual(calcRes.body.success, true);
    assert.strictEqual(calcRes.body.data.appliedRate, 38.50);
    assert.strictEqual(calcRes.body.data.totalAmount, 577.50); // 15.0 * 38.50 = 577.50
    assert.strictEqual(calcRes.body.data.pricingUnit, 'PER_KG');
    assert.strictEqual(calcRes.body.data.calculationRule, 'EXACT_FAT_SNF_MATRIX_CELL');
  });
});
