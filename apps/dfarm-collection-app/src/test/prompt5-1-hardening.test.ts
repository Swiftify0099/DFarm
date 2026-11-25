// DFarm Prompt 5.1 — Final Sync Engine Data Isolation, Lease Mapping, Lock Recovery & E2E Verification
// Strictly verifies:
// 1. Rate chart cache key isolation between Centre A, Centre B, and org-wide charts
// 2. Per-transaction offline lease mapping across mixed shift sessions
// 3. Canonical rate sync endpoint (/api/v1/rates/sync) and ETag 304 contract
// 4. Multi-tab lock heartbeat renewal, crash recovery, and stale lock release protection
// 5. HTTP 413 dynamic batch splitting down to single-item manual review halting
// 6. Persistent retry metadata, future backoff preservation, and startup retry storm protection
// 7. Simulated browser crash recovery and replayed acknowledgement reconciliation

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { localDB, LocalCollectionDB } from '../services/local-storage'
import { syncEngine, CollectionSyncEngine } from '../services/sync-engine'
import { multiTabLock, MultiTabSyncLock } from '../services/multi-tab-lock'
import { collectionsApi, ratesApi, setStoredOperatorAuth, clearStoredOperatorAuth } from '../api/client'
import type { CollectionTransaction, OfflineQueueItem, RateChartCacheItem } from '../types'

