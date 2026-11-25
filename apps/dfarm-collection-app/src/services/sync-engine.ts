// DFarm Collection App — Industrial-Grade Automatic Client Sync Engine
// Orchestrates offline-to-online reconciliation, bounded batching, exponential backoff with jitter,
// multi-tab concurrency protection, crash recovery, and canonical server acknowledgement.
//
// Primary Invariant: Every milk collection is locally committed in IndexedDB before any network relay.
// Retries preserve original clientIntakeUuid, idempotencyKey, and measurement values.

import type {
  OfflineQueueItem,
  SyncEngineStatus,
  CollectionTransaction,
} from '@/types'
import type {
  BulkCollectionSyncRequestDTO,
  BulkCollectionSyncResponseDTO,
  BulkCollectionItemDTO,
  BulkCollectionResultItemDTO,
} from '@dfarm/shared-types'
import { localDB } from './local-storage'
import { multiTabLock } from './multi-tab-lock'
import { networkManager } from './network-manager'
import { collectionsApi, getStoredOperatorAuth } from '@/api/client'

export type SyncEngineListener = (status: SyncEngineStatus) => void

export interface SyncEngineConfig {
  batchSize: number
  maxBatchSize: number
  baseBackoffMs: number
  maxBackoffMs: number
  maxRetries: number
  staleSyncingTimeoutMs: number
}

const DEFAULT_CONFIG: SyncEngineConfig = {
  batchSize: 25, // Conservative client batch size for fast mobile/kiosk processing
  maxBatchSize: 100, // Hard ceiling matching backend bulk limit
  baseBackoffMs: 1000, // 1s base backoff
  maxBackoffMs: 30000, // 30s maximum backoff
  maxRetries: 10,
  staleSyncingTimeoutMs: 60000, // 60s crash recovery threshold
}

export class CollectionSyncEngine {
  private config: SyncEngineConfig
  private isProcessing: boolean = false
  private listeners: Set<SyncEngineListener> = new Set()
  private scheduledRetryTimer: any = null
  private status: SyncEngineStatus = {
    isSyncing: false,
    state: 'IDLE',
    pendingCount: 0,
    syncingCount: 0,
    syncedCount: 0,
    retryableCount: 0,
    rejectedCount: 0,
    manualReviewCount: 0,
    lastSyncTime: null,
    lastSyncError: null,
    lastSyncErrorCode: null,
    nextRetryScheduledAt: null,
    currentBatchSize: DEFAULT_CONFIG.batchSize,
  }

