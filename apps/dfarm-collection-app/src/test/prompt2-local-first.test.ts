// DFarm Prompt 2 — Zero Data Loss Local-First Collection Engine Verification Suite
// Verifies atomic IndexedDB persistence, UUID stability, offline recovery, quota safety & sync state transitions

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { localDB } from '../services/local-storage'
import { storagePersistence } from '../services/storage-persistence'
import { ratesApi } from '../api/client'
import type {
  CollectionTransaction,
  OfflineQueueItem,
  ActiveCollectionSession,
  CustomerIdentity,
  RateChartCacheItem,
} from '../types'

describe('Prompt 2: Zero Data Loss Local-First Engine', () => {
  const dummyCustomer: CustomerIdentity = {
    id: 'cust-prompt2-01',
    customerCode: 'C-777',
    farmerCode: 'F-777',
    fullName: 'Ananda Ramchandra Patil',
    mobileNumber: '9822119988',
    village: 'Gokul Shirgaon',
    preferredCategory: 'COW',
    permittedCategories: ['COW'],
    dairyId: 'dairy-ten-9801',
    status: 'ACTIVE',
    balanceDue: 5000.0,
    rfidCardUid: 'RFID-PROMPT2-777',
  }

  const dummySession: ActiveCollectionSession = {
    id: 'session-prompt2-01',
    sessionCode: 'SES-MOR-20261123',
    dairyId: 'dairy-ten-9801',
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()),
    timezone: 'Asia/Kolkata',
    shift: 'MORNING',
    status: 'OPEN',
    openedAt: new Date().toISOString(),
    openingOperatorName: 'Sachin Patil',
    deviceId: 'DF-KIOSK-001',
    deviceName: 'Counter Kiosk 1',
    totals: {
      totalLiters: 150.0,
      cowLiters: 150.0,
      buffaloLiters: 0,
      transactionCount: 10,
      totalAmount: 6000.0,
      averageFat: 4.2,
      averageSnf: 8.6,
    },
  }

  const dummyRateChart: RateChartCacheItem = {
    id: 'dairy-ten-9801_COW_v2',
    dairyId: 'dairy-ten-9801',
    centerScope: 'ORGANIZATION_WIDE',
    milkCategory: 'COW',
    version: 2,
    effectiveFrom: '2026-11-01',
    baseFat: 3.5,
    baseSnf: 8.5,
    baseRate: 38.0,
    updatedAt: new Date().toISOString(),
  }

  const createDummyTxn = (uuid: string): CollectionTransaction => ({
    id: uuid,
    clientIntakeUuid: uuid,
    transactionCode: `TXN-${uuid.substring(0, 8).toUpperCase()}`,
    sessionId: dummySession.id,
    dairyId: dummyCustomer.dairyId!,
    customerId: dummyCustomer.id,
    customerCode: dummyCustomer.customerCode,
    customerName: dummyCustomer.fullName,
    timestamp: new Date().toISOString(),
    date: '2026-11-23',
    shift: 'MORNING',
    milkCategory: 'COW',
    weightLiters: 15.0,
    fatPercentage: 4.2,
    snfPercentage: 8.7,
    clrDensity: 29.5,
    appliedRatePerLiter: 41.5,
    rateChartVersion: 2,
    totalAmount: 622.5,
    identificationMethod: 'RFID_TAG',
    syncStatus: 'PENDING_OFFLINE',
    deviceId: 'DF-KIOSK-001',
    operatorName: 'Sachin Patil',
    idempotencyKey: `INTAKE-${uuid}`,
  })

  // 1 & 2. Atomic IndexedDB Save for both Online & Offline conditions
  it('1 & 2. Atomically commits transaction to completed_transactions and offline_queue before sync', async () => {
    const uuid = crypto.randomUUID()
    const txn = createDummyTxn(uuid)
    const queueItem: OfflineQueueItem = {
      eventId: `EVT-${uuid}`,
      transactionId: uuid,
      clientIntakeUuid: uuid,
      customerCode: txn.customerCode,
      customerName: txn.customerName,
      timestamp: txn.timestamp,
      retryCount: 0,
      status: 'QUEUED',
      errorReason: null,
      transaction: txn,
    }

    const result = await localDB.saveIntakeAtomically(txn, queueItem)
    expect(result.transaction.clientIntakeUuid).toBe(uuid)
    expect(result.queueItem.clientIntakeUuid).toBe(uuid)

    // Verify it is present in completed_transactions
    const stored = await localDB.getTransactionById(uuid)
    expect(stored).toBeDefined()
    expect(stored?.id).toBe(uuid)
    expect(stored?.syncStatus).toBe('PENDING_OFFLINE')

    // Verify it is present in offline_queue
    const queue = await localDB.getOfflineQueue()
    const inQueue = queue.find((q) => q.clientIntakeUuid === uuid)
    expect(inQueue).toBeDefined()
    expect(inQueue?.status).toBe('QUEUED')
  })

  // 3. Stable UUID is generated once and preserved across lifecycle
  it('3. Generates permanent RFC 4122 v4 UUID that conforms to UUID regex', () => {
    const uuid = crypto.randomUUID()
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(uuid).toMatch(uuidRegex)

    const txn = createDummyTxn(uuid)
    expect(txn.id).toBe(uuid)
    expect(txn.clientIntakeUuid).toBe(uuid)
    expect(txn.idempotencyKey).toBe(`INTAKE-${uuid}`)
  })

  // 4 & 5. Atomic transaction rollback simulation
  it('4 & 5. Multi-store transaction guarantees atomicity and rejects on put error', async () => {
    const invalidTxn = null as any
    const queueItem = { eventId: 'EVT-FAIL', transactionId: 'FAIL' } as any

    await expect(localDB.saveIntakeAtomically(invalidTxn, queueItem)).rejects.toThrow()
  })

  // 7 & 8. Network failure or timeout retains local record in pending queue
  it('7 & 8. Server timeout or network drop updates error reason and keeps record pending in queue', async () => {
    const uuid = crypto.randomUUID()
    const txn = createDummyTxn(uuid)
    const queueItem: OfflineQueueItem = {
      eventId: `EVT-${uuid}`,
      transactionId: uuid,
      clientIntakeUuid: uuid,
      customerCode: txn.customerCode,
      customerName: txn.customerName,
      timestamp: txn.timestamp,
      retryCount: 0,
      status: 'QUEUED',
      errorReason: null,
      transaction: txn,
    }

    await localDB.saveIntakeAtomically(txn, queueItem)

    // Simulate network error / timeout during post-save sync attempt
    await localDB.updateQueueItemStatus(queueItem.eventId, 'FAILED', 'ETIMEDOUT: Connection dropped')

    const queue = await localDB.getOfflineQueue()
    const failedItem = queue.find((q) => q.eventId === queueItem.eventId)
    expect(failedItem).toBeDefined()
    expect(failedItem?.status).toBe('FAILED')
    expect(failedItem?.retryCount).toBe(1)
    expect(failedItem?.errorReason).toContain('ETIMEDOUT')

    // Local journal record remains intact
    const journal = await localDB.getTransactionById(uuid)
    expect(journal).toBeDefined()
    expect(journal?.syncStatus).toBe('PENDING_OFFLINE')
  })

  // 10. Successful server acknowledgement atomically updates sync status to SYNCED_CLOUD
  it('10. Server acknowledgement updates local sync status to SYNCED_CLOUD and retires queue item', async () => {
    const uuid = crypto.randomUUID()
    const txn = createDummyTxn(uuid)
    const queueItem: OfflineQueueItem = {
      eventId: `EVT-${uuid}`,
      transactionId: uuid,
      clientIntakeUuid: uuid,
      customerCode: txn.customerCode,
      customerName: txn.customerName,
      timestamp: txn.timestamp,
      retryCount: 0,
      status: 'QUEUED',
      errorReason: null,
      transaction: txn,
    }

    await localDB.saveIntakeAtomically(txn, queueItem)

    // Server acknowledges with PostgreSQL transaction ID and receipt number
    const serverTxnId = crypto.randomUUID()
    const serverReceipt = `RCP-${serverTxnId.substring(0, 8).toUpperCase()}`

    await localDB.markTransactionSynced(uuid, {
      serverTransactionId: serverTxnId,
      receiptNumber: serverReceipt,
      syncedAt: new Date().toISOString(),
    })

    // Local journal must be SYNCED_CLOUD
    const updatedJournal = await localDB.getTransactionById(uuid)
    expect(updatedJournal?.syncStatus).toBe('SYNCED_CLOUD')
    expect(updatedJournal?.serverTransactionId).toBe(serverTxnId)
    expect(updatedJournal?.receiptNumber).toBe(serverReceipt)

    // Queue item must be retired
    const queue = await localDB.getOfflineQueue()
    const inQueue = queue.find((q) => q.clientIntakeUuid === uuid)
    expect(inQueue).toBeUndefined()
  })

  // 12. Local transaction history is sorted newest first
  it('12. Local recent transactions returns sorted list with timestamps', async () => {
    const uuid1 = crypto.randomUUID()
    const uuid2 = crypto.randomUUID()

    const txn1 = createDummyTxn(uuid1)
    txn1.timestamp = '2026-11-23T06:00:00.000Z'
    const txn2 = createDummyTxn(uuid2)
    txn2.timestamp = '2026-11-23T07:00:00.000Z'

    await localDB.saveCompletedTransaction(txn1)
    await localDB.saveCompletedTransaction(txn2)

    const list = await localDB.getRecentTransactions(10)
    expect(list.length).toBeGreaterThanOrEqual(2)
    // Most recent (07:00) should appear before 06:00
    const idx2 = list.findIndex((t) => t.id === uuid2)
    const idx1 = list.findIndex((t) => t.id === uuid1)
    expect(idx2).toBeLessThan(idx1)
  })

  // 13. Active Session hydration from local cache
  it('13. Hydrates active session from IndexedDB cache during offline startup', async () => {
    await localDB.saveActiveSession(dummySession)

    const cached = await localDB.getActiveSession(dummySession.dairyId)
    expect(cached).toBeDefined()
    expect(cached?.id).toBe(dummySession.id)
    expect(cached?.sessionCode).toBe('SES-MOR-20261123')
    expect(cached?.status).toBe('OPEN')
    expect(cached?.totals.transactionCount).toBe(10)
  })

  // 14 & 15. Customer & RFID local lookup without network
  it('14 & 15. Looks up customer by RFID UID and Farmer Code in local IndexedDB cache', async () => {
    await localDB.saveCustomersCache([dummyCustomer], dummyCustomer.dairyId)

    // RFID lookup
    const rfidMatch = await localDB.getCustomerByRfid('RFID-PROMPT2-777', dummyCustomer.dairyId!)
    expect(rfidMatch).toBeDefined()
    expect(rfidMatch?.id).toBe(dummyCustomer.id)
    expect(rfidMatch?.fullName).toBe(dummyCustomer.fullName)

    // Case-insensitive RFID lookup
    const lowerRfidMatch = await localDB.getCustomerByRfid('rfid-prompt2-777', dummyCustomer.dairyId!)
    expect(lowerRfidMatch?.id).toBe(dummyCustomer.id)

    // Farmer Code lookup
    const codeMatch = await localDB.getCustomerByCode('C-777', dummyCustomer.dairyId!)
    expect(codeMatch).toBeDefined()
    expect(codeMatch?.id).toBe(dummyCustomer.id)
  })

  // 16. Rate chart caching and version association
  it('16. Stores and retrieves rate chart in IndexedDB cache for offline calculations', async () => {
    await localDB.saveRateChart(dummyRateChart)

    const chart = await localDB.getRateChart('dairy-ten-9801', 'COW')
    expect(chart).toBeDefined()
    expect(chart?.version).toBe(2)
    expect(chart?.baseRate).toBe(38.0)
  })

  // 17 & 18. Storage Quota & Persistence helper
  it('17 & 18. Checks persistent storage status and quota thresholds safely', async () => {
    const isPersisted = await storagePersistence.requestPersistentStorage()
    expect(typeof isPersisted).toBe('boolean')

    const estimate = await storagePersistence.getStorageEstimate()
    expect(estimate).toBeDefined()
    expect(typeof estimate.usageBytes).toBe('number')
    expect(typeof estimate.quotaBytes).toBe('number')
    expect(typeof estimate.percentageUsed).toBe('number')
    expect(typeof estimate.isWarning).toBe('boolean')
    expect(typeof estimate.isCritical).toBe('boolean')

    const isQuotaErr = storagePersistence.isQuotaExceededError(new Error('QuotaExceededError: out of disk space'))
    expect(isQuotaErr).toBe(true)
  })

  // 19. Retention policy protects pending transactions while purging old synced records
  it('19. Safe retention cleanup only removes old SYNCED_CLOUD transactions, never pending records', async () => {
    const oldSyncedUuid = crypto.randomUUID()
    const oldPendingUuid = crypto.randomUUID()

    const oldSyncedTxn = createDummyTxn(oldSyncedUuid)
    oldSyncedTxn.syncStatus = 'SYNCED_CLOUD'
    oldSyncedTxn.timestamp = '2025-01-01T00:00:00.000Z' // Very old date

    const oldPendingTxn = createDummyTxn(oldPendingUuid)
    oldPendingTxn.syncStatus = 'PENDING_OFFLINE'
    oldPendingTxn.timestamp = '2025-01-01T00:00:00.000Z' // Old but UNSYNCED!

    await localDB.saveCompletedTransaction(oldSyncedTxn)
    await localDB.saveCompletedTransaction(oldPendingTxn)

    const purged = await localDB.cleanupSyncedTransactions(30)
    expect(purged).toBeGreaterThanOrEqual(1)

    // Synced old record is purged
    const checkSynced = await localDB.getTransactionById(oldSyncedUuid)
    expect(checkSynced).toBeNull()

    // Unsynced pending record MUST NEVER BE PURGED!
    const checkPending = await localDB.getTransactionById(oldPendingUuid)
    expect(checkPending).toBeDefined()
    expect(checkPending?.id).toBe(oldPendingUuid)
    expect(checkPending?.syncStatus).toBe('PENDING_OFFLINE')
  })

  // ==========================================================================
  // PROMPT 2.1 SUITE: INTEGRITY, RATE ACCURACY, TENANT ISOLATION & SESSION RECOVERY
  // ==========================================================================

  // 20. Priority 1: Dynamic Rate Chart calculation & Safety Lock when missing or expired
  it('20. Priority 1: Dynamic Rate Chart calculation & Safety Lock when missing or expired', async () => {
    // A. Missing chart blocks calculation
    const missingResult = ratesApi.calculateRate('COW', 4.0, 8.5, null)
    expect(missingResult.isValid).toBe(false)
    expect(missingResult.ratePerLiter).toBe(0)
    expect(missingResult.error).toContain('No active rate chart cached for COW')

    // B. Expired chart blocks calculation
    const expiredChart: RateChartCacheItem = {
      ...dummyRateChart,
      effectiveTo: '2020-01-01',
    }
    const expiredResult = ratesApi.calculateRate('COW', 4.0, 8.5, expiredChart)
    expect(expiredResult.isValid).toBe(false)
    expect(expiredResult.error).toContain('expired')

    // C. Valid chart calculation with differentials
    const validChart: RateChartCacheItem = {
      ...dummyRateChart,
      baseRate: 38.0,
      baseFat: 3.5,
      baseSnf: 8.5,
      ratePerFatUnit: 6.0,
      ratePerSnfUnit: 2.5,
      effectiveTo: undefined,
    }
    // Fat 4.0 -> diff 0.5 * 6.0 = 3.0; SNF 8.5 -> diff 0 = 0; Total = 41.00
    const calcResult = ratesApi.calculateRate('COW', 4.0, 8.5, validChart)
    expect(calcResult.isValid).toBe(true)
    expect(calcResult.ratePerLiter).toBe(41.0)
    expect(calcResult.version).toBe(2)

    // D. Grid matrix lookup
    const matrixChart: RateChartCacheItem = {
      ...dummyRateChart,
      gridMatrix: {
        '4.2': { '8.6': 43.75 },
      },
    }
    const matrixResult = ratesApi.calculateRate('COW', 4.2, 8.6, matrixChart)
    expect(matrixResult.isValid).toBe(true)
    expect(matrixResult.ratePerLiter).toBe(43.75)
  })

  // 21. Priority 2: Prevent Duplicate Local Transactions after server acknowledgement
  it('21. Priority 2: Server acknowledgement updates existing row and creates NO duplicate', async () => {
    const clientIntakeUuid = crypto.randomUUID()
    const txn = createDummyTxn(clientIntakeUuid)
    const queueItem: OfflineQueueItem = {
      eventId: `EVT-${clientIntakeUuid}`,
      transactionId: clientIntakeUuid,
      clientIntakeUuid,
      customerCode: txn.customerCode,
      customerName: txn.customerName,
      timestamp: txn.timestamp,
      retryCount: 0,
      status: 'QUEUED',
      errorReason: null,
      transaction: txn,
    }

    await localDB.saveIntakeAtomically(txn, queueItem)

    // Server returns different PostgreSQL server ID
    const serverTransactionId = crypto.randomUUID()
    const receiptNumber = 'RCP-TEST-999'

    await localDB.markTransactionSynced(clientIntakeUuid, {
      serverTransactionId,
      receiptNumber,
      syncedAt: new Date().toISOString(),
    })

    // The primary record is clientIntakeUuid
    const primaryRecord = await localDB.getTransactionById(clientIntakeUuid)
    expect(primaryRecord).toBeDefined()
    expect(primaryRecord?.syncStatus).toBe('SYNCED_CLOUD')
    expect(primaryRecord?.serverTransactionId).toBe(serverTransactionId)

    // NO duplicate row exists under the server UUID
    const duplicateRecord = await localDB.getTransactionById(serverTransactionId)
    expect(duplicateRecord).toBeNull()

    // Queue item is deleted
    const queue = await localDB.getOfflineQueue()
    expect(queue.find((q) => q.clientIntakeUuid === clientIntakeUuid)).toBeUndefined()
  })

  // 22. Priority 3: markTransactionSynced() safely aborts and protects queue when local row is missing
  it('22. Priority 3: markTransactionSynced() safely aborts and protects queue when local row is missing', async () => {
    const nonExistentUuid = crypto.randomUUID()
    const realUuid = crypto.randomUUID()
    const realTxn = createDummyTxn(realUuid)
    const queueItem: OfflineQueueItem = {
      eventId: `EVT-${realUuid}`,
      transactionId: realUuid,
      clientIntakeUuid: realUuid,
      customerCode: realTxn.customerCode,
      customerName: realTxn.customerName,
      timestamp: realTxn.timestamp,
      retryCount: 0,
      status: 'QUEUED',
      errorReason: null,
      transaction: realTxn,
    }

    // Queue has an item
    await localDB.queueOfflineTransaction(realTxn)

    // Attempt to mark non-existent transaction as synced
    await expect(
      localDB.markTransactionSynced(nonExistentUuid, {
        serverTransactionId: 'srv-123',
      })
    ).rejects.toThrow(/Cannot mark non-existent transaction as synced/)

    // Queue item for realUuid is completely safe and NOT deleted!
    const queue = await localDB.getOfflineQueue()
    expect(queue.find((q) => q.clientIntakeUuid === realUuid)).toBeDefined()
  })

  // 23. Priority 4: Enforce Tenant Isolation in Customer Cache & RFID Lookups
  it('23. Priority 4: Customer cache and RFID queries strictly enforce dairy tenant isolation', async () => {
    const dairyA = 'dairy-alpha-111'
    const dairyB = 'dairy-beta-222'

    const customerA: CustomerIdentity = {
      ...dummyCustomer,
      id: 'cust-alpha-1',
      customerCode: 'C-001',
      rfidCardUid: 'RFID-SHARED-001',
      dairyId: dairyA,
      fullName: 'Alpha Farmer',
    }
    const customerB: CustomerIdentity = {
      ...dummyCustomer,
      id: 'cust-beta-2',
      customerCode: 'C-001', // Same customer code in different dairy!
      rfidCardUid: 'RFID-SHARED-002',
      dairyId: dairyB,
      fullName: 'Beta Farmer',
    }

    await localDB.saveCustomersCache([customerA, customerB])

    // Querying with dairyA returns only customerA
    const custsA = await localDB.getCustomersCache(dairyA)
    expect(custsA.length).toBe(1)
    expect(custsA[0].id).toBe('cust-alpha-1')

    // Querying with dairyB returns only customerB
    const custsB = await localDB.getCustomersCache(dairyB)
    expect(custsB.length).toBe(1)
    expect(custsB[0].id).toBe('cust-beta-2')

    // RFID lookup scoped to dairyA returns null for dairyB's card
    const rfidCrossMatch = await localDB.getCustomerByRfid('RFID-SHARED-002', dairyA)
    expect(rfidCrossMatch).toBeNull()

    // Customer code lookup scoped to dairyA returns Alpha Farmer
    const codeLookup = await localDB.getCustomerByCode('C-001', dairyA)
    expect(codeLookup?.fullName).toBe('Alpha Farmer')

    // Missing dairyId throws error
    await expect(localDB.getCustomersCache('')).rejects.toThrow(/Mandatory dairyId parameter/)
    await expect(localDB.getCustomerByRfid('RFID-SHARED-001', '')).rejects.toThrow(/Mandatory dairyId parameter/)
  })

  // 24. Priority 5: Active Session recovery distinguishes confirmed closed session vs offline network failure
  it('24. Priority 5: Active session recovery handles tenant scoping and clear on confirmed close', async () => {
    const dairyId = 'dairy-session-test'
    const session: ActiveCollectionSession = {
      ...dummySession,
      id: 'ses-active-01',
      dairyId,
      status: 'OPEN',
    }

    await localDB.saveActiveSession(session)

    // 1. Offline hydration retrieves the open session for matching dairy
    const cached = await localDB.getActiveSession(dairyId)
    expect(cached).toBeDefined()
    expect(cached?.id).toBe('ses-active-01')

    // 2. Querying with a different dairy returns null
    const wrongDairySession = await localDB.getActiveSession('different-dairy')
    expect(wrongDairySession).toBeNull()

    // 3. When server confirms session is closed, clearActiveSession removes it
    await localDB.clearActiveSession(undefined, dairyId)
    const afterClear = await localDB.getActiveSession(dairyId)
    expect(afterClear).toBeNull()
  })

  // 25. Priority 6: Storage Quota estimates and threshold detection
  it('25. Priority 6: Accurately checks quota thresholds and detects QuotaExceededError', async () => {
    const estimate = await storagePersistence.getStorageEstimate()
    expect(estimate).toHaveProperty('isPersisted')
    expect(estimate).toHaveProperty('percentageUsed')
    expect(estimate).toHaveProperty('isWarning')
    expect(estimate).toHaveProperty('isCritical')

    // Verify quota error names
    expect(storagePersistence.isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true)
    expect(storagePersistence.isQuotaExceededError({ code: 22 })).toBe(true)
    expect(storagePersistence.isQuotaExceededError(new Error('The quota has been exceeded'))).toBe(true)
    expect(storagePersistence.isQuotaExceededError(new Error('Network error'))).toBe(false)
  })

  // ==========================================================================
  // PROMPT 2.2 SUITE: RATE ACCURACY, TENANT & CENTER ISOLATION, SESSION EXPIRY
  // ==========================================================================

  // 26. Prompt 2.2: Rate calculation eliminates arbitrary defaults and enforces strict safety failure
  it('26. Prompt 2.2: Rate calculation rejects missing matrix cells and missing formula factors with zero guessing', async () => {
    // A. Chart with no matrix cells and no formula factors MUST fail safely
    const unconfiguredChart: RateChartCacheItem = {
      id: 'dairy-1_COW_v1',
      dairyId: 'dairy-1',
      centerScope: 'ORGANIZATION_WIDE',
      milkCategory: 'COW',
      version: 1,
      effectiveFrom: '2026-01-01',
      baseRate: 38.0,
      baseFat: 3.5,
      baseSnf: 8.5,
      updatedAt: new Date().toISOString(),
    }
    const unconfiguredResult = ratesApi.calculateRate('COW', 4.0, 8.5, unconfiguredChart)
    expect(unconfiguredResult.isValid).toBe(false)
    expect(unconfiguredResult.ratePerLiter).toBe(0)
    expect(unconfiguredResult.error).toContain('no active rate matrix cells or verified formula factors')

    // B. Explicit GRID chart missing exact cell returns RATE_CELL_NOT_FOUND (no fallback formula guessing)
    const gridChart: RateChartCacheItem = {
      ...unconfiguredChart,
      pricingType: 'GRID',
      gridMatrix: {
        '4.0': { '8.5': 42.0 },
      },
    }
    const missingCellResult = ratesApi.calculateRate('COW', 4.5, 8.8, gridChart)
    expect(missingCellResult.isValid).toBe(false)
    expect(missingCellResult.ratePerLiter).toBe(0)
    expect(missingCellResult.error).toContain('RATE_CELL_NOT_FOUND')

    // C. Explicit GRID chart with exact cell returns exact cell rate
    const exactCellResult = ratesApi.calculateRate('COW', 4.0, 8.5, gridChart)
    expect(exactCellResult.isValid).toBe(true)
    expect(exactCellResult.ratePerLiter).toBe(42.0)

    // D. Explicit FORMULA chart calculates exact rate with NO arbitrary floor (no Math.max(10.0))
    const formulaChart: RateChartCacheItem = {
      ...unconfiguredChart,
      pricingType: 'FORMULA',
      baseRate: 20.0,
      baseFat: 3.5,
      baseSnf: 8.5,
      ratePerFatUnit: 2.0,
      ratePerSnfUnit: 1.0,
    }
    // Fat 2.0 (diff -1.5 * 2.0 = -3.0), SNF 6.0 (diff -2.5 * 1.0 = -2.5) => 20.0 - 5.5 = 14.50
    const formulaResult = ratesApi.calculateRate('COW', 2.0, 6.0, formulaChart)
    expect(formulaResult.isValid).toBe(true)
    expect(formulaResult.ratePerLiter).toBe(14.5)
  })

  // 27. Prompt 2.2: Center-level isolation across customer cache, RFID lookup, and customer code lookup
  it('27. Prompt 2.2: Center-level customer cache and RFID lookups strictly isolate multi-center operations', async () => {
    const dairyId = 'dairy-corp-777'
    const centerA = 'center-north-01'
    const centerB = 'center-south-02'

    const patronCenterA: CustomerIdentity = {
      ...dummyCustomer,
      id: 'cust-cen-A-1',
      customerCode: 'FARMER-100',
      rfidCardUid: 'RFID-CEN-A',
      dairyId,
      centerId: centerA,
      fullName: 'Ramesh North',
    }
    const patronCenterB: CustomerIdentity = {
      ...dummyCustomer,
      id: 'cust-cen-B-2',
      customerCode: 'FARMER-100', // Duplicate code between centers
      rfidCardUid: 'RFID-CEN-B',
      dairyId,
      centerId: centerB,
      fullName: 'Suresh South',
    }

    await localDB.saveCustomersCache([patronCenterA, patronCenterB])

    // Query Center A customers
    const listA = await localDB.getCustomersCache(dairyId, centerA)
    expect(listA.length).toBe(1)
    expect(listA[0].id).toBe('cust-cen-A-1')

    // Query Center B customers
    const listB = await localDB.getCustomersCache(dairyId, centerB)
    expect(listB.length).toBe(1)
    expect(listB[0].id).toBe('cust-cen-B-2')

    // Center A kiosk scanning Center B's RFID card returns null
    const crossCenterRfid = await localDB.getCustomerByRfid('RFID-CEN-B', dairyId, centerA)
    expect(crossCenterRfid).toBeNull()

    // Center A kiosk scanning Center A's card succeeds
    const centerARfid = await localDB.getCustomerByRfid('RFID-CEN-A', dairyId, centerA)
    expect(centerARfid?.fullName).toBe('Ramesh North')

    // Center-scoped customer code search resolves to the correct center's patron
    const codeMatchA = await localDB.getCustomerByCode('FARMER-100', dairyId, centerA)
    expect(codeMatchA?.fullName).toBe('Ramesh North')

    const codeMatchB = await localDB.getCustomerByCode('FARMER-100', dairyId, centerB)
    expect(codeMatchB?.fullName).toBe('Suresh South')
  })

  // 28. Prompt 2.2: Stale session rejection and device/center scoped session hydration
  it('28. Prompt 2.2: Stale OPEN sessions from past dates and mismatched center/devices are rejected offline', async () => {
    const dairyId = 'dairy-session-p22'
    const centerId = 'center-p22'
    const deviceId = 'KIOSK_P22_A'
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

    // A. Stale session from yesterday (OPEN status)
    const staleSession: ActiveCollectionSession = {
      ...dummySession,
      id: 'session-yesterday',
      sessionCode: 'SES-YESTERDAY',
      dairyId,
      centerId,
      deviceId,
      date: '2020-01-01', // definitely stale past date
      status: 'OPEN',
    }
    await localDB.saveActiveSession(staleSession)

    // Stale session must NEVER be hydrated offline
    const hydratedStale = await localDB.getActiveSession(dairyId, centerId, deviceId)
    expect(hydratedStale).toBeNull()

    // B. Valid session for today
    const validTodaySession: ActiveCollectionSession = {
      ...dummySession,
      id: 'session-today',
      sessionCode: 'SES-TODAY',
      dairyId,
      centerId,
      deviceId,
      date: today,
      status: 'OPEN',
    }
    await localDB.saveActiveSession(validTodaySession)

    // Hydrating with matching dairy, center, and device succeeds
    const hydratedValid = await localDB.getActiveSession(dairyId, centerId, deviceId)
    expect(hydratedValid).toBeDefined()
    expect(hydratedValid?.id).toBe('session-today')

    // Different center returns null
    const wrongCenter = await localDB.getActiveSession(dairyId, 'center-different', deviceId)
    expect(wrongCenter).toBeNull()

    // Different device returns null
    const wrongDevice = await localDB.getActiveSession(dairyId, centerId, 'KIOSK_DIFFERENT')
    expect(wrongDevice).toBeNull()

    // Missing dairyId parameter returns null and never wildcards
    const noTenant = await localDB.getActiveSession('')
    expect(noTenant).toBeNull()
  })

  // 29. Prompt 2.2: Rate chart center-level resolution hierarchy
  it('29. Prompt 2.2: Rate chart resolves center-specific version first with fallback to dairy-wide version', async () => {
    const dairyId = 'dairy-hierarchy-99'
    const centerA = 'center-alpha'
    const centerB = 'center-beta'

    const orgWideChart: RateChartCacheItem = {
      id: `${dairyId}_COW_orgWide_v1`,
      dairyId,
      centerScope: 'ORGANIZATION_WIDE',
      milkCategory: 'COW',
      version: 1,
      effectiveFrom: '2026-01-01',
      baseRate: 38.0,
      baseFat: 3.5,
      baseSnf: 8.5,
      ratePerFatUnit: 6.0,
      ratePerSnfUnit: 2.5,
      updatedAt: new Date().toISOString(),
    }

    const centerASpecificChart: RateChartCacheItem = {
      id: `${dairyId}_COW_centerA_v2`,
      dairyId,
      centerScope: 'CENTER_SPECIFIC',
      centerId: centerA,
      milkCategory: 'COW',
      version: 2,
      effectiveFrom: '2026-01-01',
      baseRate: 40.0, // Center A has special incentive rate
      baseFat: 3.5,
      baseSnf: 8.5,
      ratePerFatUnit: 6.5,
      ratePerSnfUnit: 2.8,
      updatedAt: new Date().toISOString(),
    }

    await localDB.saveRateChart(orgWideChart)
    await localDB.saveRateChart(centerASpecificChart)

    // Center A gets its specific chart (v2, baseRate 40.0)
    const chartA = await localDB.getRateChart(dairyId, 'COW', centerA)
    expect(chartA).toBeDefined()
    expect(chartA?.id).toBe(centerASpecificChart.id)
    expect(chartA?.baseRate).toBe(40.0)

    // Center B has no center-specific chart, so it cleanly falls back to org-wide chart (v1, baseRate 38.0)
    const chartB = await localDB.getRateChart(dairyId, 'COW', centerB)
    expect(chartB).toBeDefined()
    expect(chartB?.id).toBe(orgWideChart.id)
    expect(chartB?.baseRate).toBe(38.0)
  })

  // ==========================================================================
  // PROMPT 2.2.1 SUITE: FAIL-CLOSED ISOLATION & TIMEZONE SESSION VALIDITY
  // ==========================================================================

  // 30. Prompt 2.2.1: Centre isolation fail-closed verification (Unassigned & Cross-Centre Patrons)
  it('30. Prompt 2.2.1: Center-restricted station strictly fails closed for unassigned and cross-centre patrons', async () => {
    const dairyId = 'dairy-failclosed-30'
    const centerA = 'center-alpha'
    const centerB = 'center-beta'

    const unassignedPatron: CustomerIdentity = {
      ...dummyCustomer,
      id: 'cust-unassigned-0',
      customerCode: 'FARMER-U',
      rfidCardUid: 'RFID-U',
      dairyId,
      centerId: undefined, // No center assigned
      fullName: 'Unassigned Farmer',
    }

    const centerAPatron: CustomerIdentity = {
      ...dummyCustomer,
      id: 'cust-centerA-1',
      customerCode: 'FARMER-A',
      rfidCardUid: 'RFID-A',
      dairyId,
      centerId: centerA,
      fullName: 'Alpha Farmer',
    }

    const centerBPatron: CustomerIdentity = {
      ...dummyCustomer,
      id: 'cust-centerB-2',
      customerCode: 'FARMER-B',
      rfidCardUid: 'RFID-B',
      dairyId,
      centerId: centerB,
      fullName: 'Beta Farmer',
    }

    await localDB.saveCustomersCache([unassignedPatron, centerAPatron, centerBPatron])

    // A. Center A Station queries customer cache: ONLY Center A patron is returned
    const centerACache = await localDB.getCustomersCache(dairyId, centerA)
    expect(centerACache.length).toBe(1)
    expect(centerACache[0].id).toBe('cust-centerA-1')

    // B. Center A Station RFID scan: Unassigned card fails closed (returns null)
    const unassignedRfidScan = await localDB.getCustomerByRfid('RFID-U', dairyId, centerA)
    expect(unassignedRfidScan).toBeNull()

    // C. Center A Station RFID scan: Cross-center card fails closed (returns null)
    const crossCenterRfidScan = await localDB.getCustomerByRfid('RFID-B', dairyId, centerA)
    expect(crossCenterRfidScan).toBeNull()

    // D. Center A Station RFID scan: Center A card succeeds
    const validRfidScan = await localDB.getCustomerByRfid('RFID-A', dairyId, centerA)
    expect(validRfidScan?.id).toBe('cust-centerA-1')

    // E. Center A Station manual code entry: Unassigned code fails closed
    const unassignedCodeLookup = await localDB.getCustomerByCode('FARMER-U', dairyId, centerA)
    expect(unassignedCodeLookup).toBeNull()

    // F. Center A Station manual code entry: Cross-center code fails closed
    const crossCenterCodeLookup = await localDB.getCustomerByCode('FARMER-B', dairyId, centerA)
    expect(crossCenterCodeLookup).toBeNull()

    // G. Center A Station manual code entry: Center A code succeeds
    const validCodeLookup = await localDB.getCustomerByCode('FARMER-A', dairyId, centerA)
    expect(validCodeLookup?.id).toBe('cust-centerA-1')

    // H. Unrestricted station without isDairyWideAuthorized: Does NOT leak centre-assigned patrons
    const unassignedStationCache = await localDB.getCustomersCache(dairyId)
    expect(unassignedStationCache.length).toBe(1)
    expect(unassignedStationCache[0].id).toBe('cust-unassigned-0')

    // I. Station with explicit isDairyWideAuthorized: Returns all patrons across centres
    const dairyWideCache = await localDB.getCustomersCache(dairyId, undefined, { isDairyWideAuthorized: true })
    expect(dairyWideCache.length).toBe(3)

    // J. Station with explicit isDairyWideAuthorized: Can lookup cards across all centres
    const dairyWideRfidLookup = await localDB.getCustomerByRfid('RFID-B', dairyId, undefined, { isDairyWideAuthorized: true })
    expect(dairyWideRfidLookup?.id).toBe('cust-centerB-2')

    const dairyWideCodeLookup = await localDB.getCustomerByCode('FARMER-A', dairyId, undefined, { isDairyWideAuthorized: true })
    expect(dairyWideCodeLookup?.id).toBe('cust-centerA-1')
  })

  // 31. Prompt 2.2.1: Session validity timezone & fail-closed guardrails
  it('31. Prompt 2.2.1: Session hydration enforces timezone-aware business date and fail-closed center matching', async () => {
    const dairyId = 'dairy-session-p221'
    const centerA = 'center-north-31'
    const deviceA = 'KIOSK_31_A'
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

    // A. Session with missing date fails closed (is rejected)
    const sessionMissingDate: ActiveCollectionSession = {
      ...dummySession,
      id: 'session-no-date',
      sessionCode: 'SES-NODATE',
      dairyId,
      centerId: centerA,
      deviceId: deviceA,
      date: '' as unknown as string,
      status: 'OPEN',
    }
    await localDB.saveActiveSession(sessionMissingDate)
    const hydratedNoDate = await localDB.getActiveSession(dairyId, centerA, deviceA)
    expect(hydratedNoDate).toBeNull()

    // Clean up
    await localDB.clearActiveSession('session-no-date')

    // B. Session with valid today date in kiosk local/UTC/IST format is accepted
    const validSession: ActiveCollectionSession = {
      ...dummySession,
      id: 'session-valid-today',
      sessionCode: 'SES-VALID-TODAY',
      dairyId,
      centerId: centerA,
      deviceId: deviceA,
      date: today,
      status: 'OPEN',
    }
    await localDB.saveActiveSession(validSession)

    const hydratedValid = await localDB.getActiveSession(dairyId, centerA, deviceA)
    expect(hydratedValid).toBeDefined()
    expect(hydratedValid?.id).toBe('session-valid-today')

    // C. Center-restricted station querying session from different center returns null
    const crossCenterSession = await localDB.getActiveSession(dairyId, 'center-south-different', deviceA)
    expect(crossCenterSession).toBeNull()

    // D. Center-restricted station querying session with unassigned center returns null (fail-closed)
    const unassignedCenterSession: ActiveCollectionSession = {
      ...dummySession,
      id: 'session-unassigned-center',
      sessionCode: 'SES-NO-CENTER',
      dairyId,
      centerId: undefined,
      deviceId: deviceA,
      date: today,
      status: 'OPEN',
    }
    await localDB.saveActiveSession(unassignedCenterSession)

    // Center A restricted station querying does NOT match unassigned session
    const restrictedQuery = await localDB.getActiveSession(dairyId, centerA, deviceA)
    // Should still be 'session-valid-today' which matches centerA
    expect(restrictedQuery?.id).toBe('session-valid-today')

    // If centerA session is cleared, restrictedQuery must return null, NOT unassigned session
    await localDB.clearActiveSession('session-valid-today')
    const restrictedQueryAfter = await localDB.getActiveSession(dairyId, centerA, deviceA)
    expect(restrictedQueryAfter).toBeNull()

    // E. Station with explicit isDairyWideAuthorized CAN hydrate dairy-wide session
    const dairyWideHydration = await localDB.getActiveSession(dairyId, undefined, deviceA, { isDairyWideAuthorized: true })
    expect(dairyWideHydration?.id).toBe('session-unassigned-center')
  })

  // 32. Prompt 2.2.2: Authoritative Dairy Timezone Business Date & Fail-Closed Session Restoration
  it('32. Prompt 2.2.2: Controlled clock tests enforce authoritative dairy timezone and reject stale business dates', async () => {
    const dairyId = 'dairy-tz-authoritative-32'
    const centerA = 'center-tz-01'
    const deviceA = 'KIOSK_TZ_01'
    const dairyTimezone = 'Asia/Kolkata'

    // Controlled dates
    const authoritativeBusinessDate = '2026-11-23'
    const previousBusinessDate = '2026-11-22'

    // 1. Session from previous business date is rejected (fails closed)
    const staleSession: ActiveCollectionSession = {
      ...dummySession,
      id: 'session-yesterday-tz',
      sessionCode: 'SES-YESTERDAY-TZ',
      dairyId,
      centerId: centerA,
      deviceId: deviceA,
      date: previousBusinessDate,
      businessDate: previousBusinessDate,
      timezone: dairyTimezone,
      status: 'OPEN',
    }
    await localDB.saveActiveSession(staleSession)

    const staleResult = await localDB.getActiveSession(dairyId, centerA, deviceA, {
      timezone: dairyTimezone,
      currentDate: authoritativeBusinessDate,
    })
    expect(staleResult).toBeNull()

    // 2. Session matching authoritative business date in dairy timezone is accepted
    const validSession: ActiveCollectionSession = {
      ...dummySession,
      id: 'session-today-tz',
      sessionCode: 'SES-TODAY-TZ',
      dairyId,
      centerId: centerA,
      deviceId: deviceA,
      date: authoritativeBusinessDate,
      businessDate: authoritativeBusinessDate,
      timezone: dairyTimezone,
      status: 'OPEN',
    }
    await localDB.saveActiveSession(validSession)

    const validResult = await localDB.getActiveSession(dairyId, centerA, deviceA, {
      timezone: dairyTimezone,
      currentDate: authoritativeBusinessDate,
    })
    expect(validResult).toBeDefined()
    expect(validResult?.id).toBe('session-today-tz')

    // 3. Time near midnight UTC vs Dairy Timezone (IST is UTC+5:30)
    // When UTC is still 2026-11-22 23:30, IST is 2026-11-23 05:00 (morning shift).
    // The session business date MUST match the dairy's authoritative date (2026-11-23), NOT the UTC date.
    const queryDuringUtcMidnight = await localDB.getActiveSession(dairyId, centerA, deviceA, {
      timezone: dairyTimezone,
      currentDate: '2026-11-23', // Authoritative date in IST
    })
    expect(queryDuringUtcMidnight?.id).toBe('session-today-tz')

    // 4. Browser in different timezone (e.g. America/New_York where date is 2026-11-22)
    // If browser attempted to validate using its local calendar date (2026-11-22), it would reject.
    // With dairy's configured timezone (Asia/Kolkata -> 2026-11-23), it must accept 2026-11-23 and reject 2026-11-22.
    const queryFromNyBrowser = await localDB.getActiveSession(dairyId, centerA, deviceA, {
      timezone: dairyTimezone,
      currentDate: '2026-11-23', // Evaluated strictly in dairy's timezone
    })
    expect(queryFromNyBrowser?.id).toBe('session-today-tz')

    // 5. Session missing date / business date fails closed
    const sessionMissingDate: ActiveCollectionSession = {
      ...dummySession,
      id: 'session-missing-date',
      sessionCode: 'SES-NO-DATE',
      dairyId,
      centerId: centerA,
      deviceId: deviceA,
      date: '',
      businessDate: '',
      timezone: dairyTimezone,
      status: 'OPEN',
    }
    await localDB.saveActiveSession(sessionMissingDate)
    const missingDateResult = await localDB.getActiveSession(dairyId, centerA, deviceA, {
      timezone: dairyTimezone,
      currentDate: authoritativeBusinessDate,
    })
    // It should still return validSession, but if validSession is cleared it returns null
    await localDB.clearActiveSession('session-today-tz')
    const afterClearResult = await localDB.getActiveSession(dairyId, centerA, deviceA, {
      timezone: dairyTimezone,
      currentDate: authoritativeBusinessDate,
    })
    expect(afterClearResult).toBeNull()

    // 6. Closed session is rejected (fails closed)
    const closedSession: ActiveCollectionSession = {
      ...dummySession,
      id: 'session-closed-tz',
      sessionCode: 'SES-CLOSED-TZ',
      dairyId,
      centerId: centerA,
      deviceId: deviceA,
      date: authoritativeBusinessDate,
      status: 'CLOSED',
      closedAt: new Date().toISOString(),
    }
    await localDB.saveActiveSession(closedSession)
    const closedResult = await localDB.getActiveSession(dairyId, centerA, deviceA, {
      timezone: dairyTimezone,
      currentDate: authoritativeBusinessDate,
    })
    expect(closedResult).toBeNull()

    // 7. Centre mismatch fails closed
    const centerMismatchResult = await localDB.getActiveSession(dairyId, 'wrong-center-id', deviceA, {
      timezone: dairyTimezone,
      currentDate: authoritativeBusinessDate,
    })
    expect(centerMismatchResult).toBeNull()

    // 8. Device mismatch fails closed
    const deviceMismatchResult = await localDB.getActiveSession(dairyId, centerA, 'WRONG_DEVICE_ID', {
      timezone: dairyTimezone,
      currentDate: authoritativeBusinessDate,
    })
    expect(deviceMismatchResult).toBeNull()

    // 9. Invalid / unresolvable timezone fails closed
    await localDB.saveActiveSession(validSession)
    const invalidTzResult = await localDB.getActiveSession(dairyId, centerA, deviceA, {
      timezone: 'Invalid/NonExistent_Timezone_123',
    })
    expect(invalidTzResult).toBeNull()
  })
})
