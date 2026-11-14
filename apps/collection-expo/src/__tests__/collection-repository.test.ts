import test from 'node:test';
import assert from 'node:assert/strict';
import { CollectionRepository } from '../domain/repository/CollectionRepository';
import { CollectionApiClient } from '../api/client';
import { InMemorySessionManager } from '../storage/SessionManager';
import { InMemoryCollectionDatabase } from '../database/CollectionDatabase';
import { Customer, CachedCustomer, CachedRateCell, OfficerProfile } from '../types';

test('Collection Repository Online & Offline Lifecycle Test Suite', async (t) => {
  let sessionManager: InMemorySessionManager;
  let database: InMemoryCollectionDatabase;
  let mockApiClient: CollectionApiClient;
  let repository: CollectionRepository;

  sessionManager = new InMemorySessionManager();
  database = new InMemoryCollectionDatabase();
  mockApiClient = new CollectionApiClient(sessionManager);

  repository = new CollectionRepository(
    mockApiClient,
    sessionManager,
    database
  );

  await t.test('1. Login success and session persistence', async () => {
    const mockOfficer: OfficerProfile = {
      id: 'officer-uuid-001',
      email: 'ramesh@dfarm.local',
      fullName: 'Ramesh Patil',
      role: 'COLLECTION_OFFICER',
      organizationId: 'org-sangli-01',
      centerId: 'center-tasgaon-01',
      assignedCenters: [
        {
          centerId: 'center-tasgaon-01',
          centerName: 'Tasgaon Center',
          centerCode: 'TAS01',
        },
      ],
    };

    // Override apiClient.login for mock test
    (mockApiClient as any).login = async () => ({
      success: true,
      token: 'test-jwt-token-xyz',
      officer: mockOfficer,
    });

    const result = await repository.login('ramesh@dfarm.local', 'securePass123');
    assert.equal(result.success, true);
    assert.equal(result.officer?.fullName, 'Ramesh Patil');

    const isLoggedIn = await sessionManager.isLoggedIn();
    assert.equal(isLoggedIn, true);
    const token = await sessionManager.getToken();
    assert.equal(token, 'test-jwt-token-xyz');
    const centerId = await sessionManager.getActiveCenterId();
    assert.equal(centerId, 'center-tasgaon-01');
    const centerName = await sessionManager.getActiveCenterName();
    assert.equal(centerName, 'Tasgaon Center');
  });

  await t.test('2. Face recognition fail-safe rejection (STAGING_UNVERIFIED)', async () => {
    const result = await repository.identifyByFace();
    assert.equal(result.type, 'FAILURE');
    if (result.type === 'FAILURE') {
      assert.equal(result.errorCode, 'CALIBRATION_NOT_APPROVED');
      assert.ok(result.reason.includes('STAGING_UNVERIFIED'));
    }
  });

  await t.test('3. RFID identification online success', async () => {
    (mockApiClient as any).identifyByRfid = async () => ({
      success: true,
      data: {
        success: true,
        customerUuid: 'cust-uuid-patil-001',
        method: 'RFID',
        customer: {
          id: 'cust-uuid-patil-001',
          fullName: 'Pandurang Patil',
          farmerCode: 'FARMER-001',
          status: 'ACTIVE',
          permittedCategories: ['COW', 'BUFFALO'],
        },
      },
    });

    const result = await repository.identifyByRfid('E28011606000020475E8D354');
    assert.equal(result.type, 'SUCCESS');
    if (result.type === 'SUCCESS') {
      assert.equal(result.canonicalUuid, 'cust-uuid-patil-001');
      assert.equal(result.customer.fullName, 'Pandurang Patil');
      assert.equal(result.customer.farmerCode, 'FARMER-001');
      assert.equal(result.method, 'RFID');
      assert.equal(result.customer.permittedCategories.length, 2);
    }
  });

  await t.test('4. RFID identification offline fallback to SQLite cache', async () => {
    // Clear session so it falls back to offline
    await sessionManager.clearSession();

    const cached: CachedCustomer = {
      customerId: 'cust-offline-uuid-002',
      farmerCode: 'FARMER-002',
      fullName: 'Tanaji Ghorpade',
      primaryCenterId: 'center_default',
      mobileNumber: '+919876543211',
      status: 'ACTIVE',
      isDeleted: false,
      isRevoked: false,
      version: 1,
      updatedAt: Date.now(),
      permittedCategories: ['BUFFALO'],
      rfidCardId: 'E28011606000020475E8D999',
    };
    await database.saveCustomer(cached);

    const result = await repository.identifyByRfid('E28011606000020475E8D999');
    assert.equal(result.type, 'SUCCESS');
    if (result.type === 'SUCCESS') {
      assert.equal(result.canonicalUuid, 'cust-offline-uuid-002');
      assert.equal(result.customer.fullName, 'Tanaji Ghorpade');
      assert.deepEqual(result.customer.permittedCategories, ['BUFFALO']);
    }
  });

  await t.test('5. RFID identification not found error', async () => {
    const result = await repository.identifyByRfid('UNKNOWN-CARD-12345');
    assert.equal(result.type, 'FAILURE');
    if (result.type === 'FAILURE') {
      assert.equal(result.errorCode, 'RFID_NOT_FOUND');
    }
  });

  await t.test('6. Supervisor manual verification rejects short justification', async () => {
    const result = await repository.verifyBySupervisor('cust-1', 'OTHER', 'no');
    assert.equal(result.type, 'FAILURE');
    if (result.type === 'FAILURE') {
      assert.equal(result.errorCode, 'SUPERVISOR_AUTH_REQUIRED');
    }
  });

  await t.test('7. Supervisor manual verification online success', async () => {
    await sessionManager.saveSession('dummy-token', {
      id: 'sup-1',
      email: 'sup@dfarm.local',
      fullName: 'Supervisor Ramesh',
      role: 'SUPERVISOR',
      organizationId: 'org-1',
      centerId: 'center-tasgaon-01',
      assignedCenters: [],
    });

    (mockApiClient as any).verifyBySupervisor = async () => ({
      success: true,
      data: {
        success: true,
        customerUuid: 'cust-uuid-manual-003',
        method: 'SUPERVISOR_MANUAL',
        customer: {
          id: 'cust-uuid-manual-003',
          fullName: 'Deepak Shinde',
          farmerCode: 'FARMER-003',
          status: 'ACTIVE',
          permittedCategories: ['COW'],
        },
      },
    });

    const result = await repository.verifyBySupervisor(
      'cust-uuid-manual-003',
      'CAMERA_FAILURE',
      'Customer forgot RFID card and camera unverified'
    );
    assert.equal(result.type, 'SUCCESS');
    if (result.type === 'SUCCESS') {
      assert.equal(result.canonicalUuid, 'cust-uuid-manual-003');
      assert.equal(result.customer.fullName, 'Deepak Shinde');
      assert.equal(result.method, 'SUPERVISOR_MANUAL');
    }
  });

  await t.test('8. Rate calculation online authoritative', async () => {
    (mockApiClient as any).calculateRate = async () => ({
      success: true,
      data: {
        rateVersionId: 'rv-cow-2026',
        rateVersionNumber: 2,
        rateChartId: 'rc-standard-cow',
        appliedRate: 44.5,
        quantity: 25.5,
        totalAmount: 1134.75,
        calculationRule: 'MATRIX_EXACT_MATCH',
        roundingMode: 'HALF_EVEN_2_DECIMALS',
      },
    });

    const rateResult = await repository.calculateRate('COW', 4.5, 8.8, 25.5);
    assert.equal(rateResult.success, true);
    assert.equal(rateResult.result?.appliedRate, 44.5);
    assert.equal(rateResult.result?.quantity, 25.5);
    assert.equal(rateResult.result?.totalAmount, 1134.75);
    assert.equal(rateResult.result?.calculationRule, 'MATRIX_EXACT_MATCH');
  });

  await t.test('9. Rate calculation offline fallback', async () => {
    await sessionManager.clearSession();

    const cell: CachedRateCell = {
      id: 'rate_cell_1',
      rateChartVersionId: 'v1',
      fatPercentage: 4.5,
      snfPercentage: 8.8,
      ratePerUnit: 42.0,
      updatedAt: Date.now(),
    };
    await database.saveRateCell(cell);

    const rateResult = await repository.calculateRate('COW', 4.5, 8.8, 20.0);
    assert.equal(rateResult.success, true);
    assert.equal(rateResult.result?.appliedRate, 42.0);
    assert.equal(rateResult.result?.totalAmount, 840.0);
  });

  await t.test('10. Commit milk collection online atomic', async () => {
    await sessionManager.saveSession('dummy-token', {
      id: 'off-1',
      email: 'op@dfarm.local',
      fullName: 'Ramesh Patil',
      role: 'OFFICER',
      organizationId: 'org-1',
      centerId: 'center-tasgaon-01',
      assignedCenters: [],
    });

    const customer: Customer = {
      id: 'cust-uuid-001',
      organizationId: 'org-1',
      primaryCenterId: 'center-tasgaon-01',
      farmerCode: 'FARMER-001',
      fullName: 'Pandurang Patil',
      mobileNumber: '+919876543210',
      status: 'ACTIVE',
      permittedCategories: ['COW'],
    };

    (mockApiClient as any).createSession = async () => ({
      success: true,
      data: {
        sessionId: 'session-uuid-111',
        centerId: 'center-tasgaon-01',
        customerId: 'cust-uuid-001',
        selectedMilkCategory: 'COW',
        identificationMethod: 'RFID',
        sessionState: 'INITIALIZED',
      },
    });

    (mockApiClient as any).completeSession = async () => ({
      success: true,
      data: {
        status: 'COMPLETED',
        session: { id: 'session-uuid-111', session_state: 'COMPLETED' },
        collection: { id: 'col-uuid-222', total_amount: 1134.75 },
        ledger: { previousBalance: 0.0, newBalance: 1134.75 },
        receipt: { receiptNumber: 'RCP-20261114-001' },
      },
    });

    (mockApiClient as any).getReceiptText = async () => ({
      success: true,
      data: {
        receiptText: 'DFARM MILK COLLECTION RECEIPT\nReceipt: RCP-20261114-001\nTotal: INR 1134.75',
      },
    });

    const commitResult = await repository.commitMilkCollection({
      customer,
      category: 'COW',
      method: 'RFID',
      shift: 'MORNING',
      businessDate: '2026-11-14',
      netWeight: 25.5,
      fat: 4.5,
      snf: 8.8,
      appliedRate: 44.5,
      totalAmount: 1134.75,
      idempotencyKey: 'IDEMP-TEST-001',
    });

    assert.equal(commitResult.success, true);
    assert.equal(commitResult.result?.sessionId, 'session-uuid-111');
    assert.equal(commitResult.result?.collectionId, 'col-uuid-222');
    assert.equal(commitResult.result?.receiptNumber, 'RCP-20261114-001');
    assert.equal(commitResult.result?.totalAmount, 1134.75);
    assert.equal(commitResult.result?.newBalance, 1134.75);
    assert.equal(commitResult.result?.isOffline, false);
    assert.ok(commitResult.result?.receiptText.includes('RCP-20261114-001'));
  });

  await t.test('11. Commit milk collection offline fallback enqueues sync journal', async () => {
    await sessionManager.clearSession();

    const customer: Customer = {
      id: 'cust-offline-002',
      organizationId: 'org-1',
      primaryCenterId: 'center_default',
      farmerCode: 'FARMER-002',
      fullName: 'Tanaji Ghorpade',
      mobileNumber: '+919876543211',
      status: 'ACTIVE',
      permittedCategories: ['BUFFALO'],
    };

    const commitResult = await repository.commitMilkCollection({
      customer,
      category: 'BUFFALO',
      method: 'SUPERVISOR_MANUAL',
      shift: 'EVENING',
      businessDate: '2026-11-14',
      netWeight: 15.0,
      fat: 7.0,
      snf: 9.2,
      appliedRate: 58.0,
      totalAmount: 870.0,
      idempotencyKey: 'IDEMP-OFFLINE-002',
    });

    assert.equal(commitResult.success, true);
    assert.equal(commitResult.result?.isOffline, true);
    assert.ok(commitResult.result?.receiptNumber.startsWith('RCP-OFFLINE-'));

    // Check local database
    const collections = await database.getLocalCollections(10);
    assert.equal(collections.length, 1);
    assert.equal(collections[0].totalAmount, 870.0);
    assert.equal(collections[0].syncStatus, 'PENDING_SYNC');

    // Check sync journal queue
    const pendingEvents = await database.getPendingJournalEvents(10);
    assert.equal(pendingEvents.length, 1);
    assert.equal(pendingEvents[0].entityType, 'MILK_COLLECTION');
    assert.equal(pendingEvents[0].idempotencyKey, 'IDEMP-OFFLINE-002');
  });

  await t.test('12. Shift summary and history', async () => {
    await sessionManager.saveSession('jwt_test_token', {
      id: 'officer-uuid-001',
      email: 'ramesh@dfarm.local',
      fullName: 'Ramesh Patil',
      role: 'COLLECTION_OFFICER',
      organizationId: 'org-sangli-01',
      centerId: 'center-tasgaon-01',
      assignedCenters: [
        {
          centerId: 'center-tasgaon-01',
          centerName: 'Tasgaon Center',
          centerCode: 'TAS01',
        },
      ],
    });

    (mockApiClient as any).getShiftSummary = async () => ({
      success: true,
      data: {
        centerId: 'center-tasgaon-01',
        shift: 'MORNING',
        businessDate: '2026-11-14',
        totalCollections: 15,
        totalWeightKg: 420.5,
        averageFat: 4.52,
        averageSnf: 8.79,
        totalAmount: 18712.25,
      },
    });

    const summary = await repository.getShiftSummary('MORNING', '2026-11-14');
    assert.equal(summary.totalCollections, 15);
    assert.equal(summary.totalWeightKg, 420.5);
    assert.equal(summary.totalAmount, 18712.25);

    (mockApiClient as any).getHistory = async () => ({
      success: true,
      data: [
        {
          id: 'col-101',
          customer_id: 'cust-1',
          farmer_code: 'FARMER-001',
          customer_name: 'Pandurang Patil',
          selected_milk_category: 'COW',
          shift_type: 'MORNING',
          business_date: '2026-11-14',
          session_state: 'COMPLETED',
          net_weight: 25.0,
          fat_percentage: 4.5,
          snf_percentage: 8.8,
          applied_rate_per_unit: 44.5,
          total_amount: 1112.5,
        },
      ],
    });

    const history = await repository.getCollectionHistory('2026-11-14', 'MORNING');
    assert.equal(history.length, 1);
    assert.equal(history[0].farmer_code, 'FARMER-001');
    assert.equal(history[0].total_amount, 1112.5);
  });
});