  constructor(config: Partial<SyncEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Initializes the sync engine on application startup.
   * Recovers stale in-flight records, attaches network recovery listener, and refreshes metrics.
   */
  public async init(): Promise<void> {
    try {
      const { dairyId, centerId, isAuthenticated } = getStoredOperatorAuth()

      // 1. Crash Recovery: Return interrupted in-flight records to RETRYABLE.
      // When real Chrome Web Locks confirms no live tab holds the sync lock, crash recovery
      // executes immediately without waiting for staleSyncingTimeoutMs.
      let staleThresholdMs = this.config.staleSyncingTimeoutMs
      if (isAuthenticated && dairyId) {
        const lockKey = multiTabLock.getLockKey(dairyId, centerId)
        const webLockHeld = await multiTabLock.isWebLockHeld(lockKey)
        if (webLockHeld === false) {
          staleThresholdMs = 0
        }
      }

      const recovered = await localDB.recoverStaleSyncingItems(staleThresholdMs)
      if (recovered > 0) {
        console.info(`[SyncEngine] Crash recovery: Safely returned ${recovered} in-flight items to RETRYABLE.`)
      }

      // 2. Subscribe to Network State Manager recovery events
      networkManager.subscribeRestored(() => {
        console.info('[SyncEngine] Automatic network restoration detected. Triggering sync.')
        this.triggerSync().catch((err) => {
          console.warn('[SyncEngine] Error triggering sync on network recovery:', err)
        })
      })

      // 3. Initial Queue Metrics Refresh
      await this.refreshStatusMetrics()

      // 4. Preserve and honor persisted future nextAttemptAt retry schedules across restarts
      await this.scheduleNextPersistedRetry()

      // 5. Initial opportunistic sync if already online (only picks up eligible items whose nextAttemptAt has elapsed)
      if (networkManager.isOnline()) {
        setTimeout(() => {
          this.triggerSync().catch(() => {})
        }, 500)
      }
    } catch (err) {
      console.warn('[SyncEngine] Initialization error:', err)
    }
  }

  private async scheduleNextPersistedRetry(): Promise<void> {
    try {
      const allItems = await localDB.getOfflineQueue()
      const now = Date.now()
      let earliestFutureMs = Infinity

      for (const item of allItems) {
        const st = item.syncQueueStatus || item.status
        const isRetryable =
          st === 'PENDING' ||
          st === 'QUEUED' ||
          st === 'RETRYABLE' ||
          (st === 'FAILED' && !item.errorCode?.startsWith('PERM_'))
        if (!isRetryable) continue

        const nextAt = item.nextAttemptAt || item.nextRetryAt
        if (!nextAt) continue
        const targetMs = Date.parse(nextAt)
        if (Number.isFinite(targetMs) && targetMs > now && targetMs < earliestFutureMs) {
          earliestFutureMs = targetMs
        }
      }

      if (Number.isFinite(earliestFutureMs)) {
        const waitMs = Math.max(50, earliestFutureMs - now)
        this.status.nextRetryScheduledAt = new Date(earliestFutureMs).toISOString()
        if (!this.scheduledRetryTimer) {
          this.scheduleNextRetry(waitMs)
        }
      }
    } catch (err) {
      console.warn('[SyncEngine] Failed to inspect persisted retry schedule:', err)
    }
  }

  public getStatus(): SyncEngineStatus {
    return { ...this.status }
  }

  public subscribe(listener: SyncEngineListener): () => void {
    this.listeners.add(listener)
    listener(this.getStatus())
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    const current = this.getStatus()
    this.listeners.forEach((listener) => {
      try {
        listener(current)
      } catch (err) {
        console.warn('[SyncEngine] Error in status listener:', err)
      }
    })
  }

  /**
   * Refreshes queue counts from local IndexedDB.
   */
  public async refreshStatusMetrics(): Promise<void> {
    try {
      const summary = await localDB.getQueueSummary()
      this.status.pendingCount = summary.pending
      this.status.syncingCount = summary.syncing
      this.status.syncedCount = summary.synced
      this.status.retryableCount = summary.retryable
      this.status.rejectedCount = summary.rejected
      this.status.manualReviewCount = summary.manualReview
      this.notify()
    } catch (err) {
      console.warn('[SyncEngine] Failed to refresh queue metrics:', err)
    }
  }

  /**
   * Public entrypoint to trigger a queue synchronization cycle.
   * Thread-safe, multi-tab locked, and non-overlapping.
   */
  public async triggerSync(): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (this.isProcessing) {
      console.info('[SyncEngine] Sync cycle already in progress locally. Yielding.')
      return { processed: 0, succeeded: 0, failed: 0 }
    }

    if (!networkManager.isOnline()) {
      console.info('[SyncEngine] Network is currently offline or unreachable. Postponing sync.')
      return { processed: 0, succeeded: 0, failed: 0 }
    }

    const { dairyId, centerId, isAuthenticated } = getStoredOperatorAuth()
    if (!isAuthenticated || !dairyId) {
      this.status.state = 'AUTH_REQUIRED'
      this.notify()
      return { processed: 0, succeeded: 0, failed: 0 }
    }

    const lockKey = multiTabLock.getLockKey(dairyId, centerId)

    // Execute within multi-tab mutual exclusion lock
    const lockResult = await multiTabLock.withLock(lockKey, async () => {
      return await this.executeSyncCycle(dairyId)
    })

    if (!lockResult.executed) {
      console.info(`[SyncEngine] Yielded to active sync worker in another tab (${lockResult.reason}).`)
      return { processed: 0, succeeded: 0, failed: 0 }
    }

    return lockResult.result || { processed: 0, succeeded: 0, failed: 0 }
  }

