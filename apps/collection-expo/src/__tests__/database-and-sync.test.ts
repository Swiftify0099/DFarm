import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCollectionDatabase } from '../database/CollectionDatabase';
import {
  OfflineRevocationGuard,
  OfflineAuthorizationExpiredException,
  DeviceRevokedException,
} from '../domain/sync/OfflineRevocationGuard';
import { DFarmSyncEngine } from '../domain/sync/DFarmSyncEngine';
import {
  CachedCustomer,
  CachedFaceTemplate,
  LocalCollectionSession,
  LocalMilkCollection,
  RevocationTombstone,
} from '../types';

test('Collection Database & Synchronization Engine Test Suite', async (t) => {
  let database: InMemoryCollectionDatabase;
  let revocationGuard: OfflineRevocationGuard;
  let syncEngine: DFarmSyncEngine;

  t.beforeEach(() => {
    database = new InMemoryCollectionDatabase();
    revocationGuard = new OfflineRevocationGuard(database, 72);
    syncEngine = new DFarmSyncEngine(database, revocationGuard);
  });

  await t.test('1. Collection transaction local persistence and journal outbox', async () => {
    const session: LocalCollectionSession = {
      sessionId: 'sess_test_101',
      customerId: 'CUST-101',
      centerId: 'CENTER-01',
      deviceId: 'DEV-01',
      businessDate: '2026-11-14',
      shiftType: 'MORNING',
      milkCategory: 'COW',
      identificationMethod: 'FACE',
      intakeSequenceUuid: 'seq_101',
      sessionState: 'COMPLETED',
      startedAt: Date.now(),
      completedAt: Date.now(),
    };
    await database.saveCollectionSession(session);

    const collection: LocalMilkCollection = {
      collectionId: 'col_test_101',
      sessionId: session.sessionId,
      customerId: session.customerId,
      centerId: session.centerId,
      businessDate: session.businessDate,
      shiftType: session.shiftType,
      milkCategory: session.milkCategory,
      netWeight: 32.4,
      fatPercentage: 4.5,
      snfPercentage: 8.8,
      appliedRatePerUnit: 42.0,
      totalAmount: 1360.8,
      idempotencyKey: 'IDEMP-COL-001',
      syncStatus: 'PENDING_SYNC',
      createdAt: Date.now(),
    };

    const payloadJson = JSON.stringify({ weight: 32.4, fat: 4.5, total: 1360.8 });
    const saved = await database.saveMilkCollectionAndEnqueueSync(
      collection,
      collection.idempotencyKey,
      payloadJson
    );
    assert.equal(saved, true, 'Collection must be saved atomically');

    const pending = await database.getPendingJournalEvents();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].idempotencyKey, 'IDEMP-COL-001');
    assert.equal(pending[0].syncStatus, 'PENDING_SYNC');
  });

  await t.test('2. Offline Revocation Guard fails closed when 72h window expired', async () => {
    const customer: CachedCustomer = {
      customerId: 'CUST-AUTH-1',
      farmerCode: 'F-101',
      fullName: 'Ramesh Pawar',
      mobileNumber: '9822112233',
      primaryCenterId: 'CENTER-01',
      status: 'ACTIVE',
      isDeleted: false,
      isRevoked: false,
      version: 1,
      updatedAt: Date.now(),
      permittedCategories: ['COW'],
    };
    await database.saveCustomer(customer);

    // 1. Fresh sync within 72 hours -> Authorized
    await database.updateSyncState(Date.now() - 10 * 3600 * 1000, 0, 0);
    const valid = await revocationGuard.isAuthorizationValid();
    assert.equal(valid, true, 'Recent sync should be authorized');
    const custAuth = await revocationGuard.isCustomerAuthorized('CUST-AUTH-1');
    assert.equal(custAuth, true);

    // 2. Offline for 75 hours (> 72 hours max) -> Fails closed
    await database.updateSyncState(Date.now() - 75 * 3600 * 1000, 0, 0);
    const expiredValid = await revocationGuard.isAuthorizationValid();
    assert.equal(expiredValid, false, 'Expired sync window must fail closed');

    await assert.rejects(
      async () => {
        await revocationGuard.assertAuthorizationValid();
      },
      (err: any) => {
        return (
          err instanceof OfflineAuthorizationExpiredException &&
          err.message.includes('expired')
        );
      }
    );
  });

  await t.test('3. Revocation Tombstone purges customer and face template from active index', async () => {
    const customerId = 'CUST-TOMBSTONE-1';
    const customer: CachedCustomer = {
      customerId,
      farmerCode: 'F-999',
      fullName: 'Ankush Jadhav',
      mobileNumber: '9823456789',
      primaryCenterId: 'CENTER-01',
      status: 'ACTIVE',
      isDeleted: false,
      isRevoked: false,
      version: 1,
      updatedAt: Date.now(),
      permittedCategories: ['COW', 'BUFFALO'],
    };
    await database.saveCustomer(customer);

    const template: CachedFaceTemplate = {
      id: 'FACE-TPL-1',
      customerId,
      modelVersion: 'MobileFaceNet-V1',
      cryptoNonce: 'iv123',
      authTag: 'tag123',
      encryptedEmbedding: 'encBase64',
      status: 'ACTIVE',
      updatedAt: Date.now(),
    };
    await database.saveFaceTemplate(template);

    const activeTemplatesBefore = await database.getActiveFaceTemplates();
    assert.equal(activeTemplatesBefore.length, 1);

    // Apply downstream revocation tombstone
    const tombstone: RevocationTombstone = {
      tombstoneId: 'TOMB-1',
      entityType: 'CUSTOMER',
      entityId: customerId,
      reason: 'Farmer left cooperative',
      revokedAt: Date.now(),
    };
    await revocationGuard.applyRevocationTombstone(tombstone);

    // Customer must be marked REVOKED
    const updatedCust = await database.getCustomer(customerId);
    assert.ok(updatedCust);
    assert.equal(updatedCust?.status, 'REVOKED');
    assert.equal(updatedCust?.isDeleted, true);
    assert.equal(updatedCust?.isRevoked, true);

    // Biometric face index MUST be purged
    const activeTemplatesAfter = await database.getActiveFaceTemplates();
    assert.equal(
      activeTemplatesAfter.length,
      0,
      'Revoked customer must be purged from active face matching index'
    );
  });

  await t.test('4. Upstream Push Sync Idempotency', async () => {
    const colId = 'col_push_test';
    const idempotencyKey = 'IDEMP-PUSH-1';
    const collection: LocalMilkCollection = {
      collectionId: colId,
      sessionId: 'sess_push_test',
      customerId: 'CUST-1',
      centerId: 'CENTER-01',
      businessDate: '2026-11-14',
      shiftType: 'MORNING',
      milkCategory: 'COW',
      netWeight: 20.0,
      fatPercentage: 4.0,
      snfPercentage: 8.5,
      appliedRatePerUnit: 40.0,
      totalAmount: 800.0,
      idempotencyKey,
      syncStatus: 'PENDING_SYNC',
      createdAt: Date.now(),
    };
    await database.saveMilkCollectionAndEnqueueSync(collection, idempotencyKey, '{}');

    const pendingBefore = await database.getPendingJournalEvents();
    assert.equal(pendingBefore.length, 1);
    const pendingEventId = pendingBefore[0].eventId;

    // Mock backend push response
    const mockPoster = async () => {
      const resp = JSON.stringify({
        success: true,
        data: {
          applied: 1,
          results: [
            {
              eventId: pendingEventId,
              status: 'COMMITTED',
            },
          ],
        },
      });
      return { status: 200, body: resp };
    };

    const pushed = await syncEngine.pushPendingJournal('DEV-01', 'CENTER-01', mockPoster);
    assert.equal(pushed, 1);

    const pendingAfter = await database.getPendingJournalEvents();
    assert.equal(pendingAfter.length, 0, 'Pending journal should be empty after sync');
  });

  await t.test('5. Downstream Pull incremental sync and cursor advance', async () => {
    const custId = 'cust_pulled_123';

    const mockGetter = async () => {
      const resp = JSON.stringify({
        success: true,
        data: {
          customers: [
            {
              id: custId,
              farmerCode: 'F-888',
              fullName: 'Sambhaji Kadam',
              mobilePhone: '9811223344',
              primaryCenterId: 'CENTER-01',
              status: 'ACTIVE',
              permittedCategories: ['COW', 'BUFFALO'],
            },
          ],
          rateCards: [
            {
              id: 'RATE-1',
              rateChartVersionId: 'RCV-1',
              fatPercentage: 4.5,
              snfPercentage: 8.5,
              ratePerUnit: 41.5,
            },
          ],
          faceTemplates: [
            {
              id: 'FACE-1',
              customerId: custId,
              cryptoNonce: 'iv_test',
              authTag: 'tag_test',
              encryptedEmbedding: 'ciphertext_test',
              status: 'ACTIVE',
            },
          ],
          tombstones: [],
          nextCursor: 1,
          nextTombstoneCursor: 0,
        },
      });
      return { status: 200, body: resp };
    };

    let ackCalled = false;
    const mockPoster = async (url: string) => {
      if (url === '/api/v1/sync/acknowledge') {
        ackCalled = true;
      }
      return { status: 200, body: JSON.stringify({ success: true }) };
    };

    const summary = await syncEngine.pullDownstreamUpdates('CENTER-01', mockGetter, mockPoster);
    assert.equal(summary.isSuccess, true);
    assert.equal(summary.pulledCustomersCount, 1);
    assert.equal(summary.pulledTemplatesCount, 1);
    assert.equal(summary.pulledRatesCount, 1);
    assert.equal(ackCalled, true, 'Server cursor must be acknowledged');

    // Verify stored in DB
    const cust = await database.getCustomer(custId);
    assert.ok(cust);
    assert.equal(cust?.fullName, 'Sambhaji Kadam');

    const rate = await database.getApplicableRate(4.5, 8.5);
    assert.equal(rate, 41.5);

    const [cCursor] = await database.getServerCursors();
    assert.equal(cCursor, 1);
  });

  await t.test('6. Device revocation throws DeviceRevokedException on 403', async () => {
    const mockGetter = async () => ({
      status: 403,
      body: JSON.stringify({ error: 'DEVICE_REVOKED' }),
    });
    const mockPoster = async () => ({
      status: 403,
      body: JSON.stringify({ error: 'DEVICE_REVOKED' }),
    });

    await assert.rejects(
      async () => {
        await syncEngine.pullDownstreamUpdates('CENTER-01', mockGetter, mockPoster);
      },
      (err: any) => {
        return (
          err instanceof DeviceRevokedException &&
          err.message.includes('revoked')
        );
      }
    );
  });
});