describe('DFarm Prompt 5.1: Sync Engine Data Isolation, Lease Mapping & Hardening', () => {
  const dairyId = 'dairy-p51-coop'
  const centerA = 'center-alpha-01'
  const centerB = 'center-beta-02'

  const createTxn = (uuid: string, overrides: Partial<CollectionTransaction> = {}): CollectionTransaction => ({
    id: uuid,
    clientIntakeUuid: uuid,
    transactionCode: `TXN-${uuid.slice(0, 8).toUpperCase()}`,
    sessionId: 'session-default',
    dairyId,
    centerId: centerA,
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Patil Farmer',
    timestamp: new Date().toISOString(),
    date: '2026-11-24',
    shift: 'MORNING',
    milkCategory: 'COW',
    weightLiters: 10.0,
    fatPercentage: 4.0,
    snfPercentage: 8.5,
    clrDensity: 28.0,
    appliedRatePerLiter: 40.0,
    rateChartVersion: 1,
    totalAmount: 400.0,
    identificationMethod: 'FACE_YUNET_SFACE',
    syncStatus: 'PENDING_OFFLINE',
    deviceId: 'KIOSK-01',
    operatorName: 'Operator',
    idempotencyKey: `IDEMP-${uuid}`,
    offlineCreated: true,
    ...overrides,
  })

  const createQueueItem = (txn: CollectionTransaction, overrides: Partial<OfflineQueueItem> = {}): OfflineQueueItem => {
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
    setStoredOperatorAuth('test-token', dairyId, {
      id: 'op-01',
      fullName: 'Pankaj Operator',
      dairyId,
      centerId: centerA,
    })
    await localDB.clearAllStoresForTesting()
  })

  // ============================================================================
  // 1. P0 — RATE CHART CACHE KEY ISOLATION
  // ============================================================================
  describe('1. Rate Chart Cache Key Isolation & Fail-Closed Scoping', () => {
    it('prevents Centre A and Centre B rate charts from colliding or overwriting each other', async () => {
      // Centre A rate chart: COW v1 -> baseRate ₹40.00
      const chartCenterA: RateChartCacheItem = {
        id: LocalCollectionDB.buildRateChartCacheKey({
          dairyId,
          milkCategory: 'COW',
          centerScope: 'CENTER_SPECIFIC',
          centerId: centerA,
          chartId: 'chart-cow-alpha',
          versionId: 'ver-cow-alpha-1',
          versionNumber: 1,
        }),
        dairyId,
        centerId: centerA,
        chartId: 'chart-cow-alpha',
        versionId: 'ver-cow-alpha-1',
        versionNumber: 1,
        centerScope: 'CENTER_SPECIFIC',
        milkCategory: 'COW',
        pricingType: 'TWO_AXIS_FORMULA',
        version: 1,
        effectiveFrom: '2026-11-01',
        baseFat: 3.5,
        baseSnf: 8.5,
        baseRate: 40.0,
        fatFactor: 4.2,
        snfFactor: 3.5,
        updatedAt: new Date().toISOString(),
      }

      // Centre B rate chart: COW v1 -> baseRate ₹42.00 (same dairy, same category, same version number)
      const chartCenterB: RateChartCacheItem = {
        id: LocalCollectionDB.buildRateChartCacheKey({
          dairyId,
          milkCategory: 'COW',
          centerScope: 'CENTER_SPECIFIC',
          centerId: centerB,
          chartId: 'chart-cow-beta',
          versionId: 'ver-cow-beta-1',
          versionNumber: 1,
        }),
        dairyId,
        centerId: centerB,
        chartId: 'chart-cow-beta',
        versionId: 'ver-cow-beta-1',
        versionNumber: 1,
        centerScope: 'CENTER_SPECIFIC',
        milkCategory: 'COW',
        pricingType: 'TWO_AXIS_FORMULA',
        version: 1,
        effectiveFrom: '2026-11-01',
        baseFat: 3.5,
        baseSnf: 8.5,
        baseRate: 42.0,
        fatFactor: 4.5,
        snfFactor: 3.8,
        updatedAt: new Date().toISOString(),
      }

      // 1. Keys must be distinct and non-colliding
      expect(chartCenterA.id).not.toBe(chartCenterB.id)
      expect(chartCenterA.id).toContain(centerA)
      expect(chartCenterB.id).toContain(centerB)

      // 2. Save both charts into local cache
      await localDB.saveRateChart(chartCenterA)
      await localDB.saveRateChart(chartCenterB)

      // 3. Query Centre A: MUST retrieve Centre A chart with ₹40.00
      const fetchedA = await localDB.getRateChart(dairyId, 'COW', centerA)
      expect(fetchedA).toBeDefined()
      expect(fetchedA?.centerId).toBe(centerA)
      expect(fetchedA?.baseRate).toBe(40.0)

      // 4. Query Centre B: MUST retrieve Centre B chart with ₹42.00
      const fetchedB = await localDB.getRateChart(dairyId, 'COW', centerB)
      expect(fetchedB).toBeDefined()
      expect(fetchedB?.centerId).toBe(centerB)
      expect(fetchedB?.baseRate).toBe(42.0)
    })

    it('distinguishes organization-wide charts and falls back only when authorized, failing closed otherwise', async () => {
      // Organization-wide COW chart: ₹38.00
      const orgWideChart: RateChartCacheItem = {
        id: LocalCollectionDB.buildRateChartCacheKey({
          dairyId,
          milkCategory: 'COW',
          centerScope: 'ORGANIZATION_WIDE',
          centerId: null,
          chartId: 'chart-cow-org',
          versionId: 'ver-cow-org-1',
          versionNumber: 1,
        }),
        dairyId,
        centerId: null,
        centerScope: 'ORGANIZATION_WIDE',
        milkCategory: 'COW',
        pricingType: 'TWO_AXIS_FORMULA',
        version: 1,
        effectiveFrom: '2026-11-01',
        baseFat: 3.5,
        baseSnf: 8.5,
        baseRate: 38.0,
        fatFactor: 4.0,
        snfFactor: 3.0,
        updatedAt: new Date().toISOString(),
      }
      await localDB.saveRateChart(orgWideChart)

      // A centre without a specific chart falls back to the organization-wide chart
      const fetchedFallback = await localDB.getRateChart(dairyId, 'COW', 'center-gamma-unassigned')
      expect(fetchedFallback).toBeDefined()
      expect(fetchedFallback?.baseRate).toBe(38.0)
      expect(fetchedFallback?.centerScope).toBe('ORGANIZATION_WIDE')

      // BUT a query for BUFFALO (where neither center-specific nor org-wide exists) FAILS CLOSED
      const fetchedNotFound = await localDB.getRateChart(dairyId, 'BUFFALO', centerA)
      expect(fetchedNotFound).toBeNull()

      // Rate calculation for null chart fails closed
      const calcResult = ratesApi.calculateRate('BUFFALO', 6.5, 9.0, fetchedNotFound)
      expect(calcResult.isValid).toBe(false)
      expect(calcResult.ratePerLiter).toBe(0)
      expect(calcResult.error).toContain('No active rate chart cached for BUFFALO')
    })

    it('retrieves the exact historical chart version originally used for pending transactions', async () => {
      // Version 1 (historical)
      const chartV1: RateChartCacheItem = {
        id: LocalCollectionDB.buildRateChartCacheKey({
          dairyId,
          milkCategory: 'COW',
          centerScope: 'CENTER_SPECIFIC',
          centerId: centerA,
          chartId: 'chart-cow-alpha',
          versionId: 'ver-cow-alpha-v1',
          versionNumber: 1,
        }),
        dairyId,
        centerId: centerA,
        chartId: 'chart-cow-alpha',
        versionId: 'ver-cow-alpha-v1',
        versionNumber: 1,
        centerScope: 'CENTER_SPECIFIC',
        milkCategory: 'COW',
        pricingType: 'TWO_AXIS_FORMULA',
        version: 1,
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-10-31', // Expired
        baseFat: 3.5,
        baseSnf: 8.5,
        baseRate: 39.0,
        fatFactor: 4.0,
        snfFactor: 3.0,
        updatedAt: new Date().toISOString(),
      }

      // Version 2 (active)
      const chartV2: RateChartCacheItem = {
        id: LocalCollectionDB.buildRateChartCacheKey({
          dairyId,
          milkCategory: 'COW',
          centerScope: 'CENTER_SPECIFIC',
          centerId: centerA,
          chartId: 'chart-cow-alpha',
          versionId: 'ver-cow-alpha-v2',
          versionNumber: 2,
        }),
        dairyId,
        centerId: centerA,
        chartId: 'chart-cow-alpha',
        versionId: 'ver-cow-alpha-v2',
        versionNumber: 2,
        centerScope: 'CENTER_SPECIFIC',
        milkCategory: 'COW',
        pricingType: 'TWO_AXIS_FORMULA',
        version: 2,
        effectiveFrom: '2026-11-01',
        baseFat: 3.5,
        baseSnf: 8.5,
        baseRate: 41.0,
        fatFactor: 4.2,
        snfFactor: 3.5,
        updatedAt: new Date().toISOString(),
      }

      await localDB.saveRateChart(chartV1)
      await localDB.saveRateChart(chartV2)

      // Active lookup returns V2
      const activeChart = await localDB.getRateChart(dairyId, 'COW', centerA)
      expect(activeChart?.version).toBe(2)
      expect(activeChart?.baseRate).toBe(41.0)

      // Historical version lookup by version number retrieves exact V1 chart
      const historicalV1 = await localDB.getRateChartByVersion(dairyId, 'COW', 1, centerA)
      expect(historicalV1).toBeDefined()
      expect(historicalV1?.version).toBe(1)
      expect(historicalV1?.baseRate).toBe(39.0)

      // Historical version lookup by versionId retrieves exact V1 chart
      const historicalById = await localDB.getRateChartByVersion(dairyId, 'COW', 'ver-cow-alpha-v1', centerA)
      expect(historicalById).toBeDefined()
      expect(historicalById?.versionId).toBe('ver-cow-alpha-v1')
      expect(historicalById?.baseRate).toBe(39.0)
    })

    it('fails closed when exact historical version cannot be resolved and never falls back to the latest chart', async () => {
      // Save V2 (active)
      const chartV2: RateChartCacheItem = {
        id: LocalCollectionDB.buildRateChartCacheKey({
          dairyId,
          milkCategory: 'COW',
          centerScope: 'CENTER_SPECIFIC',
          centerId: centerA,
          chartId: 'chart-cow-alpha',
          versionId: 'ver-cow-alpha-v2',
          versionNumber: 2,
        }),
        dairyId,
        centerId: centerA,
        chartId: 'chart-cow-alpha',
        versionId: 'ver-cow-alpha-v2',
        versionNumber: 2,
        centerScope: 'CENTER_SPECIFIC',
        milkCategory: 'COW',
        pricingType: 'TWO_AXIS_FORMULA',
        version: 2,
        effectiveFrom: '2026-11-01',
        baseFat: 3.5,
        baseSnf: 8.5,
        baseRate: 41.0,
        fatFactor: 4.2,
        snfFactor: 3.5,
        updatedAt: new Date().toISOString(),
      }
      await localDB.saveRateChart(chartV2)

      // Query for historical V1 (which is NOT in cache)
      const missingHistorical = await localDB.getRateChartByVersion(dairyId, 'COW', 1, centerA)
      // Must FAIL CLOSED (null), never falling back to latest chart (V2)
      expect(missingHistorical).toBeNull()

      // Query for unknown versionId
      const missingById = await localDB.getRateChartByVersion(dairyId, 'COW', 'ver-non-existent-99', centerA)
      expect(missingById).toBeNull()
    })

    it('never falls back to another centre chart or undeclared org-wide chart unless explicitly declared as ORGANIZATION_WIDE', async () => {
      // 1. Chart belonging to Centre B only
      const chartCenterB: RateChartCacheItem = {
        id: LocalCollectionDB.buildRateChartCacheKey({
          dairyId,
          milkCategory: 'BUFFALO',
          centerScope: 'CENTER_SPECIFIC',
          centerId: centerB,
          chartId: 'chart-buf-beta',
          versionId: 'ver-buf-beta-1',
          versionNumber: 1,
        }),
        dairyId,
        centerId: centerB,
        chartId: 'chart-buf-beta',
        versionId: 'ver-buf-beta-1',
        versionNumber: 1,
        centerScope: 'CENTER_SPECIFIC',
        milkCategory: 'BUFFALO',
        pricingType: 'TWO_AXIS_FORMULA',
        version: 1,
        effectiveFrom: '2026-11-01',
        baseFat: 6.0,
        baseSnf: 9.0,
        baseRate: 62.0,
        fatFactor: 6.0,
        snfFactor: 4.5,
        updatedAt: new Date().toISOString(),
      }

      // 2. Chart with missing centerId and NO explicit ORGANIZATION_WIDE declaration MUST fail closed
      expect(() =>
        LocalCollectionDB.buildRateChartCacheKey({
          dairyId,
          milkCategory: 'BUFFALO',
          centerId: null,
          chartId: 'chart-buf-undeclared',
          versionId: 'ver-buf-und-1',
          versionNumber: 1,
        })
      ).toThrow()

      const undeclaredChart = {
        id: 'corrupt-undeclared-chart-key',
        dairyId,
        centerId: null,
        // Notice: centerScope is NOT set to 'ORGANIZATION_WIDE'
        milkCategory: 'BUFFALO',
        pricingType: 'TWO_AXIS_FORMULA',
        version: 1,
        effectiveFrom: '2026-11-01',
        baseFat: 6.0,
        baseSnf: 9.0,
        baseRate: 55.0,
        fatFactor: 5.5,
        snfFactor: 4.0,
        updatedAt: new Date().toISOString(),
      } as RateChartCacheItem

      await localDB.saveRateChart(chartCenterB)
      await expect(localDB.saveRateChart(undeclaredChart)).rejects.toThrow()

      // Query for Centre A: MUST FAIL CLOSED!
      // Must not fall back to Centre B (₹62.0) or any undeclared chart
      const resultCenterA = await localDB.getRateChart(dairyId, 'BUFFALO', centerA)
      expect(resultCenterA).toBeNull()

      // Historical version query for Centre A also FAILS CLOSED
      const historicalCenterA = await localDB.getRateChartByVersion(dairyId, 'BUFFALO', 1, centerA)
      expect(historicalCenterA).toBeNull()

      // 3. Now save a chart that EXPLICITLY declares centerScope: 'ORGANIZATION_WIDE'
      const explicitOrgWideChart: RateChartCacheItem = {
        id: LocalCollectionDB.buildRateChartCacheKey({
          dairyId,
          milkCategory: 'BUFFALO',
          centerScope: 'ORGANIZATION_WIDE',
          centerId: null,
          chartId: 'chart-buf-org-explicit',
          versionId: 'ver-buf-org-1',
          versionNumber: 1,
        }),
        dairyId,
        centerId: null,
        centerScope: 'ORGANIZATION_WIDE',
        isOrganizationWide: true,
        milkCategory: 'BUFFALO',
        pricingType: 'TWO_AXIS_FORMULA',
        version: 1,
        effectiveFrom: '2026-11-01',
        baseFat: 6.0,
        baseSnf: 9.0,
        baseRate: 58.0,
        fatFactor: 5.8,
        snfFactor: 4.2,
        updatedAt: new Date().toISOString(),
      }
      await localDB.saveRateChart(explicitOrgWideChart)

      // Now query for Centre A falls back to the explicitly declared ORGANIZATION_WIDE chart
      const resultWithExplicitOrg = await localDB.getRateChart(dairyId, 'BUFFALO', centerA)
      expect(resultWithExplicitOrg).toBeDefined()
      expect(resultWithExplicitOrg?.baseRate).toBe(58.0)
      expect(resultWithExplicitOrg?.centerScope).toBe('ORGANIZATION_WIDE')
    })
  })

  // ============================================================================
  // 2. P0 — PER-TRANSACTION OFFLINE LEASE MAPPING
  // ============================================================================
  describe('2. Per-Transaction Offline Lease Mapping across Mixed Sessions', () => {
    it('submits Collection A with Lease A and Collection B with Lease B without cross-contamination', async () => {
      const morningSessionId = 'ses-morning-001'
      const eveningSessionId = 'ses-evening-002'

      const leaseA = 'jwt.offline.lease.morning.session.token.aaa'
      const leaseB = 'jwt.offline.lease.evening.session.token.bbb'

      // Save original session leases in IndexedDB
      await localDB.saveSessionOfflineAuth(morningSessionId, {
        token: leaseA,
        payload: { sessionId: morningSessionId, shift: 'MORNING' },
      })
      await localDB.saveSessionOfflineAuth(eveningSessionId, {
        token: leaseB,
        payload: { sessionId: eveningSessionId, shift: 'EVENING' },
      })

      // Simulate currently active session is Evening Session (or a 3rd session)
      await localDB.setMetadata('active_session_offline_auth', {
        token: leaseB,
        payload: { sessionId: eveningSessionId, shift: 'EVENING' },
      })

      // Collection A belongs to Morning Session with Lease A
      const uuidA = 'uuid-morning-patil'
      const txnA = createTxn(uuidA, {
        sessionId: morningSessionId,
        shift: 'MORNING',
        offlineAuthorizationToken: leaseA,
      })
      const queueA = createQueueItem(txnA, {
        offlineAuthorizationToken: leaseA,
      })

      // Collection B belongs to Evening Session with Lease B
      const uuidB = 'uuid-evening-kulkarni'
      const txnB = createTxn(uuidB, {
        sessionId: eveningSessionId,
        shift: 'EVENING',
        offlineAuthorizationToken: leaseB,
      })
      const queueB = createQueueItem(txnB, {
        offlineAuthorizationToken: leaseB,
      })

      await localDB.saveIntakeAtomically(txnA, queueA)
      await localDB.saveIntakeAtomically(txnB, queueB)

      let capturedPayload: any = null
      vi.spyOn(collectionsApi, 'bulkSync').mockImplementation(async (payload) => {
        capturedPayload = payload
        const results = payload.transactions.map((t) => ({
          clientIntakeUuid: t.clientIntakeUuid,
          idempotencyKey: t.idempotencyKey,
          status: 'ACCEPTED' as const,
          isIdempotentReplay: false,
          serverTransactionId: `srv-${t.clientIntakeUuid}`,
          receiptNumber: `RCP-${t.clientIntakeUuid.slice(0, 6)}`,
        }))
        return {
          batchId: payload.batchId,
          requestId: 'req-mixed-lease',
          summary: {
            received: payload.transactions.length,
            accepted: payload.transactions.length,
            replayed: 0,
            rejected: 0,
            retryable: 0,
          },
          results,
        }
      })

      const syncResult = await syncEngine.triggerSync()
      expect(syncResult.succeeded).toBe(2)
      expect(capturedPayload).toBeDefined()

      // Collection A must have Lease A
      const itemA = capturedPayload.transactions.find((t: any) => t.clientIntakeUuid === uuidA)
      expect(itemA).toBeDefined()
      expect(itemA.offlineAuthorizationToken).toBe(leaseA)

      // Collection B must have Lease B
      const itemB = capturedPayload.transactions.find((t: any) => t.clientIntakeUuid === uuidB)
      expect(itemB).toBeDefined()
      expect(itemB.offlineAuthorizationToken).toBe(leaseB)

      // In a mixed session batch, batch-level token must NOT bleed into Morning collection
      expect(capturedPayload.offlineAuthorizationToken).toBeUndefined()
    })

    it('never substitutes currently active session lease for an older transaction with missing lease and pauses it for manual review on rejection', async () => {
      const yesterdaySessionId = 'ses-yesterday-999'
      const todaySessionId = 'ses-today-100'
      const activeLeaseToday = 'jwt.offline.lease.today.active.session.token'

      // Set active session lease to today's active session
      await localDB.setMetadata('active_session_offline_auth', {
        token: activeLeaseToday,
        payload: { sessionId: todaySessionId, shift: 'MORNING' },
      })

      // Yesterday's transaction is missing its original lease
      const uuidYesterday = 'uuid-yesterday-missing-lease'
      const txnYesterday = createTxn(uuidYesterday, {
        sessionId: yesterdaySessionId,
        shift: 'EVENING',
        offlineAuthorizationToken: undefined,
      })
      const queueYesterday = createQueueItem(txnYesterday, {
        offlineAuthorizationToken: undefined,
      })

      await localDB.saveIntakeAtomically(txnYesterday, queueYesterday)

      let capturedPayload: any = null
      vi.spyOn(collectionsApi, 'bulkSync').mockImplementation(async (payload) => {
        capturedPayload = payload
        return {
          batchId: payload.batchId,
          requestId: 'req-missing-lease-reject',
          summary: {
            received: 1,
            accepted: 0,
            replayed: 0,
            rejected: 1,
            retryable: 0,
          },
          results: [
            {
              clientIntakeUuid: uuidYesterday,
              idempotencyKey: txnYesterday.idempotencyKey || `IDEMP-${uuidYesterday}`,
              status: 'REJECTED' as const,
              isIdempotentReplay: false,
              errorCode: 'OFFLINE_AUTHORIZATION_MISSING',
              errorMessage:
                'Closed session intake requires the transaction original server-issued offline authorization token. Session ses-yesterday-999 is closed and per-item lease is missing. Paused for manual review.',
            },
          ],
        }
      })

      const syncResult = await syncEngine.triggerSync()
      expect(syncResult.failed).toBe(1)
      expect(syncResult.succeeded).toBe(0)

      // Verified: Active session lease was NEVER substituted for the older transaction
      const item = capturedPayload.transactions[0]
      expect(item.offlineAuthorizationToken).toBeUndefined()
      expect(capturedPayload.offlineAuthorizationToken).toBeUndefined()

      // Verified: Item is paused for MANUAL_REVIEW in completed_transactions
      const completedTx = await localDB.getTransactionById(uuidYesterday)
      expect(completedTx).toBeDefined()
      expect(completedTx?.syncStatus).toBe('MANUAL_REVIEW')
      expect(completedTx?.syncErrorCode).toBe('OFFLINE_AUTHORIZATION_MISSING')

      // Verified: Item is paused in offline_queue and not picked for future automatic retries
      const eligibleQueue = await localDB.getEligibleQueueItems(10)
      const isStillInEligibleQueue = eligibleQueue.some((q) => q.clientIntakeUuid === uuidYesterday)
      expect(isStillInEligibleQueue).toBe(false)
    })
  })

  // ============================================================================
  // 3. P1 — VERIFY CANONICAL RATE SYNC ENDPOINT AND ETAG CONTRACT
  // ============================================================================
  describe('3. Canonical Rate Sync Endpoint (/api/v1/rates/sync) & ETag Contract', () => {
    it('downloads complete rate charts via /api/v1/rates/sync and handles HTTP 304 with preserved cache', async () => {
      let requestedUrl = ''
      let sentHeaders: any = {}

      const mockSyncResponse = {
        success: true,
        data: {
          charts: [
            {
              chartId: 'chart-cow-sync',
              versionId: 'ver-cow-sync-1',
              versionNumber: 1,
              name: 'Cow Standard Matrix',
              milkCategory: 'COW',
              pricingType: 'TWO_AXIS_FORMULA',
              centerScope: 'CENTER_SPECIFIC',
              centerId: centerA,
              effectiveFrom: '2026-11-01',
              baseRate: 40.5,
              baseFat: 3.5,
              baseSnf: 8.5,
              fatFactor: 4.2,
              snfFactor: 3.5,
            },
          ],
        },
      }

      // Mock global fetch to inspect request URL and headers
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, options: any) => {
        requestedUrl = String(url)
        sentHeaders = options?.headers || {}

        if (sentHeaders['If-None-Match'] === 'W/"test-etag-123"') {
          return new Response(null, { status: 304, statusText: 'Not Modified' })
        }

        return new Response(JSON.stringify(mockSyncResponse), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ETag: 'W/"test-etag-123"',
          },
        })
      })

      // 1. Initial download: calls /rates/sync
      const downloaded = await ratesApi.downloadRateCharts(dairyId, centerA)
      expect(requestedUrl).toContain('/rates/sync')
      expect(requestedUrl).toContain(`centerId=${centerA}`)
      expect(downloaded).toBeDefined()
      expect(downloaded?.length).toBe(1)
      expect(downloaded?.[0].baseRate).toBe(40.5)

      // Verify ETag was stored in centre-scoped metadata
      const storedEtag = await localDB.getMetadata(`rate_charts_etag_${dairyId}_${centerA}`)
      expect(storedEtag).toBe('W/"test-etag-123"')

      // 2. Second download with stored ETag sends If-None-Match
      const cached304 = await ratesApi.downloadRateCharts(dairyId, centerA)
      expect(sentHeaders['If-None-Match']).toBe('W/"test-etag-123"')
      expect(cached304).toBeDefined()
      expect(cached304?.[0].baseRate).toBe(40.5)

      fetchSpy.mockRestore()
    })
  })

  // ============================================================================
  // 4. P1 — MULTI-TAB ADVISORY LOCK HEARTBEAT & RECOVERY
  // ============================================================================
  describe('4. Multi-Tab Lock Heartbeat, Crash Recovery & Stale Worker Protection', () => {
    it('renews lease via periodic heartbeat for requests lasting longer than TTL', async () => {
      const lockKey = multiTabLock.getLockKey(dairyId, 'KIOSK-01')
      const customLock = new MultiTabSyncLock('worker-tab-1')

      // Short TTL of 3000ms for fast test verification
      const ttlMs = 3000
      const acquired = await customLock.acquireIdbAdvisoryLock(lockKey, ttlMs)
      expect(acquired).toBe(true)

      // Start active heartbeat renewal
      customLock.startHeartbeat(lockKey, ttlMs)

      // Wait 3500ms (longer than original 3000ms TTL)
      await new Promise((r) => setTimeout(r, 3500))

      // Tab 2 attempts to acquire lock: MUST FAIL because Tab 1 heartbeat renewed it!
      const tab2Lock = new MultiTabSyncLock('worker-tab-2')
      const tab2Acquired = await tab2Lock.acquireIdbAdvisoryLock(lockKey, ttlMs)
      expect(tab2Acquired).toBe(false)

      customLock.stopHeartbeat(lockKey)
      await customLock.releaseIdbAdvisoryLock(lockKey)
    })

    it('safely recovers an abandoned lock after worker crash and TTL expiration', async () => {
      const lockKey = multiTabLock.getLockKey(dairyId, 'KIOSK-CRASH')
      const crashedWorker = new MultiTabSyncLock('crashed-worker-99')

      // Crashed worker acquires lock with 1000ms TTL and halts (no heartbeat)
      await crashedWorker.acquireIdbAdvisoryLock(lockKey, 1000)

      // Wait 1200ms for TTL to expire
      await new Promise((r) => setTimeout(r, 1200))

      // New worker attempts acquisition: must succeed via atomic expiration recovery
      const newWorker = new MultiTabSyncLock('new-worker-01')
      const recovered = await newWorker.acquireIdbAdvisoryLock(lockKey, 5000)
      expect(recovered).toBe(true)

      // Old crashed worker tries to release: MUST NOT release new worker's lock!
      await crashedWorker.releaseIdbAdvisoryLock(lockKey)

      // Lock is still held by new worker
      const metadata = await localDB.getMetadata(`advisory_lock_${lockKey}`)
      expect(metadata?.ownerId).toBe('new-worker-01')

      await newWorker.releaseIdbAdvisoryLock(lockKey)
    })
  })

  // ============================================================================
  // 5. P1 — HTTP 413 DYNAMIC BATCH SPLITTING & SINGLE-ITEM HALT
  // ============================================================================
  describe('5. HTTP 413 Batch Splitting & Single-Item Manual Review Halting', () => {
    it('safely splits batches of 5 down to 1 upon HTTP 413', async () => {
      const txns: CollectionTransaction[] = []
      for (let i = 0; i < 5; i++) {
        const uuid = `uuid-split-${i}`
        const t = createTxn(uuid)
        txns.push(t)
        await localDB.saveIntakeAtomically(t, createQueueItem(t))
      }

      let attemptCounts = 0
      const batchSizesSeen: number[] = []

      vi.spyOn(collectionsApi, 'bulkSync').mockImplementation(async (payload) => {
        attemptCounts++
        batchSizesSeen.push(payload.transactions.length)

        // Reject batches larger than 2 with HTTP 413
        if (payload.transactions.length > 2) {
          const err: any = new Error('HTTP 413: Payload Too Large')
          err.statusCode = 413
          err.code = 'BATCH_SIZE_EXCEEDED'
          throw err
        }

        // Accept batches of 2 or less
        const results = payload.transactions.map((t) => ({
          clientIntakeUuid: t.clientIntakeUuid,
          idempotencyKey: t.idempotencyKey,
          status: 'ACCEPTED' as const,
          isIdempotentReplay: false,
          serverTransactionId: `srv-${t.clientIntakeUuid}`,
          receiptNumber: `RCP-${t.clientIntakeUuid.slice(0, 6)}`,
        }))
        return {
          batchId: payload.batchId,
          requestId: 'req-split',
          summary: {
            received: payload.transactions.length,
            accepted: payload.transactions.length,
            replayed: 0,
            rejected: 0,
            retryable: 0,
          },
          results,
        }
      })

      const res = await syncEngine.triggerSync()
      expect(res.succeeded).toBe(5)
      // Confirm dynamic splitting occurred (e.g. 5 -> 3, 2 -> 3 split to 2, 1)
      expect(batchSizesSeen.some((size) => size <= 2)).toBe(true)
    })

    it('halts repeated retries for a single item receiving HTTP 413 and marks MANUAL_REVIEW', async () => {
      const singleUuid = 'uuid-oversized-item'
      const txn = createTxn(singleUuid)
      await localDB.saveIntakeAtomically(txn, createQueueItem(txn))

      let callCount = 0
      vi.spyOn(collectionsApi, 'bulkSync').mockImplementation(async () => {
        callCount++
        const err: any = new Error('HTTP 413: Item payload exceeds server hard ceiling')
        err.statusCode = 413
        err.code = 'BATCH_SIZE_EXCEEDED'
        throw err
      })

      const res = await syncEngine.triggerSync()
      expect(res.succeeded).toBe(0)
      expect(res.failed).toBe(1)
      // Must not loop endlessly
      expect(callCount).toBe(1)

      // Verified: Transaction is preserved in completed_transactions with MANUAL_REVIEW
      const storedTxn = await localDB.getTransactionById(singleUuid)
      expect(storedTxn).toBeDefined()
      expect(storedTxn?.syncStatus).toBe('MANUAL_REVIEW')
      expect(storedTxn?.syncErrorCode).toBe('PAYLOAD_TOO_LARGE')

      // Verified: Not marked synced and not deleted from offline_queue
      const queueItems = await localDB.getOfflineQueue()
      const itemInQueue = queueItems.find((i) => i.clientIntakeUuid === singleUuid)
      expect(itemInQueue).toBeDefined()
      expect(itemInQueue?.status).toBe('MANUAL_REVIEW')

      // Subsequent sync runs MUST NOT pick up the MANUAL_REVIEW item (no infinite retry loop)
      const secondRun = await syncEngine.triggerSync()
      expect(secondRun.processed).toBe(0)
      expect(callCount).toBe(1)
    })
  })

  // ============================================================================
  // 6. P1 — PERSISTENT RETRY METADATA & RESTART PROTECTION
  // ============================================================================
  describe('6. Persistent Retry Metadata & Scheduled Backoff Survival', () => {
    it('persists nextAttemptAt in IndexedDB and excludes future retries on application startup', async () => {
      const uuidFuture = 'uuid-future-retry'
      const txnFuture = createTxn(uuidFuture)
      const queueFuture = createQueueItem(txnFuture)
      await localDB.saveIntakeAtomically(txnFuture, queueFuture)

      // Schedule retry 60 seconds in the future
      const futureDate = new Date(Date.now() + 60000).toISOString()
      await localDB.markTransactionRetryable(uuidFuture, {
        errorReason: 'Rate limit (HTTP 429)',
        errorCode: 'RATE_LIMITED',
        nextRetryAt: futureDate,
      })

      // Verify metadata fields are persisted in IndexedDB
      const queue = await localDB.getOfflineQueue()
      const item = queue.find((i) => i.clientIntakeUuid === uuidFuture)
      expect(item).toBeDefined()
      expect(item?.retryCount).toBe(1)
      expect(item?.nextAttemptAt).toBe(futureDate)
      expect(item?.lastError).toBe('Rate limit (HTTP 429)')

      // On application restart / query: eligible items MUST NOT include future items (no retry storm)
      const eligible = await localDB.getEligibleQueueItems()
      expect(eligible.some((i) => i.clientIntakeUuid === uuidFuture)).toBe(false)

      // Conversely, an item with an expired nextAttemptAt IS immediately eligible
      const uuidExpired = 'uuid-expired-retry'
      const txnExpired = createTxn(uuidExpired)
      await localDB.saveIntakeAtomically(txnExpired, createQueueItem(txnExpired))
      await localDB.markTransactionRetryable(uuidExpired, {
        errorReason: 'Temporary network timeout',
        nextRetryAt: new Date(Date.now() - 5000).toISOString(),
      })

      const eligibleAfter = await localDB.getEligibleQueueItems()
      expect(eligibleAfter.some((i) => i.clientIntakeUuid === uuidExpired)).toBe(true)
    })

    it('recovers interrupted in-flight SYNCING records on startup without discarding payload', async () => {
      const uuidCrash = 'uuid-inflight-crash'
      const txnCrash = createTxn(uuidCrash)
      await localDB.saveIntakeAtomically(txnCrash, createQueueItem(txnCrash))

      // Put item in-flight
      await localDB.markTransactionsSyncing([uuidCrash])

      // Simulate application restart with recoverStaleSyncingItems(0)
      const recovered = await localDB.recoverStaleSyncingItems(0)
      expect(recovered).toBe(1)

      // Invariant: original intake payload, measurement, and financial snapshot are 100% preserved
      const stored = await localDB.getTransactionById(uuidCrash)
      expect(stored).toBeDefined()
      expect(stored?.syncStatus).toBe('RETRYABLE')
      expect(stored?.weightLiters).toBe(10.0)
      expect(stored?.totalAmount).toBe(400.0)
      expect(stored?.idempotencyKey).toBe(`IDEMP-${uuidCrash}`)
    })
  })

  // ============================================================================
  // 7. P1 — BROWSER CRASH & REPLAYED RECONCILIATION TEST
  // ============================================================================
  describe('7. Browser Acknowledgement Crash & Replayed Reconciliation Flow', () => {
    it('safely reconciles server REPLAYED response when browser crashes before saving acknowledgement', async () => {
      const clientIntakeUuid = 'uuid-crash-recovery-patil'
      const idempotencyKey = `IDEMP-${clientIntakeUuid}`
      const canonicalReceipt = 'RCP-CANONICAL-20261124-001'
      const serverTxnId = 'pg-srv-txn-777'

      // Step 1: Locally commit transaction and queue item in IndexedDB
      const txn = createTxn(clientIntakeUuid, { idempotencyKey })
      await localDB.saveIntakeAtomically(txn, createQueueItem(txn))

      // Step 2: Simulate server receiving, processing, and committing to PostgreSQL:
      // (The server committed the intake, created farmer ledger entry, and generated receipt)
      // Step 3: Browser CRASH occurs right here before the client commits markTransactionSynced!

      // Step 4: Browser restarts / reloads. Transaction is still locally PENDING in IndexedDB
      const preSyncTxn = await localDB.getTransactionById(clientIntakeUuid)
      expect(preSyncTxn?.syncStatus).toBe('PENDING_OFFLINE')

      // Step 5: Sync engine triggers retry with the EXACT same clientIntakeUuid & idempotencyKey
      vi.spyOn(collectionsApi, 'bulkSync').mockImplementation(async (payload) => {
        expect(payload.transactions[0].clientIntakeUuid).toBe(clientIntakeUuid)
        expect(payload.transactions[0].idempotencyKey).toBe(idempotencyKey)

        // Server detects idempotent replay from PostgreSQL and returns REPLAYED
        return {
          batchId: payload.batchId,
          requestId: 'req-replay-ack',
          summary: {
            received: 1,
            accepted: 0,
            replayed: 1,
            rejected: 0,
            retryable: 0,
          },
          results: [
            {
              clientIntakeUuid,
              idempotencyKey,
              status: 'REPLAYED',
              isIdempotentReplay: true,
              serverTransactionId: serverTxnId,
              receiptNumber: canonicalReceipt,
            },
          ],
        }
      })

      const syncResult = await syncEngine.triggerSync()
      expect(syncResult.succeeded).toBe(1)

      // Step 6: Client updates original local row to SYNCED_CLOUD with canonical receipt
      const postSyncTxn = await localDB.getTransactionById(clientIntakeUuid)
      expect(postSyncTxn?.syncStatus).toBe('SYNCED_CLOUD')
      expect(postSyncTxn?.serverTransactionId).toBe(serverTxnId)
      expect(postSyncTxn?.receiptNumber).toBe(canonicalReceipt)

      // Step 7: offline_queue item removed atomically
      const remainingQueue = await localDB.getOfflineQueue()
      expect(remainingQueue.some((i) => i.clientIntakeUuid === clientIntakeUuid)).toBe(false)
    })
  })
})