  /**
   * Core bounded batch processing loop.
   */
  private async executeSyncCycle(
    dairyId: string
  ): Promise<{ processed: number; succeeded: number; failed: number }> {
    this.isProcessing = true
    this.status.isSyncing = true
    this.status.state = 'SYNCING'
    this.notify()

    let totalProcessed = 0
    let totalSucceeded = 0
    let totalFailed = 0

    try {
      // Loop while there are eligible items and network remains healthy
      while (networkManager.isOnline()) {
        const eligibleItems = await localDB.getEligibleQueueItems(this.config.batchSize)
        if (!eligibleItems || eligibleItems.length === 0) {
          // Zero eligible items remain
          break
        }

        // Filter and partition by organization (strict multi-tenant isolation)
        const tenantItems = eligibleItems.filter(
          (item) => (item.transaction?.dairyId || '').trim().toLowerCase() === dairyId.trim().toLowerCase()
        )

        if (tenantItems.length === 0) {
          break
        }

        const batchResult = await this.processBatch(tenantItems)
        totalProcessed += batchResult.processed
        totalSucceeded += batchResult.succeeded
        totalFailed += batchResult.failed

        await this.refreshStatusMetrics()

        // If batch was aborted due to auth or device revocation, halt loop immediately
        if ((this.status.state as string) === 'AUTH_REQUIRED' || (this.status.state as string) === 'DEVICE_BLOCKED') {
          break
        }

        // If batch encountered temporary error and scheduled retry, yield loop to observe backoff
        if (batchResult.hasTemporaryFailure) {
          break
        }
      }

      const nowIso = new Date().toISOString()
      this.status.lastSyncTime = nowIso
      this.status.lastSyncedAt = nowIso
      this.status.recordsSyncedLastRun = totalSucceeded
      if (this.status.state === 'SYNCING') {
        this.status.state = 'IDLE'
      }
      if (
        (this.status.state as string) !== 'AUTH_REQUIRED' &&
        (this.status.state as string) !== 'DEVICE_BLOCKED'
      ) {
        await this.scheduleNextPersistedRetry()
      }
    } catch (err: any) {
      console.warn('[SyncEngine] Unexpected error during sync cycle:', err)
      this.status.lastSyncError = err.message || 'Unknown sync error'
      this.status.state = 'IDLE'
    } finally {
      this.isProcessing = false
      this.status.isSyncing = false
      await this.refreshStatusMetrics()
    }

    return { processed: totalProcessed, succeeded: totalSucceeded, failed: totalFailed }
  }

  /**
   * Submits a single bounded batch to the backend and applies per-item reconciliation.
   */
  private async processBatch(
    items: OfflineQueueItem[]
  ): Promise<{ processed: number; succeeded: number; failed: number; hasTemporaryFailure: boolean }> {
    const clientUuids = items.map((i) => i.clientIntakeUuid || i.transactionId)

    // Step 1: Mark batch in-flight in IndexedDB
    await localDB.markTransactionsSyncing(clientUuids)

    // Step 2: Build BulkCollectionSyncRequestDTO with strict per-transaction lease mapping
    // RULE: A batch-level offline lease must never silently override or replace a transaction's original per-item lease.
    // If an item's original lease is missing, reject or pause that item for manual review. Never substitute the currently active session lease.
    const transactions: BulkCollectionItemDTO[] = []
    let allShareSameLease = true
    let firstItemLease: string | undefined = undefined

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx]
      const t = item.transaction
      const clientIntakeUuid = item.clientIntakeUuid || item.transactionId || t.id
      const idempotencyKey = t.idempotencyKey || `SYNC-${clientIntakeUuid}`

