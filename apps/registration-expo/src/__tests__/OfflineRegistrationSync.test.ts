/**
 * DFarm Registration App - Offline Registration & Sync Engine Tests
 * Complete parity with Kotlin OfflineRegistrationSyncTest.kt
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  IRegistrationDraftStore,
} from '../database/RegistrationDatabase';
import { InMemoryRegistrationDraftStore } from '../database/InMemoryRegistrationDraftStore';
import { RegistrationSyncEngine } from '../sync/RegistrationSyncEngine';
import { LocalRegistrationDraft, LocalSyncStatus } from '../types/models';

describe('OfflineRegistrationSyncTest', () => {
  let store: IRegistrationDraftStore;
  let syncEngine: RegistrationSyncEngine;

  beforeEach(async () => {
    store = new InMemoryRegistrationDraftStore();
    await store.clearAll();
    syncEngine = new RegistrationSyncEngine(store);
  });

  it('testOfflineRegistrationDraftPersistence', async () => {
    const localDraft: LocalRegistrationDraft = {
      localId: 'local-test-001',
      fullName: 'Baburao Ramchandra Kadam',
      mobileNumber: '9876543210',
      permittedCategories: ['COW', 'BUFFALO'],
      preferredMilkCategory: 'COW',
      village: 'Tasgaon',
      talukaSubdistrict: 'Tasgaon',
      district: 'Sangli',
      state: 'Maharashtra',
      postalCode: '416312',
      bankName: 'Bank of Maharashtra',
      bankAccountNumber: '987654321012',
      bankIfscCode: 'MAHB0000123',
      bankAccountHolderName: 'Baburao R Kadam',
      syncStatus: LocalSyncStatus.DRAFT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };

    const idempotencyKey = `IDEMP-REG-${localDraft.localId}`;
    const payloadJson = JSON.stringify({
      fullName: localDraft.fullName,
      mobileNumber: localDraft.mobileNumber,
      village: localDraft.village,
    });

    const saved = await store.saveDraftAndEnqueueEvent(
      localDraft,
      idempotencyKey,
      payloadJson
    );
    assert.strictEqual(saved, true, 'Draft must be saved atomically');

    // Verify draft status is PENDING_SYNC
    const savedDraft = await store.getDraftByLocalId(localDraft.localId);
    assert.ok(savedDraft);
    assert.strictEqual(savedDraft?.syncStatus, LocalSyncStatus.PENDING_SYNC);
    assert.strictEqual(
      savedDraft?.canonicalServerId,
      undefined,
      'Locally created customer must not have canonical server ID yet'
    );

    // Verify event enters local sync queue
    const pendingEvents = await store.getPendingSyncEvents();
    assert.strictEqual(pendingEvents.length, 1);
    assert.strictEqual(pendingEvents[0].idempotencyKey, idempotencyKey);
  });

  it('testApplicationRestartRecovery', async () => {
    const localDraft: LocalRegistrationDraft = {
      localId: 'local-test-002',
      fullName: 'Dattatraya Shinde',
      mobileNumber: '9822001122',
      permittedCategories: ['COW'],
      village: 'Miraj',
      talukaSubdistrict: 'Miraj',
      district: 'Sangli',
      state: 'Maharashtra',
      postalCode: '416410',
      syncStatus: LocalSyncStatus.DRAFT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };

    await store.saveDraftAndEnqueueEvent(localDraft, 'IDEMP-RECOVERY-1', '{}');

    // Simulate app restart: query recoverable drafts
    const recoverable = await store.getRecoverableDrafts();
    assert.strictEqual(recoverable.length, 1);
    assert.strictEqual(recoverable[0].fullName, 'Dattatraya Shinde');
    assert.strictEqual(recoverable[0].syncStatus, LocalSyncStatus.PENDING_SYNC);
  });

  it('testOnlineRegistrationSynchronizationSuccess', async () => {
    const localDraft: LocalRegistrationDraft = {
      localId: 'local-test-003',
      fullName: 'Tanaji Malusare',
      mobileNumber: '9876549999',
      permittedCategories: ['COW'],
      village: 'Tasgaon',
      talukaSubdistrict: 'Tasgaon',
      district: 'Sangli',
      state: 'Maharashtra',
      postalCode: '416312',
      syncStatus: LocalSyncStatus.DRAFT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };
    const idempotencyKey = `IDEMP-SYNC-${localDraft.localId}`;
    await store.saveDraftAndEnqueueEvent(
      localDraft,
      idempotencyKey,
      JSON.stringify({ fullName: 'Tanaji Malusare' })
    );

    const canonicalUuid = 'c3333333-3333-3333-3333-333333333333';

    // Mock successful backend response
    const mockSender = async () => {
      return {
        statusCode: 200,
        body: {
          success: true,
          applied: 1,
          conflicts: 0,
          results: [
            {
              eventId: (await store.getPendingSyncEvents())[0].eventId,
              idempotencyKey,
              status: 'COMMITTED',
              canonicalId: canonicalUuid,
            },
          ],
        },
      };
    };

    const result = await syncEngine.pushPendingRegistrations('DEV-01', 'CENTER-01', mockSender);
    assert.strictEqual(result.committedCount, 1);
    assert.strictEqual(result.conflictCount, 0);
    assert.strictEqual(result.errorCount, 0);

    // Verify draft was updated to SYNCED and assigned canonical server UUID
    const updatedDraft = await store.getDraftByLocalId(localDraft.localId);
    assert.ok(updatedDraft);
    assert.strictEqual(updatedDraft?.syncStatus, LocalSyncStatus.SYNCED);
    assert.strictEqual(updatedDraft?.canonicalServerId, canonicalUuid);

    // Verify queue is now empty
    const remainingEvents = await store.getPendingSyncEvents();
    assert.strictEqual(remainingEvents.length, 0);
  });

  it('testDuplicateMobileConflictHandling', async () => {
    const localDraft: LocalRegistrationDraft = {
      localId: 'local-test-004',
      fullName: 'Ananda Patil',
      mobileNumber: '9876543210', // Existing number
      permittedCategories: ['COW'],
      village: 'Tasgaon',
      talukaSubdistrict: 'Tasgaon',
      district: 'Sangli',
      state: 'Maharashtra',
      postalCode: '416312',
      syncStatus: LocalSyncStatus.DRAFT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };
    const idempotencyKey = `IDEMP-CONFLICT-${localDraft.localId}`;
    await store.saveDraftAndEnqueueEvent(
      localDraft,
      idempotencyKey,
      JSON.stringify({ fullName: 'Ananda Patil' })
    );

    // Mock backend conflict response
    const mockSender = async () => {
      return {
        statusCode: 200,
        body: {
          success: true,
          applied: 0,
          conflicts: 1,
          results: [
            {
              eventId: (await store.getPendingSyncEvents())[0].eventId,
              idempotencyKey,
              status: 'CONFLICT',
              reason: 'DUPLICATE_MOBILE_NUMBER',
            },
          ],
        },
      };
    };

    const result = await syncEngine.pushPendingRegistrations('DEV-01', 'CENTER-01', mockSender);
    assert.strictEqual(result.conflictCount, 1);
    assert.strictEqual(result.committedCount, 0);

    // Draft is preserved with conflict status
    const conflictedDraft = await store.getDraftByLocalId(localDraft.localId);
    assert.ok(conflictedDraft);
    assert.strictEqual(conflictedDraft?.syncStatus, LocalSyncStatus.CONFLICT);
    assert.strictEqual(conflictedDraft?.conflictReason, 'DUPLICATE_MOBILE_NUMBER');
  });
});
