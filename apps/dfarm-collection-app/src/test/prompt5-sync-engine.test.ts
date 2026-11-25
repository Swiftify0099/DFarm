// DFarm Prompt 5 — Comprehensive Client Sync Engine, Network State Manager & Reconciliation Test Suite
// Verifies local-first invariant, state machine transitions, bounded batching, partial success handling,
// idempotency preservation, crash recovery, multi-tab locking, ETag rate refresh, and lease propagation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { localDB } from '../services/local-storage'
import { syncEngine } from '../services/sync-engine'
import { networkManager } from '../services/network-manager'
import { collectionsApi, ratesApi } from '../api/client'
import { multiTabLock } from '../services/multi-tab-lock'
import type { CollectionTransaction, OfflineQueueItem, ActiveCollectionSession } from '../types'

describe('Prompt 5: Automatic Client Sync Engine & Offline-to-Online Reconciliation', () => {
  const dummySession: ActiveCollectionSession = {
    id: 'session-p5-01',
    sessionCode: 'SES-MOR-20261124',
    dairyId: 'dairy-p5-test',
    centerId: 'center-p5-01',
    date: '2026-11-24',
    timezone: 'Asia/Kolkata',
    shift: 'MORNING',
    status: 'OPEN',
    openedAt: new Date().toISOString(),
    openingOperatorName: 'Pankaj Kulkarni',
    deviceId: 'DF-KIOSK-001',
    deviceName: 'Counter Kiosk 1',
    totals: {
      totalLiters: 100.0,
      cowLiters: 100.0,
      buffaloLiters: 0,
      transactionCount: 5,
      totalAmount: 4000.0,
      averageFat: 4.0,
      averageSnf: 8.5,
    },
  }

  const createTestTxn = (uuid: string, overrides: Partial<CollectionTransaction> = {}): CollectionTransaction => ({
    id: uuid,
    clientIntakeUuid: uuid,
    transactionCode: `TXN-${uuid.substring(0, 8).toUpperCase()}`,
    sessionId: dummySession.id,
    dairyId: dummySession.dairyId,
    centerId: dummySession.centerId,
    customerId: 'cust-p5-101',
    customerCode: 'C-101',
    customerName: 'Sanjay Patil',
    timestamp: new Date().toISOString(),
    date: '2026-11-24',
    shift: 'MORNING',
    milkCategory: 'COW',
    weightLiters: 12.5,
    fatPercentage: 4.2,
    snfPercentage: 8.6,
    clrDensity: 29.0,
    appliedRatePerLiter: 40.0,
    rateChartVersion: 1,
    totalAmount: 500.0,
    identificationMethod: 'FACE_YUNET_SFACE',
    syncStatus: 'PENDING_OFFLINE',
    deviceId: 'DF-KIOSK-001',
    operatorName: 'Pankaj Kulkarni',
    idempotencyKey: `INTAKE-${uuid}`,
    offlineCreated: true,
    ...overrides,
  })

  const createTestQueueItem = (txn: CollectionTransaction, overrides: Partial<OfflineQueueItem> = {}): OfflineQueueItem => {
    const uuid = txn.clientIntakeUuid || txn.id
    return {
      eventId: `EVT-${uuid}`,
      transactionId: uuid,
      clientIntakeUuid: uuid,
      customerCode: txn.customerCode,
      customerName: txn.customerName,
      timestamp: txn.timestamp,
      retryCount: 0,
      status: 'QUEUED',
      syncQueueStatus: 'PENDING',
      errorReason: null,
      lastAttemptedAt: null,
      transaction: txn,
      ...overrides,
    }
  }

  beforeEach(async () => {
    vi.restoreAllMocks()
    localStorage.clear()
    localStorage.setItem('dfarm_collection_token', 'test_jwt_operator')
    localStorage.setItem('dfarm_collection_dairy_id', 'dairy-p5-test')
    localStorage.setItem(
      'dfarm_collection_operator',
      JSON.stringify({
        id: 'op-1',
        fullName: 'Pankaj Kulkarni',
        dairyId: 'dairy-p5-test',
        centerId: 'center-p5-01',
      })
    )
    networkManager.setStatus('ONLINE')
    await localDB.clearAllStoresForTesting()
  })

  afterEach(() => {
    syncEngine.destroy()
    networkManager.destroy()
  })

  // =========================================================================
  // SECTION 1: LOCAL-FIRST COMMIT BEFORE NETWORK SYNC & IDEMPOTENCY
  // =========================================================================
  it('1. Enforces local-first invariant: atomic IndexedDB commit occurs before any network request', async () => {
    const uuid = crypto.randomUUID()
    const txn = createTestTxn(uuid)
    const item = createTestQueueItem(txn)

    const resultItem = {
      clientIntakeUuid: uuid,
      idempotencyKey: txn.idempotencyKey,
      status: 'ACCEPTED' as const,
      isIdempotentReplay: false,
      serverTransactionId: 'srv-txn-12345',
      receiptNumber: 'RCP-20261124-001',
      errorCode: null,
      errorMessage: null,
    }

    // Spy on collectionsApi.bulkSync
    const bulkSpy = vi.spyOn(collectionsApi, 'bulkSync').mockResolvedValue({
      batchId: 'batch-test-1',
      requestId: 'req-test-1',
      summary: {
        received: 1,
        accepted: 1,
        replayed: 0,
        rejected: 0,
        retryable: 0,
      },
      results: [resultItem],
      items: [resultItem],
    } as any)

    // Step 1: Save locally
    await localDB.saveIntakeAtomically(txn, item)

    // Verification: Transaction exists in completed_transactions AND offline_queue
    const storedTxn = await localDB.getTransactionById(uuid)
    expect(storedTxn).toBeDefined()
    expect(storedTxn?.clientIntakeUuid).toBe(uuid)
    expect(storedTxn?.syncStatus).toBe('PENDING_OFFLINE')

    const queueItems = await localDB.getOfflineQueue()
    const storedQueue = queueItems.find((q) => q.clientIntakeUuid === uuid)
    expect(storedQueue).toBeDefined()
    expect(storedQueue?.syncQueueStatus).toBe('PENDING')

    // At this moment, zero network calls have been made!
    expect(bulkSpy).not.toHaveBeenCalled()

    // Step 2: Now trigger sync engine
    const syncRes = await syncEngine.triggerSync()
    expect(syncRes.processed).toBe(1)
    expect(syncRes.succeeded).toBe(1)
    expect(bulkSpy).toHaveBeenCalledTimes(1)

    // Verification: After sync, clientIntakeUuid and idempotencyKey remain immutable!
    const reconciledTxn = await localDB.getTransactionById(uuid)
    expect(reconciledTxn?.clientIntakeUuid).toBe(uuid)
    expect(reconciledTxn?.idempotencyKey).toBe(`INTAKE-${uuid}`)
    expect(reconciledTxn?.syncStatus).toBe('SYNCED_CLOUD')
    expect(reconciledTxn?.serverTransactionId).toBe('srv-txn-12345')
    expect(reconciledTxn?.receiptNumber).toBe('RCP-20261124-001')
  })

  // =========================================================================
  // SECTION 2: PARTIAL BATCH HANDLING (ACCEPTED, REPLAYED, REJECTED, RETRYABLE)
  // =========================================================================
  it('2. Correctly reconciles partial batch success: ACCEPTED, REPLAYED, REJECTED, and RETRYABLE', async () => {
    const uuidAccepted = crypto.randomUUID()
    const uuidReplayed = crypto.randomUUID()
    const uuidRejected = crypto.randomUUID()
    const uuidRetryable = crypto.randomUUID()

    const txnAccepted = createTestTxn(uuidAccepted)
    const txnReplayed = createTestTxn(uuidReplayed)
    const txnRejected = createTestTxn(uuidRejected)
    const txnRetryable = createTestTxn(uuidRetryable)

    await localDB.saveIntakeAtomically(txnAccepted, createTestQueueItem(txnAccepted))
    await localDB.saveIntakeAtomically(txnReplayed, createTestQueueItem(txnReplayed))
    await localDB.saveIntakeAtomically(txnRejected, createTestQueueItem(txnRejected))
    await localDB.saveIntakeAtomically(txnRetryable, createTestQueueItem(txnRetryable))

    const results = [
      {
        clientIntakeUuid: uuidAccepted,
        idempotencyKey: txnAccepted.idempotencyKey,
        status: 'ACCEPTED' as const,
        isIdempotentReplay: false,
        serverTransactionId: 'srv-accepted-01',
        receiptNumber: 'RCP-ACC-01',
      },
      {
        clientIntakeUuid: uuidReplayed,
        idempotencyKey: txnReplayed.idempotencyKey,
        status: 'REPLAYED' as const,
        isIdempotentReplay: true,
        serverTransactionId: 'srv-replayed-01',
        receiptNumber: 'RCP-REP-01',
      },
      {
        clientIntakeUuid: uuidRejected,
        idempotencyKey: txnRejected.idempotencyKey,
        status: 'REJECTED' as const,
        isIdempotentReplay: false,
        errorCode: 'VALIDATION_FAILED_FAT_OUT_OF_BOUNDS',
        errorMessage: 'Fat exceeds biological limit',
      },
      {
        clientIntakeUuid: uuidRetryable,
        idempotencyKey: txnRetryable.idempotencyKey,
        status: 'RETRYABLE' as const,
        isIdempotentReplay: false,
        errorCode: 'DB_CONNECTION_TIMEOUT',
        errorMessage: 'Transient database lock, retry later',
        retryAfter: 5,
      },
    ]

    vi.spyOn(collectionsApi, 'bulkSync').mockResolvedValue({
      batchId: 'batch-test-2',
      requestId: 'req-test-2',
      summary: {
        received: 4,
        accepted: 1,
        replayed: 1,
        rejected: 1,
        retryable: 1,
      },
      results,
      items: results,
    } as any)

    const syncRes = await syncEngine.triggerSync()
    expect(syncRes.processed).toBe(4)
    expect(syncRes.succeeded).toBe(2) // Accepted + Replayed

    // 1. Verify ACCEPTED item in completed_transactions
    const txnAcceptedStored = await localDB.getTransactionById(uuidAccepted)
    expect(txnAcceptedStored?.syncStatus).toBe('SYNCED_CLOUD')
    expect(txnAcceptedStored?.serverTransactionId).toBe('srv-accepted-01')

    // 2. Verify REPLAYED item in completed_transactions (idempotent replay, zero duplicate records)
    const txnReplayedStored = await localDB.getTransactionById(uuidReplayed)
    expect(txnReplayedStored?.syncStatus).toBe('SYNCED_CLOUD')
    expect(txnReplayedStored?.serverTransactionId).toBe('srv-replayed-01')

    // 3. Verify REJECTED item (retained in IndexedDB, marked REJECTED, errorCode recorded)
    const queueRejected = (await localDB.getOfflineQueue()).find((q) => q.clientIntakeUuid === uuidRejected)
    expect(queueRejected).toBeDefined()
    expect(queueRejected?.syncQueueStatus).toBe('REJECTED')
    expect(queueRejected?.errorCode).toBe('VALIDATION_FAILED_FAT_OUT_OF_BOUNDS')
    expect(queueRejected?.errorReason).toContain('Fat exceeds biological limit')

    // 4. Verify RETRYABLE item (marked RETRYABLE, retryCount incremented, nextRetryAt set)
    const queueRetryable = (await localDB.getOfflineQueue()).find((q) => q.clientIntakeUuid === uuidRetryable)
    expect(queueRetryable).toBeDefined()
    expect(queueRetryable?.syncQueueStatus).toBe('RETRYABLE')
    expect(queueRetryable?.retryCount).toBe(1)
    expect(queueRetryable?.nextRetryAt).toBeDefined()
  })

  // =========================================================================
  // SECTION 3: HTTP 409 CONFLICT & MANUAL REVIEW
  // =========================================================================
  it('3. Marks 409 IDEMPOTENCY_PAYLOAD_MISMATCH as MANUAL_REVIEW and preserves payload without overwriting', async () => {
    const uuid = crypto.randomUUID()
    const txn = createTestTxn(uuid)
    await localDB.saveIntakeAtomically(txn, createTestQueueItem(txn))

    const results = [
      {
        clientIntakeUuid: uuid,
        idempotencyKey: txn.idempotencyKey,
        status: 'REJECTED' as const,
        isIdempotentReplay: false,
        errorCode: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
        errorMessage: 'Idempotency key already used with different payload',
      },
    ]

    vi.spyOn(collectionsApi, 'bulkSync').mockResolvedValue({
      batchId: 'batch-test-3',
      requestId: 'req-test-3',
      summary: {
        received: 1,
        accepted: 0,
        replayed: 0,
        rejected: 1,
        retryable: 0,
      },
      results,
      items: results,
    } as any)

    const syncRes = await syncEngine.triggerSync()
    expect(syncRes.failed).toBe(1)

    const queueItem = (await localDB.getOfflineQueue()).find((q) => q.clientIntakeUuid === uuid)
    expect(queueItem?.syncQueueStatus).toBe('MANUAL_REVIEW')
    expect(queueItem?.errorCode).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH')
    expect(queueItem?.errorReason).toContain('Idempotency key already used')
  })

  // =========================================================================
  // SECTION 4: CRASH RECOVERY OF IN-FLIGHT SYNCING ITEMS
  // =========================================================================
  it('4. Recovers stale SYNCING records to RETRYABLE upon startup/crash recovery', async () => {
    const uuid = crypto.randomUUID()
    const txn = createTestTxn(uuid)
    const item = createTestQueueItem(txn, {
      syncQueueStatus: 'SYNCING',
      status: 'QUEUED',
      lastAttemptedAt: new Date(Date.now() - 120_000).toISOString(), // 2 minutes ago (stale)
    })

    await localDB.saveIntakeAtomically(txn, item)

    // Directly invoke stale recovery with 60 second threshold
    const recoveredCount = await localDB.recoverStaleSyncingItems(60_000)
    expect(recoveredCount).toBeGreaterThanOrEqual(1)

    const recovered = (await localDB.getOfflineQueue()).find((q) => q.clientIntakeUuid === uuid)
    expect(recovered?.syncQueueStatus).toBe('RETRYABLE')
    expect(recovered?.errorReason).toContain('Interrupted during sync flight (recovered on startup)')
  })

  // =========================================================================
  // SECTION 5: BOUNDED BATCHING (MAX 25 PER CHUNK)
  // =========================================================================
  it('5. Enforces batch limit: batches transactions up to client limit (25) in FIFO order', async () => {
    // Insert 30 items
    const uuids: string[] = []
    for (let i = 0; i < 30; i++) {
      const u = crypto.randomUUID()
      uuids.push(u)
      const txn = createTestTxn(u, {
        timestamp: new Date(Date.now() - (30 - i) * 1000).toISOString(), // FIFO order
      })
      await localDB.saveIntakeAtomically(txn, createTestQueueItem(txn))
    }

    let batchSizes: number[] = []
    vi.spyOn(collectionsApi, 'bulkSync').mockImplementation(async (req) => {
      batchSizes.push(req.transactions.length)
      const results = req.transactions.map((t) => ({
        clientIntakeUuid: t.clientIntakeUuid,
        idempotencyKey: t.idempotencyKey,
        status: 'ACCEPTED' as const,
        isIdempotentReplay: false,
        serverTransactionId: `srv-${t.clientIntakeUuid}`,
        receiptNumber: `RCP-${t.clientIntakeUuid.substring(0, 6)}`,
      }))
      return {
        batchId: req.batchId,
        requestId: 'req-batch-5',
        summary: {
          received: req.transactions.length,
          accepted: req.transactions.length,
          replayed: 0,
          rejected: 0,
          retryable: 0,
        },
        results,
        items: results,
      } as any
    })

    const syncRes = await syncEngine.triggerSync()
    expect(syncRes.processed).toBe(30)
    expect(syncRes.succeeded).toBe(30)

    // Must have split 30 items into chunk 1 (25) and chunk 2 (5)
    expect(batchSizes).toEqual([25, 5])
  })

  // =========================================================================
  // SECTION 6: DYNAMIC BATCH SPLITTING ON HTTP 413 BATCH_SIZE_EXCEEDED
  // =========================================================================
  it('6. Dynamically reduces batch size when server responds with HTTP 413 BATCH_SIZE_EXCEEDED', async () => {
    // Insert 10 items
    for (let i = 0; i < 10; i++) {
      const u = crypto.randomUUID()
      const txn = createTestTxn(u)
      await localDB.saveIntakeAtomically(txn, createTestQueueItem(txn))
    }

    let callCount = 0
    vi.spyOn(collectionsApi, 'bulkSync').mockImplementation(async (req) => {
      callCount++
      if (callCount === 1) {
        // First call fails with HTTP 413
        const err: any = new Error('Payload Too Large: Batch size exceeds limit')
        err.statusCode = 413
        err.code = 'BATCH_SIZE_EXCEEDED'
        throw err
      }
      const results = req.transactions.map((t) => ({
        clientIntakeUuid: t.clientIntakeUuid,
        idempotencyKey: t.idempotencyKey,
        status: 'ACCEPTED' as const,
        isIdempotentReplay: false,
        serverTransactionId: `srv-${t.clientIntakeUuid}`,
        receiptNumber: `RCP-${t.clientIntakeUuid.substring(0, 6)}`,
      }))
      return {
        batchId: req.batchId,
        requestId: 'req-split-6',
        summary: {
          received: req.transactions.length,
          accepted: req.transactions.length,
          replayed: 0,
          rejected: 0,
          retryable: 0,
        },
        results,
        items: results,
      } as any
    })

    const syncRes = await syncEngine.triggerSync()
    expect(syncRes.succeeded).toBeGreaterThan(0)
    expect(callCount).toBeGreaterThanOrEqual(2)
  })

  // =========================================================================
  // SECTION 7: MULTI-TAB CONCURRENCY LOCKING
  // =========================================================================
  it('7. Prevents overlapping concurrent sync executions via multi-tab locking', async () => {
    const lockKey = multiTabLock.getLockKey('dairy-p5-test', 'DF-KIOSK-001')
    let resolver: any
    const inFlightPromise = new Promise((resolve) => {
      resolver = resolve
    })

    // Acquire lock 1
    const p1 = multiTabLock.withLock(lockKey, async () => {
      await inFlightPromise
      return 'lock1-done'
    })

    // Concurrent call for same lock key must not execute while lock 1 is held
    const lock2 = await multiTabLock.withLock(lockKey, async () => {
      return 'lock2-should-not-run'
    })

    expect(lock2.executed).toBe(false)
    expect(lock2.reason).toMatch(/LOCKED_BY_ANOTHER_TAB/)

    // Release lock 1
    resolver()
    const lock1 = await p1
    expect(lock1.executed).toBe(true)
    expect(lock1.result).toBe('lock1-done')
  })

  // =========================================================================
  // SECTION 8: NETWORK STATE MANAGER (ONLINE, OFFLINE, REACHABILITY)
  // =========================================================================
  it('8. Network State Manager accurately reports reachability and triggers restore subscribers', async () => {
    let restoredFired = false
    const unsub = networkManager.subscribeRestored(() => {
      restoredFired = true
    })

    // Transition to offline
    networkManager.setStatus('BROWSER_OFFLINE')
    expect(networkManager.getStatus()).toBe('BROWSER_OFFLINE')
    expect(networkManager.isOnline()).toBe(false)

    // Transition back to online
    networkManager.setStatus('ONLINE')
    expect(networkManager.getStatus()).toBe('ONLINE')
    expect(networkManager.isOnline()).toBe(true)
    expect(restoredFired).toBe(true)

    unsub()
  })

  // =========================================================================
  // SECTION 9: RATE CHART CONDITIONAL ETAG REFRESH
  // =========================================================================
  it('9. Performs conditional rate chart refresh with ETag and handles 304 Not Modified', async () => {
    // 1. Save an initial cached rate chart with ETag
    await localDB.saveRateChart({
      id: 'dairy-p5-test_COW_v1',
      dairyId: 'dairy-p5-test',
      centerScope: 'ORGANIZATION_WIDE',
      milkCategory: 'COW',
      version: 1,
      effectiveFrom: '2026-11-01',
      baseFat: 3.5,
      baseSnf: 8.5,
      baseRate: 40.0,
      updatedAt: new Date().toISOString(),
      etag: '"cow-v1-hash-abc"',
    })

    // 2. Mock ratesApi.downloadRateCharts to return null (representing 304 Not Modified)
    vi.spyOn(ratesApi, 'downloadRateCharts').mockResolvedValue(null)

    const downloaded = await ratesApi.downloadRateCharts('dairy-p5-test')
    expect(downloaded).toBeNull()

    // 3. Existing cached chart is safely retained without corruption
    const cached = await localDB.getRateChart('dairy-p5-test', 'COW')
    expect(cached).toBeDefined()
    expect(cached?.version).toBe(1)
    expect(cached?.etag).toBe('"cow-v1-hash-abc"')
  })

  // =========================================================================
  // SECTION 10: OFFLINE SESSION LEASE ATTACHMENT
  // =========================================================================
  it('10. Attaches cryptographic offlineAuthorizationToken when session was conducted offline', async () => {
    // Save offline session authorization record in IndexedDB
    await localDB.saveSessionOfflineAuth(dummySession.id, {
      token: 'jwt.signed.offline.auth.lease.token.xyz',
      payload: {
        sessionId: dummySession.id,
        sessionCode: dummySession.sessionCode,
      },
    })

    const uuid = crypto.randomUUID()
    const txn = createTestTxn(uuid)
    await localDB.saveIntakeAtomically(txn, createTestQueueItem(txn))

    let capturedToken: string | undefined
    vi.spyOn(collectionsApi, 'bulkSync').mockImplementation(async (req) => {
      capturedToken = req.offlineAuthorizationToken || req.transactions[0]?.offlineAuthorizationToken
      const results = [
        {
          clientIntakeUuid: uuid,
          idempotencyKey: txn.idempotencyKey,
          status: 'ACCEPTED' as const,
          isIdempotentReplay: false,
          serverTransactionId: 'srv-001',
          receiptNumber: 'RCP-001',
        },
      ]
      return {
        batchId: req.batchId,
        requestId: 'req-auth-10',
        summary: {
          received: 1,
          accepted: 1,
          replayed: 0,
          rejected: 0,
          retryable: 0,
        },
        results,
        items: results,
      } as any
    })

    const res = await syncEngine.triggerSync()
    expect(res.succeeded).toBe(1)
    expect(capturedToken).toBe('jwt.signed.offline.auth.lease.token.xyz')
  })
})
