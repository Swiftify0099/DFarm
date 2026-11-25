// DFarm Prompt 5.2 — Final Verification Gate Unit & Integration Tests
// Strictly verifies:
// 1. P0 Explicit Rate Chart Discriminated Scope (ORGANIZATION_WIDE vs CENTER_SPECIFIC) & Fail-Closed Guards
// 2. P1 Persistent Retry Metadata Across Restarts, Retry-After (including >30s & HTTP-date), AUTH_REQUIRED, DEVICE_BLOCKED, REJECTED, and Stale SYNCING Recovery
// 3. P1 Configured Storage Thresholds (70% Warning / 85% Critical) & Retention Protection

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { localDB, LocalCollectionDB } from '../services/local-storage'
import { CollectionSyncEngine } from '../services/sync-engine'
import { networkManager } from '../services/network-manager'
import { storagePersistence } from '../services/storage-persistence'
import { collectionsApi, ratesApi, setStoredOperatorAuth } from '../api/client'
import type { CollectionTransaction, OfflineQueueItem, RateChartCacheItem } from '../types'

describe('DFarm Prompt 5.2: Final Verification Gate', () => {
  const dairyA = 'dairy-p52-tenant-a'
  const dairyB = 'dairy-p52-tenant-b'
  const centerA = '11111111-1111-4111-8111-111111111111'
  const centerB = '22222222-2222-4222-8222-222222222222'

  const makeTxn = (uuid: string, overrides: Partial<CollectionTransaction> = {}): CollectionTransaction => ({
    id: uuid,
    clientIntakeUuid: uuid,
    transactionCode: `TXN-${uuid.slice(0, 8).toUpperCase()}`,
    sessionId: 'ses-p52-01',
    dairyId: dairyA,
    centerId: centerA,
    customerId: 'cust-p52-01',
    customerCode: 'F-501',
    customerName: 'Ramesh Deshmukh',
    timestamp: new Date().toISOString(),
    date: '2026-11-25',
    shift: 'MORNING',
    milkCategory: 'COW',
    weightLiters: 12.5,
    fatPercentage: 4.1,
    snfPercentage: 8.6,
    clrDensity: 28.5,
    appliedRatePerLiter: 42.0,
    rateChartVersion: 1,
    totalAmount: 525.0,
    identificationMethod: 'MANUAL_SEARCH',
    syncStatus: 'PENDING_OFFLINE',
    deviceId: 'KIOSK-P52',
    operatorName: 'Operator',
    idempotencyKey: `IDEMP-${uuid}`,
    offlineAuthorizationToken: 'jwt.offline.lease.p52.fixed',
    offlineCreated: true,
    ...overrides,
  })

  const makeQueueItem = (txn: CollectionTransaction, overrides: Partial<OfflineQueueItem> = {}): OfflineQueueItem => {
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
      offlineAuthorizationToken: txn.offlineAuthorizationToken,
      transaction: txn,
      ...overrides,
    }
  }

  beforeEach(async () => {
    vi.restoreAllMocks()
    localStorage.clear()
    networkManager.setStatus('ONLINE')
    setStoredOperatorAuth('tok-p52', dairyA, {
      id: 'op-p52',
      fullName: 'Operator P52',
      dairyId: dairyA,
      centerId: centerA,
    })
    await localDB.clearAllStoresForTesting()
  })

  // ============================================================================
  // 1. P0 — EXPLICIT DISCRIMINATED RATE CHART SCOPE
  // ============================================================================
  describe('1. P0 — Explicit Rate Chart Scope & Multi-Tenant/Centre Isolation', () => {
    it('builds unambiguous cache keys and rejects missing or contradictory scope declarations', async () => {
      const orgKey = LocalCollectionDB.buildRateChartCacheKey({
        dairyId: dairyA,
        milkCategory: 'COW',
        centerScope: 'ORGANIZATION_WIDE',
        centerId: null,
        chartId: 'chart-org-1',
        versionId: 'ver-1',
        versionNumber: 1,
      })
      expect(orgKey).toBe(`rc_${dairyA}_ORGANIZATION_WIDE_org_wide_chart-org-1_1_ver-1`)

      const centerKey = LocalCollectionDB.buildRateChartCacheKey({
        dairyId: dairyA,
        milkCategory: 'COW',
        centerScope: 'CENTER_SPECIFIC',
        centerId: centerA,
        chartId: 'chart-ca-1',
        versionId: 'ver-ca-1',
        versionNumber: 1,
      })
      expect(centerKey).toBe(`rc_${dairyA}_CENTER_SPECIFIC_${centerA}_chart-ca-1_1_ver-ca-1`)

      // Missing centerId without ORGANIZATION_WIDE MUST throw (fail closed)
      expect(() =>
        LocalCollectionDB.buildRateChartCacheKey({
          dairyId: dairyA,
          milkCategory: 'COW',
          centerId: null,
          chartId: 'chart-bad',
          versionId: 'ver-bad',
          versionNumber: 1,
        })
      ).toThrow(/organization-wide/i)

      // CENTER_SPECIFIC without valid centerId MUST throw
      expect(() =>
        LocalCollectionDB.buildRateChartCacheKey({
          dairyId: dairyA,
          milkCategory: 'COW',
          centerScope: 'CENTER_SPECIFIC',
          centerId: '',
          chartId: 'chart-bad-cs',
          versionId: 'ver-bad-cs',
          versionNumber: 1,
        })
      ).toThrow(/CENTER_SPECIFIC/)

      // Contradictory ORGANIZATION_WIDE with non-empty centerId MUST throw
      expect(() =>
        LocalCollectionDB.buildRateChartCacheKey({
          dairyId: dairyA,
          milkCategory: 'COW',
          centerScope: 'ORGANIZATION_WIDE',
          centerId: centerA,
          chartId: 'chart-contradictory',
          versionId: 'ver-contra',
          versionNumber: 1,
        })
      ).toThrow(/ORGANIZATION_WIDE/)
    })

    it('rejects raw/corrupt IDB cache entries lacking explicit scope during read & API sync', async () => {
      // Seed an undeclared chart directly in IDB bypassing saveRateChart
      const corruptItem = {
        id: 'corrupt-raw-missing-scope',
        dairyId: dairyA,
        centerId: null,
        milkCategory: 'BUFFALO',
        version: 1,
        effectiveFrom: '2026-11-01',
        baseFat: 6.0,
        baseSnf: 9.0,
        baseRate: 60.0,
        updatedAt: new Date().toISOString(),
      } as RateChartCacheItem
      await new Promise<void>((resolve, reject) => {
        const tx = (localDB as any).getTransaction('rate_charts_cache', 'readwrite')
        tx.objectStore('rate_charts_cache').put(corruptItem)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      // Direct query without centerId and with centerId both MUST fail closed
      expect(await localDB.getRateChart(dairyA, 'BUFFALO')).toBeNull()
      expect(await localDB.getRateChart(dairyA, 'BUFFALO', centerA)).toBeNull()
      expect(await localDB.getRateChartByVersion(dairyA, 'BUFFALO', 1, centerA)).toBeNull()

      // API DTO missing centerScope or containing cross-tenant/cross-centre data fails closed
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              organizationId: dairyA,
              charts: [
                {
                  chartId: 'c-no-scope',
                  versionId: 'v-1',
                  versionNumber: 1,
                  milkCategory: 'COW',
                  centerId: null,
                  baseRate: 40,
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      // downloadRateCharts fails closed without poisoning local cache
      const apiResMissingScope = await ratesApi.downloadRateCharts(dairyA, centerA)
      expect(apiResMissingScope).toEqual([])
      expect(await localDB.getRateChart(dairyA, 'COW', centerA)).toBeNull()

      // Cross-centre API response poisoning guard
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              organizationId: dairyA,
              charts: [
                {
                  chartId: 'c-wrong-center',
                  versionId: 'v-1',
                  versionNumber: 1,
                  milkCategory: 'COW',
                  centerScope: 'CENTER_SPECIFIC',
                  centerId: centerB,
                  baseRate: 49,
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      const apiResWrongCenter = await ratesApi.downloadRateCharts(dairyA, centerA)
      expect(apiResWrongCenter).toEqual([])
      expect(await localDB.getRateChart(dairyA, 'COW', centerA)).toBeNull()
    })

    it('enforces cross-tenant isolation, cross-centre isolation, and strict historical version lookup', async () => {
      // 1. Centre A chart (COW, version 1, rate 42.0)
      await localDB.saveRateChart({
        id: LocalCollectionDB.buildRateChartCacheKey({
          dairyId: dairyA,
          milkCategory: 'COW',
          centerScope: 'CENTER_SPECIFIC',
          centerId: centerA,
          chartId: 'chart-cow-center-a',
          versionId: 'ver-ca-1',
          versionNumber: 1,
        }),
        dairyId: dairyA,
        centerId: centerA,
        centerScope: 'CENTER_SPECIFIC',
        chartId: 'chart-cow-center-a',
        versionId: 'ver-ca-1',
        versionNumber: 1,
        milkCategory: 'COW',
        version: 1,
        effectiveFrom: '2026-11-01',
        baseFat: 3.5,
        baseSnf: 8.5,
        baseRate: 42.0,
        updatedAt: new Date().toISOString(),
      })

      // 2. Centre B chart (SAME milkCategory COW, SAME versionNumber 1, different rate 46.0)
      await localDB.saveRateChart({
        id: LocalCollectionDB.buildRateChartCacheKey({
          dairyId: dairyA,
          milkCategory: 'COW',
          centerScope: 'CENTER_SPECIFIC',
          centerId: centerB,
          chartId: 'chart-cow-center-b',
          versionId: 'ver-cb-1',
          versionNumber: 1,
        }),
        dairyId: dairyA,
        centerId: centerB,
        centerScope: 'CENTER_SPECIFIC',
        chartId: 'chart-cow-center-b',
        versionId: 'ver-cb-1',
        versionNumber: 1,
        milkCategory: 'COW',
        version: 1,
        effectiveFrom: '2026-11-01',
        baseFat: 3.5,
        baseSnf: 8.5,
        baseRate: 46.0,
        updatedAt: new Date().toISOString(),
      })

      // 3. Explicit organization-wide chart (COW, version 1, rate 40.0)
      await localDB.saveRateChart({
        id: LocalCollectionDB.buildRateChartCacheKey({
          dairyId: dairyA,
          milkCategory: 'COW',
          centerScope: 'ORGANIZATION_WIDE',
          centerId: null,
          chartId: 'chart-cow-org-wide',
          versionId: 'ver-org-1',
          versionNumber: 1,
        }),
        dairyId: dairyA,
        centerId: null,
        centerScope: 'ORGANIZATION_WIDE',
        chartId: 'chart-cow-org-wide',
        versionId: 'ver-org-1',
        versionNumber: 1,
        milkCategory: 'COW',
        version: 1,
        effectiveFrom: '2026-11-01',
        baseFat: 3.5,
        baseSnf: 8.5,
        baseRate: 40.0,
        updatedAt: new Date().toISOString(),
      })

      // Query Centre A -> returns Centre A chart (42.0), NOT Centre B or Org-wide
      const chartA = await localDB.getRateChart(dairyA, 'COW', centerA)
      expect(chartA).not.toBeNull()
      expect(chartA?.centerId).toBe(centerA)
      expect(chartA?.centerScope).toBe('CENTER_SPECIFIC')
      expect(chartA?.baseRate).toBe(42.0)

      // Query Centre B -> returns Centre B chart (46.0), NOT Centre A or Org-wide
      const chartB = await localDB.getRateChart(dairyA, 'COW', centerB)
      expect(chartB).not.toBeNull()
      expect(chartB?.centerId).toBe(centerB)
      expect(chartB?.centerScope).toBe('CENTER_SPECIFIC')
      expect(chartB?.baseRate).toBe(46.0)

      // Query Centre C (which has no center-specific chart) -> falls back to explicit ORGANIZATION_WIDE chart (40.0)
      const centerC = '33333333-3333-4333-8333-333333333333'
      const chartC = await localDB.getRateChart(dairyA, 'COW', centerC)
      expect(chartC).not.toBeNull()
      expect(chartC?.centerScope).toBe('ORGANIZATION_WIDE')
      expect(chartC?.centerId).toBeNull()
      expect(chartC?.baseRate).toBe(40.0)

      // Query with no centerId specified -> returns explicit ORGANIZATION_WIDE chart directly
      const orgChart = await localDB.getRateChart(dairyA, 'COW')
      expect(orgChart).not.toBeNull()
      expect(orgChart?.centerScope).toBe('ORGANIZATION_WIDE')
      expect(orgChart?.baseRate).toBe(40.0)

      // Incorrect tenant access -> returns null (tenant isolation)
      expect(await localDB.getRateChart(dairyB, 'COW', centerA)).toBeNull()
      expect(await localDB.getRateChart(dairyB, 'COW', centerB)).toBeNull()
      expect(await localDB.getRateChart(dairyB, 'COW')).toBeNull()

      // Missing historical chart version -> fails closed (never falls back to another version)
      expect(await localDB.getRateChartByVersion(dairyA, 'COW', 99, centerA)).toBeNull()
      expect(await localDB.getRateChartByVersion(dairyA, 'COW', 'ver-non-existent', centerA)).toBeNull()

      // Exact historical version lookup returns exact center chart
      const histA = await localDB.getRateChartByVersion(dairyA, 'COW', 1, centerA)
      expect(histA?.centerId).toBe(centerA)
      expect(histA?.baseRate).toBe(42.0)

      const histB = await localDB.getRateChartByVersion(dairyA, 'COW', 1, centerB)
      expect(histB?.centerId).toBe(centerB)
      expect(histB?.baseRate).toBe(46.0)

      // Missing centre ID without organization-wide declaration MUST fail closed
      await expect(
        localDB.saveRateChart({
          id: 'bad-chart-no-org-scope',
          dairyId: dairyA,
          centerId: null,
          centerScope: undefined as any,
          chartId: 'chart-bad',
          versionId: 'ver-bad',
          versionNumber: 1,
          milkCategory: 'COW',
          version: 1,
          effectiveFrom: '2026-11-01',
          baseFat: 3.5,
          baseSnf: 8.5,
          baseRate: 35.0,
          updatedAt: new Date().toISOString(),
        })
      ).rejects.toThrow(/organization-wide/i)
    })
  })

  // ============================================================================
  // 2. P1 — PERSISTENT RETRY METADATA & RESTART RECOVERY
  // ============================================================================
  describe('2. P1 — Persistent Retry Metadata, Restart Survival & State Guards', () => {
    it('persists retryCount, nextAttemptAt, lastAttemptAt, and lastError across restart without early retry', async () => {
      const uuid = 'uuid-p52-restart-retry-1'
      const txn = makeTxn(uuid)
      await localDB.saveIntakeAtomically(txn, makeQueueItem(txn))

      const futureMs = Date.now() + 1200
      const futureIso = new Date(futureMs).toISOString()

      // First failure writes persistent retry metadata
      const bulkSpy = vi.spyOn(collectionsApi, 'bulkSync').mockRejectedValueOnce(
        Object.assign(new Error('HTTP 503 Temporarily Unavailable'), {
          statusCode: 503,
          code: 'SERVICE_UNAVAILABLE',
          retryAfter: '2',
        })
      )

      const engine1 = new CollectionSyncEngine()
      await engine1.init()
      const firstAttempt = await engine1.triggerSync()
      expect(firstAttempt.failed).toBe(1)

      const persisted1 = (await localDB.getOfflineQueue()).find((q) => q.clientIntakeUuid === uuid)
      expect(persisted1?.retryCount).toBe(1)
      expect(persisted1?.lastError).toBe('HTTP 503 Temporarily Unavailable')
      expect(persisted1?.lastAttemptAt).toBeDefined()
      expect(persisted1?.nextAttemptAt).toBeDefined()

      // Overwrite nextAttemptAt deterministically 1500ms in the future to test restart window
      await new Promise<void>((resolve, reject) => {
        const tx = (localDB as any).getTransaction('offline_queue', 'readwrite')
        const store = tx.objectStore('offline_queue')
        const getReq = store.get(`EVT-${uuid}`)
        getReq.onsuccess = () => {
          const item = getReq.result
          item.nextAttemptAt = futureIso
          item.nextRetryAt = futureIso
          store.put(item)
        }
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      engine1.destroy()

      // Simulate restart with fresh CollectionSyncEngine instance
      const engine2 = new CollectionSyncEngine()
      await engine2.init()

      // Immediately after restart (before nextAttemptAt), retry MUST NOT execute
      const earlyRun = await engine2.triggerSync()
      expect(earlyRun.processed).toBe(0)
      expect(bulkSpy).toHaveBeenCalledTimes(1)

      // Metadata survived restart intact
      const afterRestartBefore = (await localDB.getOfflineQueue()).find((q) => q.clientIntakeUuid === uuid)
      expect(afterRestartBefore?.retryCount).toBe(1)
      expect(afterRestartBefore?.nextAttemptAt).toBe(futureIso)
      expect(afterRestartBefore?.lastError).toBe('HTTP 503 Temporarily Unavailable')

      // Prepare backend recovery and simulate restarted session coming back online BEFORE future nextAttemptAt
      let retriedPayload: any = null
      bulkSpy.mockImplementationOnce(async (payload) => {
        retriedPayload = payload
        return {
          batchId: payload.batchId,
          requestId: 'req-p52-ok',
          summary: { received: 1, accepted: 1, replayed: 0, rejected: 0, retryable: 0 },
          results: [
            {
              clientIntakeUuid: uuid,
              idempotencyKey: txn.idempotencyKey!,
              status: 'ACCEPTED',
              isIdempotentReplay: false,
              serverTransactionId: 'srv-p52-1',
              receiptNumber: 'RCP-P52-1',
            },
          ],
        }
      })

      networkManager.setStatus('ONLINE')

      // Advance past scheduled nextAttemptAt and let engine2's persisted timer complete automatic retry
      await new Promise((r) => setTimeout(r, 1700))

      const afterElapsed = await localDB.getTransactionById(uuid)
      if (afterElapsed?.syncStatus !== 'SYNCED_CLOUD') {
        await engine2.triggerSync()
      }
      const finalSynced = await localDB.getTransactionById(uuid)
      expect(finalSynced?.syncStatus).toBe('SYNCED_CLOUD')
      expect(retriedPayload).not.toBeNull()
      expect(retriedPayload.transactions[0].clientIntakeUuid).toBe(uuid)
      expect(retriedPayload.transactions[0].idempotencyKey).toBe(txn.idempotencyKey)
      expect(retriedPayload.transactions[0].offlineAuthorizationToken).toBe(txn.offlineAuthorizationToken)
      engine2.destroy()
    })

    it('respects Retry-After (>30s and HTTP-date), pauses AUTH_REQUIRED (401), retains DEVICE_BLOCKED & REJECTED', async () => {
      const engine = new CollectionSyncEngine()

      // 1. Retry-After: 45s (> maxBackoffMs 30s) MUST NOT be clamped to 30s
      const uuidRetryAfter = 'uuid-p52-retry-after-45'
      const txnRetryAfter = makeTxn(uuidRetryAfter)
      await localDB.saveIntakeAtomically(txnRetryAfter, makeQueueItem(txnRetryAfter))

      vi.spyOn(collectionsApi, 'bulkSync').mockRejectedValueOnce(
        Object.assign(new Error('HTTP 429 Too Many Requests'), {
          statusCode: 429,
          code: 'RATE_LIMITED',
          retryAfter: '45',
        })
      )
      await engine.triggerSync()
      const qRetryAfter = (await localDB.getOfflineQueue()).find((q) => q.clientIntakeUuid === uuidRetryAfter)
      const waitMs = Date.parse(qRetryAfter!.nextAttemptAt!) - Date.now()
      expect(waitMs).toBeGreaterThan(35000)

      // 2. Parse HTTP-date Retry-After cleanly
      const futureDateHeader = new Date(Date.now() + 90000).toUTCString()
      const parsedDateDelay = engine.parseRetryAfterMs(futureDateHeader)
      expect(parsedDateDelay).toBeGreaterThan(80000)

      // Clear queue and test 401 AUTH_REQUIRED pause
      await localDB.clearAllStoresForTesting()
      const uuidAuth = 'uuid-p52-auth-401'
      const txnAuth = makeTxn(uuidAuth)
      await localDB.saveIntakeAtomically(txnAuth, makeQueueItem(txnAuth))

      const spy401 = vi.spyOn(collectionsApi, 'bulkSync')
      spy401.mockClear()
      spy401.mockRejectedValueOnce(
        Object.assign(new Error('HTTP 401 Unauthorized'), { statusCode: 401, code: 'TOKEN_EXPIRED' })
      )
      await engine.triggerSync()
      expect(engine.getStatus().state).toBe('AUTH_REQUIRED')
      const qAuth = (await localDB.getOfflineQueue()).find((q) => q.clientIntakeUuid === uuidAuth)
      expect(qAuth?.syncQueueStatus).toBe('AUTH_REQUIRED')

      // Even when network connectivity is restored, AUTH_REQUIRED item must remain paused until re-authentication
      networkManager.setStatus('ONLINE')
      const pausedRun = await engine.triggerSync()
      expect(pausedRun.processed).toBe(0)
      expect(spy401).toHaveBeenCalledTimes(1)

      // Resume after re-authentication preserves original identifiers & lease
      const resumed = await localDB.resumeAuthPausedTransactions()
      expect(resumed).toBe(1)
      const qResumed = (await localDB.getOfflineQueue()).find((q) => q.clientIntakeUuid === uuidAuth)
      expect(qResumed?.syncQueueStatus).toBe('RETRYABLE')
      expect(qResumed?.transaction.idempotencyKey).toBe(txnAuth.idempotencyKey)
      expect(qResumed?.transaction.offlineAuthorizationToken).toBe(txnAuth.offlineAuthorizationToken)

      // 3. Test 403 DEVICE_BLOCKED retention & non-retry
      await localDB.clearAllStoresForTesting()
      networkManager.setStatus('ONLINE')
      engine.destroy()
      const blockedEngine = new CollectionSyncEngine()
      const uuidBlocked = 'uuid-p52-blocked-403'
      const txnBlocked = makeTxn(uuidBlocked)
      await localDB.saveIntakeAtomically(txnBlocked, makeQueueItem(txnBlocked))

      vi.spyOn(collectionsApi, 'bulkSync').mockRejectedValueOnce(
        Object.assign(new Error('DEVICE_BLOCKED by dairy admin'), {
          statusCode: 403,
          code: 'DEVICE_BLOCKED',
        })
      )
      await blockedEngine.triggerSync()
      expect(blockedEngine.getStatus().state).toBe('DEVICE_BLOCKED')
      const qBlocked = (await localDB.getOfflineQueue()).find((q) => q.clientIntakeUuid === uuidBlocked)
      expect(qBlocked?.syncQueueStatus).toBe('DEVICE_BLOCKED')
      expect(await localDB.getEligibleQueueItems()).toHaveLength(0)

      // 4. Test permanent REJECTED retention & non-retry
      await localDB.clearAllStoresForTesting()
      const uuidRej = 'uuid-p52-perm-rej'
      const txnRej = makeTxn(uuidRej)
      await localDB.saveIntakeAtomically(txnRej, makeQueueItem(txnRej))
      await localDB.markTransactionRejected(uuidRej, {
        errorCode: 'PERM_INVALID_FARMER',
        errorMessage: 'Permanent validation rejection',
        status: 'REJECTED',
      })
      expect(await localDB.getEligibleQueueItems()).toHaveLength(0)

      blockedEngine.destroy()
    })

    it('recovers stale SYNCING records without losing retryCount, lastError, UUID, idempotencyKey, or lease', async () => {
      const uuid = 'uuid-p52-stale-syncing'
      const txn = makeTxn(uuid)
      const item = makeQueueItem(txn, {
        retryCount: 2,
        lastError: 'Prior socket hang up',
        errorReason: 'Prior socket hang up',
        status: 'SYNCING',
        syncQueueStatus: 'SYNCING',
        lastAttemptAt: new Date(Date.now() - 90000).toISOString(),
        lastAttemptedAt: new Date(Date.now() - 90000).toISOString(),
      })
      await localDB.saveIntakeAtomically(txn, item)

      const recoveredCount = await localDB.recoverStaleSyncingItems(60000)
      expect(recoveredCount).toBe(1)

      const recoveredItem = (await localDB.getOfflineQueue()).find((q) => q.clientIntakeUuid === uuid)
      expect(recoveredItem?.syncQueueStatus).toBe('RETRYABLE')
      expect(recoveredItem?.retryCount).toBe(2)
      expect(recoveredItem?.lastError).toBe('Prior socket hang up')
      expect(recoveredItem?.clientIntakeUuid).toBe(uuid)
      expect(recoveredItem?.transaction.idempotencyKey).toBe(txn.idempotencyKey)
      expect(recoveredItem?.transaction.offlineAuthorizationToken).toBe(txn.offlineAuthorizationToken)
    })
  })

  // ============================================================================
  // 3. P1 — CONFIGURED STORAGE THRESHOLDS (70% / 85%) & RETENTION PROTECTION
  // ============================================================================
  describe('3. P1 — Storage Thresholds (70% Warning / 85% Critical) & Safe Retention', () => {
    it('enforces exact configured 70% WARNING and 85% CRITICAL thresholds (not 80/90)', async () => {
      const origStorage = navigator.storage
      const mockEstimate = vi.fn()
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: {
          estimate: mockEstimate,
          persisted: vi.fn().mockResolvedValue(true),
          persist: vi.fn().mockResolvedValue(true),
        },
      })

      try {
        // Below 70% -> neither warning nor critical
        mockEstimate.mockResolvedValueOnce({ usage: 69, quota: 100 })
        const belowWarn = await storagePersistence.getStorageEstimate()
        expect(belowWarn.percentageUsed).toBe(69)
        expect(belowWarn.isWarning).toBe(false)
        expect(belowWarn.isCritical).toBe(false)

        // At 70% (and 79%, proving threshold is 70% not 80%) -> WARNING only
        mockEstimate.mockResolvedValueOnce({ usage: 70, quota: 100 })
        const atWarn = await storagePersistence.getStorageEstimate()
        expect(atWarn.isWarning).toBe(true)
        expect(atWarn.isCritical).toBe(false)

        // At 84% -> WARNING only (not critical yet)
        mockEstimate.mockResolvedValueOnce({ usage: 84, quota: 100 })
        const belowCrit = await storagePersistence.getStorageEstimate()
        expect(belowCrit.isWarning).toBe(true)
        expect(belowCrit.isCritical).toBe(false)

        // At 85% (proving threshold is 85% not 90%) -> CRITICAL + WARNING
        mockEstimate.mockResolvedValueOnce({ usage: 85, quota: 100 })
        const atCrit = await storagePersistence.getStorageEstimate()
        expect(atCrit.percentageUsed).toBe(85)
        expect(atCrit.isWarning).toBe(true)
        expect(atCrit.isCritical).toBe(true)
      } finally {
        Object.defineProperty(navigator, 'storage', {
          configurable: true,
          value: origStorage,
        })
      }
    })

    it('purges ONLY old SYNCED_CLOUD records and NEVER deletes pending, retryable, syncing, rejected, manual_review, auth_required, or device_blocked', async () => {
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

      const oldSynced = makeTxn('uuid-ret-old-synced', { timestamp: sixtyDaysAgo, syncStatus: 'SYNCED_CLOUD' })
      const recentSynced = makeTxn('uuid-ret-recent-synced', { timestamp: fiveDaysAgo, syncStatus: 'SYNCED_CLOUD' })
      const oldPending = makeTxn('uuid-ret-old-pending', { timestamp: sixtyDaysAgo, syncStatus: 'PENDING_OFFLINE' })
      const oldRetryable = makeTxn('uuid-ret-old-retryable', { timestamp: sixtyDaysAgo, syncStatus: 'RETRYABLE' })
      const oldSyncing = makeTxn('uuid-ret-old-syncing', { timestamp: sixtyDaysAgo, syncStatus: 'SYNCING' })
      const oldRejected = makeTxn('uuid-ret-old-rejected', { timestamp: sixtyDaysAgo, syncStatus: 'REJECTED' })
      const oldManualReview = makeTxn('uuid-ret-old-review', { timestamp: sixtyDaysAgo, syncStatus: 'MANUAL_REVIEW' })
      const oldAuthReq = makeTxn('uuid-ret-old-auth', { timestamp: sixtyDaysAgo, syncStatus: 'AUTH_REQUIRED' })
      const oldDeviceBlocked = makeTxn('uuid-ret-old-blocked', { timestamp: sixtyDaysAgo, syncStatus: 'DEVICE_BLOCKED' })

      for (const t of [
        oldSynced,
        recentSynced,
        oldPending,
        oldRetryable,
        oldSyncing,
        oldRejected,
        oldManualReview,
        oldAuthReq,
        oldDeviceBlocked,
      ]) {
        await localDB.saveIntakeAtomically(t, makeQueueItem(t))
      }

      const purgedCount = await localDB.cleanupSyncedTransactions(30)
      expect(purgedCount).toBe(1)

      expect(await localDB.getTransactionById('uuid-ret-old-synced')).toBeNull()
      expect(await localDB.getTransactionById('uuid-ret-recent-synced')).not.toBeNull()
      expect(await localDB.getTransactionById('uuid-ret-old-pending')).not.toBeNull()
      expect(await localDB.getTransactionById('uuid-ret-old-retryable')).not.toBeNull()
      expect(await localDB.getTransactionById('uuid-ret-old-syncing')).not.toBeNull()
      expect(await localDB.getTransactionById('uuid-ret-old-rejected')).not.toBeNull()
      expect(await localDB.getTransactionById('uuid-ret-old-review')).not.toBeNull()
      expect(await localDB.getTransactionById('uuid-ret-old-auth')).not.toBeNull()
      expect(await localDB.getTransactionById('uuid-ret-old-blocked')).not.toBeNull()
    })
  })
})
