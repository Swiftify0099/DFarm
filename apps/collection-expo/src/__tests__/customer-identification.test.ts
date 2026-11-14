import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CustomerIdentificationService,
  CustomerRepository,
  FaceModelCalibrationConfig,
  CANONICAL_FACE_THRESHOLD,
} from '../domain/identification/CustomerIdentificationService';
import { Customer } from '../types';

test('Customer Identification Test Suite (Triple-Method & Fail-Safe Security)', async (t) => {
  const expectedCenterId = 'center_tasgaon_01';
  const expectedOrgId = 'org_sangli';

  const customers = new Map<string, Customer>();

  const c1: Customer = {
    id: 'c1-uuid-1234',
    organizationId: expectedOrgId,
    primaryCenterId: expectedCenterId,
    farmerCode: 'FARMER-001',
    fullName: 'Pandurang Patil',
    mobileNumber: '+919876543210',
    status: 'ACTIVE',
    permittedCategories: ['COW'],
    rfidCardId: 'RFID-1001',
  };

  const cSuspended: Customer = {
    id: 'c2-uuid-5678',
    organizationId: expectedOrgId,
    primaryCenterId: expectedCenterId,
    farmerCode: 'FARMER-002',
    fullName: 'Tanaji Ghorpade',
    mobileNumber: '+919876543211',
    status: 'SUSPENDED',
    permittedCategories: ['BUFFALO'],
    rfidCardId: 'RFID-1002',
  };

  const cDeleted: Customer = {
    id: 'c3-uuid-9999',
    organizationId: expectedOrgId,
    primaryCenterId: expectedCenterId,
    farmerCode: 'FARMER-003',
    fullName: 'Deepak Shinde',
    mobileNumber: '+919876543212',
    status: 'ACTIVE',
    permittedCategories: ['COW'],
    isDeleted: true,
  };

  const cWrongCenter: Customer = {
    id: 'c4-uuid-4444',
    organizationId: expectedOrgId,
    primaryCenterId: 'center_miraj_02',
    farmerCode: 'FARMER-004',
    fullName: 'Rahul Chavan',
    mobileNumber: '+919876543213',
    status: 'ACTIVE',
    permittedCategories: ['COW'],
  };

  customers.set(c1.id, c1);
  customers.set(cSuspended.id, cSuspended);
  customers.set(cDeleted.id, cDeleted);
  customers.set(cWrongCenter.id, cWrongCenter);

  const mockRepo: CustomerRepository = {
    findById: (id: string) => customers.get(id) || null,
    findByFarmerCode: (code: string) =>
      Array.from(customers.values()).find((c) => c.farmerCode === code) || null,
    findByRfid: (rfid: string) =>
      Array.from(customers.values()).find((c) => c.rfidCardId === rfid) || null,
    search: (q: string) =>
      Array.from(customers.values()).filter((c) => c.fullName.includes(q)),
  };

  const service = new CustomerIdentificationService(
    mockRepo,
    expectedCenterId,
    expectedOrgId,
    72,
    Date.now(),
    {
      modelVersion: 'MobileFaceNet-ArcFace-v1.0.0',
      preprocessingVersion: '112x112',
      threshold: CANONICAL_FACE_THRESHOLD,
      isCalibrationApproved: true,
      approvalStatus: 'APPROVED_FOR_TEST',
    }
  );

  await t.test('1. Face Identification: Success with high confidence score', async () => {
    const result = await service.identifyByFace(
      new Float32Array(128).fill(0.1),
      c1,
      0.94
    );
    assert.equal(result.type, 'SUCCESS');
    if (result.type === 'SUCCESS') {
      assert.equal(result.canonicalUuid, 'c1-uuid-1234');
      assert.equal(result.method, 'FACE');
    }
  });

  await t.test('2. Face Identification: Rejected when confidence below threshold (0.65 < 0.720)', async () => {
    const result = await service.identifyByFace(
      new Float32Array(128).fill(0.1),
      c1,
      0.65
    );
    assert.equal(result.type, 'FAILURE');
    if (result.type === 'FAILURE') {
      assert.equal(result.errorCode, 'FACE_MATCH_UNCERTAIN');
    }
  });

  await t.test('3. Face Identification: Fail-Safe active when calibration is unapproved (Production behavior)', async () => {
    const unapprovedService = new CustomerIdentificationService(
      mockRepo,
      expectedCenterId,
      expectedOrgId,
      72,
      Date.now(),
      {
        modelVersion: 'MobileFaceNet-ArcFace-v1.0.0',
        preprocessingVersion: '112x112',
        threshold: CANONICAL_FACE_THRESHOLD,
        isCalibrationApproved: false,
        approvalStatus: 'STAGING_UNVERIFIED',
      }
    );
    const result = await unapprovedService.identifyByFace(
      new Float32Array(128).fill(0.1),
      c1,
      0.95
    );
    assert.equal(result.type, 'FAILURE');
    if (result.type === 'FAILURE') {
      assert.equal(result.errorCode, 'CALIBRATION_NOT_APPROVED');
      assert.ok(result.reason.includes('Fail-safe fallback to RFID or Manual'));
    }
  });

  await t.test('4. RFID Identification: Success with active assigned card', async () => {
    const result = await service.identifyByRfid('RFID-1001');
    assert.equal(result.type, 'SUCCESS');
    if (result.type === 'SUCCESS') {
      assert.equal(result.canonicalUuid, 'c1-uuid-1234');
      assert.equal(result.method, 'RFID');
      assert.equal(result.customer.fullName, 'Pandurang Patil');
    }
  });

  await t.test('5. RFID Identification: Rejection when RFID is unknown', async () => {
    const result = await service.identifyByRfid('RFID-UNKNOWN-999');
    assert.equal(result.type, 'FAILURE');
    if (result.type === 'FAILURE') {
      assert.equal(result.errorCode, 'RFID_NOT_FOUND');
    }
  });

  await t.test('6. Supervisor Manual: Success with valid supervisor and justification', async () => {
    const result = await service.identifyBySupervisorManual(
      'FARMER-001',
      'sup_user_123',
      'Farmer forgot RFID card and camera has glare'
    );
    assert.equal(result.type, 'SUCCESS');
    if (result.type === 'SUCCESS') {
      assert.equal(result.canonicalUuid, 'c1-uuid-1234');
      assert.equal(result.method, 'SUPERVISOR_MANUAL');
    }
  });

  await t.test('7. Supervisor Manual: Rejected when justification < 5 chars', async () => {
    const result = await service.identifyBySupervisorManual(
      'FARMER-001',
      'sup_user_123',
      'bad'
    );
    assert.equal(result.type, 'FAILURE');
    if (result.type === 'FAILURE') {
      assert.equal(result.errorCode, 'SUPERVISOR_AUTH_REQUIRED');
    }
  });

  await t.test('8. Rejection of Suspended customer', async () => {
    const result = await service.identifyByRfid('RFID-1002');
    assert.equal(result.type, 'FAILURE');
    if (result.type === 'FAILURE') {
      assert.equal(result.errorCode, 'CUSTOMER_NOT_ACTIVE');
    }
  });

  await t.test('9. Rejection of Deleted customer', async () => {
    const result = await service.identifyBySupervisorManual(
      'FARMER-003',
      'sup_user_123',
      'Manual lookup for deleted farmer'
    );
    assert.equal(result.type, 'FAILURE');
    if (result.type === 'FAILURE') {
      assert.equal(result.errorCode, 'CUSTOMER_DELETED');
    }
  });

  await t.test('10. Rejection of Cross-Center customer', async () => {
    const result = await service.identifyBySupervisorManual(
      'FARMER-004',
      'sup_user_123',
      'Farmer visiting from Miraj'
    );
    assert.equal(result.type, 'FAILURE');
    if (result.type === 'FAILURE') {
      assert.equal(result.errorCode, 'CENTER_MISMATCH');
    }
  });

  await t.test('11. Rejection when offline policy unconfigured (maxOfflineHours = null)', async () => {
    const unconfigured = new CustomerIdentificationService(
      mockRepo,
      expectedCenterId,
      expectedOrgId,
      null // unapproved/null
    );
    const result = await unconfigured.identifyByRfid('RFID-1001');
    assert.equal(result.type, 'FAILURE');
    if (result.type === 'FAILURE') {
      assert.equal(result.errorCode, 'OFFLINE_POLICY_UNAPPROVED');
    }
  });

  await t.test('12. Canonical UUID consistency across Face, RFID and Supervisor Manual', async () => {
    const resRfid = await service.identifyByRfid('RFID-1001');
    const resSup = await service.identifyBySupervisorManual(
      'FARMER-001',
      'sup_user_123',
      'Audit manual identification'
    );
    const resFace = await service.identifyByFace(
      new Float32Array(128).fill(0.1),
      c1,
      0.95
    );

    assert.equal(resRfid.type, 'SUCCESS');
    assert.equal(resSup.type, 'SUCCESS');
    assert.equal(resFace.type, 'SUCCESS');

    if (resRfid.type === 'SUCCESS' && resSup.type === 'SUCCESS' && resFace.type === 'SUCCESS') {
      assert.equal(resRfid.canonicalUuid, 'c1-uuid-1234');
      assert.equal(resSup.canonicalUuid, 'c1-uuid-1234');
      assert.equal(resFace.canonicalUuid, 'c1-uuid-1234');
      assert.equal(resRfid.customer.id, resSup.customer.id);
      assert.equal(resSup.customer.id, resFace.customer.id);
    }
  });
});