      // Authoritative per-transaction offline lease resolution:
      // 1. Transaction's own offlineAuthorizationToken attached at creation
      // 2. Queue item's offlineAuthorizationToken
      // 3. Original session-specific lease stored in IndexedDB for that session
      // STRICT REQUIREMENT: NEVER substitute the currently active session lease!
      let itemLease: string | undefined = t.offlineAuthorizationToken || item.offlineAuthorizationToken
      if (!itemLease) {
        const originalSessionAuth = await localDB.getSessionOfflineAuth(t.sessionId || (t as any).sessionCode)
        if (originalSessionAuth?.token) {
          itemLease = originalSessionAuth.token
        }
      }

      if (idx === 0) {
        firstItemLease = itemLease
      } else if (itemLease !== firstItemLease) {
        allShareSameLease = false
      }

      transactions.push({
        clientIntakeUuid,
        idempotencyKey,
        customerId: t.customerId,
        sessionId: t.sessionId,
        centerId: t.centerId,
        milkCategory: t.milkCategory as any,
        weightLiters: t.weightLiters,
        quantityLiters: t.weightLiters,
        fatPercentage: t.fatPercentage,
        fat: t.fatPercentage,
        snfPercentage: t.snfPercentage,
        snf: t.snfPercentage,
        clrDensity: t.clrDensity,
        collectionTimestamp: t.timestamp,
        businessDate: t.date,
        shift: t.shift,
        rateChartVersion: t.rateChartVersion,
        ratePerLiter: t.appliedRatePerLiter,
        totalAmount: t.totalAmount,
        identificationMethod: t.identificationMethod,
        deviceId: t.deviceId,
        offlineAuthorizationToken: itemLease || undefined,
      })
    }

    const batchId = `client-batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    // RULE: A batch-level offline lease must never silently override or replace a transaction's original per-item lease.
    // In Prompt 5.1+, every transaction carries its authoritative per-item offline lease.
    // Never attach active session lease at batch level. Only attach if all items share the exact same original lease.
    const batchLevelLease = (allShareSameLease && firstItemLease) ? firstItemLease : undefined

    const payload: BulkCollectionSyncRequestDTO = {
      batchId,
      schemaVersion: 1,
      deviceId: transactions[0]?.deviceId || 'KIOSK_MAIN',
      offlineAuthorizationToken: batchLevelLease || undefined,
      transactions,
    }

    let response: BulkCollectionSyncResponseDTO
    try {
      console.log('[SyncEngine DEBUG] Sending bulkSync payload with items:', transactions.length)
      response = await collectionsApi.bulkSync(payload)
      console.log('[SyncEngine DEBUG] Received bulkSync response:', JSON.stringify(response))
      networkManager.reportApiResult(200)
    } catch (netErr: any) {
      console.error('[SyncEngine DEBUG] bulkSync failed:', netErr)
      return await this.handleBatchNetworkFailure(items, netErr)
    }

    // Step 3: Handle Canonical Results per Item
    let succeeded = 0
    let failed = 0
    let hasTemporaryFailure = false

    const resultsMap = new Map<string, BulkCollectionResultItemDTO>()
    const rawResults = response.results || (response as any).items || []
    for (const res of rawResults) {
      if (res.clientIntakeUuid) {
        resultsMap.set(res.clientIntakeUuid, res)
      }
      if (res.idempotencyKey) {
        resultsMap.set(res.idempotencyKey, res)
      }
    }

    for (const item of items) {
      const uuid = item.clientIntakeUuid || item.transactionId
      const idempKey = item.transaction?.idempotencyKey
      const res = resultsMap.get(uuid) || (idempKey ? resultsMap.get(idempKey) : undefined)

      if (!res) {
        // Unmapped item (malformed or missing in backend response)
        // Strictly protect against data loss: never mark synced without server confirmation!
        console.warn(`[SyncEngine] Item ${uuid} missing from backend response. Scheduling safe retry.`)
        const backoffMs = this.calculateBackoff(item.retryCount || 0)
        await localDB.markTransactionRetryable(uuid, {
          errorReason: 'Missing result mapping in server response',
          errorCode: 'UNMAPPED_SERVER_RESPONSE',
          nextRetryAt: new Date(Date.now() + backoffMs).toISOString(),
        })
        failed++
        hasTemporaryFailure = true
        continue
      }

      console.log(`[SyncEngine DEBUG] Item status: ${res.status}, serverTransactionId: ${res.serverTransactionId}, receipt: ${res.receiptNumber}`)
      if (res.status === 'ACCEPTED' || res.status === 'REPLAYED') {
        // ====================================================================
        // TEST-ONLY FAULT INJECTION POINT (Prompt 5.1 Verification)
        // Strictly excluded from production bundles via import.meta.env.DEV.
        // Triggers AFTER backend committed PostgreSQL transaction and BEFORE
        // client persists acknowledgement in IndexedDB.
        // ====================================================================
        if (import.meta.env.DEV) {
          const testWindow = typeof window !== 'undefined' ? (window as any) : null
          if (testWindow && typeof testWindow.__DFARM_TEST_CRASH_BEFORE_ACK__ === 'function') {
            await testWindow.__DFARM_TEST_CRASH_BEFORE_ACK__({
              clientIntakeUuid: uuid,
              idempotencyKey: idempKey || (res as any).idempotencyKey,
              responseItem: res,
              backendCommitted: true,
            })
          }
        }

        // ACCEPTED or REPLAYED: Apply canonical server acknowledgement atomically
        await localDB.markTransactionSynced(uuid, {
          serverTransactionId: res.serverTransactionId,
          receiptNumber: res.receiptNumber,
          syncedAt: new Date().toISOString(),
        })
        succeeded++
      } else if (res.status === 'REJECTED') {
        const errCode = res.errorCode || (res as any).code
        const errMsg = res.errorMessage || (res as any).message || 'Server rejected collection'
        const isManualReview =
          errCode === 'IDEMPOTENCY_PAYLOAD_MISMATCH' ||
          errCode === 'OFFLINE_AUTHORIZATION_MISSING' ||
          errCode === 'OFFLINE_AUTHORIZATION_INVALID'
        const targetStatus = isManualReview ? 'MANUAL_REVIEW' : 'REJECTED'

        await localDB.markTransactionRejected(uuid, {
          errorCode: errCode,
          errorMessage: errMsg,
          status: targetStatus,
          rejectionTimestamp: new Date().toISOString(),
        })
        failed++

        if (errCode === 'DEVICE_BLOCKED') {
          networkManager.reportApiResult(403, 'DEVICE_BLOCKED')
          this.status.state = 'DEVICE_BLOCKED'
        }
      } else if (res.status === 'RETRYABLE') {
        const errCode = res.errorCode || (res as any).code
        const errMsg = res.errorMessage || (res as any).message || 'Temporary server retry requested'
        const retryAfterMs = this.parseRetryAfterMs((res as any).retryAfter)
        const backoffMs =
          retryAfterMs !== null ? retryAfterMs : this.calculateBackoff(item.retryCount || 0)
        const nextRetryIso = new Date(Date.now() + backoffMs).toISOString()

        await localDB.markTransactionRetryable(uuid, {
          errorReason: errMsg,
          errorCode: errCode || 'SERVER_RETRYABLE',
          nextRetryAt: nextRetryIso,
        })
        failed++
        hasTemporaryFailure = true
        if (backoffMs > 0) {
          this.status.nextRetryScheduledAt = nextRetryIso
          this.scheduleNextRetry(backoffMs)
        }
      }
    }

    return {
      processed: items.length,
      succeeded,
      failed,
      hasTemporaryFailure,
    }
  }

  /**
   * Classifies network, HTTP, and transport failures with exponential backoff & jitter.
   */
  private async handleBatchNetworkFailure(
    items: OfflineQueueItem[],
    error: any
  ): Promise<{ processed: number; succeeded: number; failed: number; hasTemporaryFailure: boolean }> {
    const statusCode = error.statusCode || error.status || 0
    const errorCode = error.code || error.errorCode || 'NETWORK_FAILURE'
    const errorMsg = error.message || 'Network request failed'

    networkManager.reportApiResult(statusCode, errorCode)

    // Case 1: Payload Too Large (HTTP 413) -> Split batch safely
    if (statusCode === 413 || errorCode === 'BATCH_SIZE_EXCEEDED') {
      console.warn(`[SyncEngine] Received HTTP 413 (Payload Too Large). Downscaling batch size.`)
      if (items.length > 1) {
        const half = Math.ceil(items.length / 2)
        const firstHalf = items.slice(0, half)
        const secondHalf = items.slice(half)

        // Reset in-flight status so halves can process
        await localDB.markTransactionsSyncing(items.map((i) => i.clientIntakeUuid || i.transactionId))

        const res1 = await this.processBatch(firstHalf)
        const res2 = await this.processBatch(secondHalf)
        return {
          processed: res1.processed + res2.processed,
          succeeded: res1.succeeded + res2.succeeded,
          failed: res1.failed + res2.failed,
          hasTemporaryFailure: res1.hasTemporaryFailure || res2.hasTemporaryFailure,
        }
      } else if (items.length === 1) {
        // Single item payload is too large for server acceptance.
        // Prevent an infinite retry loop of the same single item!
        const singleItem = items[0]
        const singleUuid = singleItem.clientIntakeUuid || singleItem.transactionId
        console.error(
          `[SyncEngine] Single transaction ${singleUuid} rejected with HTTP 413 (Payload Too Large). Marking for MANUAL_REVIEW.`
        )

        await localDB.markTransactionRejected(singleUuid, {
          errorCode: 'PAYLOAD_TOO_LARGE',
          errorMessage: 'Single transaction payload exceeds server limit (HTTP 413). Preserved locally for manual review.',
          status: 'MANUAL_REVIEW',
          rejectionTimestamp: new Date().toISOString(),
        })

        return {
          processed: 1,
          succeeded: 0,
          failed: 1,
          hasTemporaryFailure: false, // NOT temporary - do not retry automatically!
        }
      }
    }

    // Case 2: Authentication Expired (HTTP 401)
    if (statusCode === 401) {
      console.warn('[SyncEngine] HTTP 401: Authentication expired. Pausing sync engine.')
      this.status.state = 'AUTH_REQUIRED'
      this.status.lastSyncError = 'Operator authentication token expired. Please re-authenticate.'
      this.status.lastSyncErrorCode = 'AUTH_REQUIRED'
      for (const item of items) {
        const uuid = item.clientIntakeUuid || item.transactionId
        await localDB.markTransactionAuthRequired(uuid, {
          errorReason: 'Authentication expired (HTTP 401)',
          errorCode: 'AUTH_REQUIRED',
        })
      }
      return { processed: items.length, succeeded: 0, failed: items.length, hasTemporaryFailure: false }
    }

    // Case 3: Station Revoked or Forbidden (HTTP 403)
    if (statusCode === 403) {
      console.warn(`[SyncEngine] HTTP 403: Forbidden (${errorMsg}). Checking device status.`)
      const isDeviceBlocked = errorCode === 'DEVICE_BLOCKED' || String(errorMsg).includes('BLOCKED')
      if (isDeviceBlocked) {
        this.status.state = 'DEVICE_BLOCKED'
        this.status.lastSyncError = 'Collection station is BLOCKED or revoked by dairy administrator.'
        this.status.lastSyncErrorCode = 'DEVICE_BLOCKED'
        for (const item of items) {
          const uuid = item.clientIntakeUuid || item.transactionId
          await localDB.markTransactionRejected(uuid, {
            errorCode: 'DEVICE_BLOCKED',
            errorMessage: 'Station revoked. Offline transactions preserved for admin audit.',
            status: 'DEVICE_BLOCKED',
          })
        }
        return { processed: items.length, succeeded: 0, failed: items.length, hasTemporaryFailure: false }
      }
    }

    // Case 4: Temporary Server or Network Failure (5xx, 429, timeout, network offline)
    let backoffDelayMs = this.calculateBackoff(items[0]?.retryCount || 0)

    // Respect server Retry-After header if present (supports both seconds and HTTP-date)
    const parsedRetryAfterMs = this.parseRetryAfterMs(error.retryAfter)
    if (parsedRetryAfterMs !== null) {
      backoffDelayMs = parsedRetryAfterMs
    }

    const nextRetryDate = new Date(Date.now() + backoffDelayMs).toISOString()
    this.status.state = 'BACKOFF'
    this.status.nextRetryScheduledAt = nextRetryDate
    this.status.lastSyncError = errorMsg
    this.status.lastSyncErrorCode = errorCode

    console.info(`[SyncEngine] Temporary failure (${errorMsg}). Scheduling retry in ${(backoffDelayMs / 1000).toFixed(1)}s.`)

    for (const item of items) {
      const uuid = item.clientIntakeUuid || item.transactionId
      await localDB.markTransactionRetryable(uuid, {
        errorReason: errorMsg,
        errorCode,
        nextRetryAt: nextRetryDate,
      })
    }

    this.scheduleNextRetry(backoffDelayMs)

    return { processed: items.length, succeeded: 0, failed: items.length, hasTemporaryFailure: true }
  }

  /**
   * Parses HTTP Retry-After header values (integer seconds or HTTP-date),
   * bounded safely at 1 hour max without truncating explicit >30s directives down to maxBackoffMs.
   */
  public parseRetryAfterMs(retryAfter: unknown): number | null {
    if (retryAfter === undefined || retryAfter === null || retryAfter === '') return null
    const MAX_RETRY_AFTER_MS = 3600 * 1000
    if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0) {
      return Math.min(Math.round(retryAfter * 1000), MAX_RETRY_AFTER_MS)
    }
    const raw = String(retryAfter).trim()
    if (/^\d+(\.\d+)?$/.test(raw)) {
      const secs = Number(raw)
      if (Number.isFinite(secs) && secs > 0) {
        return Math.min(Math.round(secs * 1000), MAX_RETRY_AFTER_MS)
      }
    }
    const dateMs = Date.parse(raw)
    if (Number.isFinite(dateMs)) {
      const deltaMs = dateMs - Date.now()
      if (deltaMs > 0) {
        return Math.min(deltaMs, MAX_RETRY_AFTER_MS)
      }
    }
    return null
  }

  /**
   * Bounded exponential backoff with random jitter.
   * Schedule: 1s, 2s, 4s, 8s, 16s, max 30s.
   * Jitter: ±20% randomized spread to prevent thundering herd on backend recovery.
   */
  public calculateBackoff(retryCount: number): number {
    const exp = Math.min(retryCount, 6)
    const delay = Math.min(this.config.baseBackoffMs * Math.pow(2, exp), this.config.maxBackoffMs)
    // Add jitter between -20% and +20%
    const jitter = delay * (0.8 + Math.random() * 0.4)
    return Math.floor(jitter)
  }

  public destroy(): void {
    if (this.scheduledRetryTimer) {
      clearTimeout(this.scheduledRetryTimer)
      this.scheduledRetryTimer = null
    }
    this.listeners.clear()
    this.isProcessing = false
  }

  private scheduleNextRetry(delayMs: number): void {
    if (this.scheduledRetryTimer) clearTimeout(this.scheduledRetryTimer)

    this.scheduledRetryTimer = setTimeout(() => {
      this.scheduledRetryTimer = null
      this.status.nextRetryScheduledAt = null
      if (networkManager.isOnline()) {
        this.triggerSync().catch(() => {})
      }
    }, delayMs)
  }
}

export const syncEngine = new CollectionSyncEngine()
