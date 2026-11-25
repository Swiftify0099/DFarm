// DFarm Collection App — Multi-Tab and Multiple Sync Worker Protection Service
// Guarantees mutually exclusive queue processing across concurrent kiosk browser tabs,
// PWA instances, and worker restarts.
//
// Dual-Layer Safety Strategy:
// Layer 1: W3C Web Locks API (navigator.locks) with ifAvailable non-blocking acquisition.
// Layer 2: Persistent IndexedDB Advisory Lock with owner identifier, TTL, and crash recovery.

import { localDB } from './local-storage'

export interface LockAcquisitionResult {
  acquired: boolean
  ownerId: string
  lockKey: string
  release: () => Promise<void>
}

export class MultiTabSyncLock {
  private ownerId: string
  private activeLocks: Map<string, { releaseCallback?: () => void }> = new Map()
  private heartbeatTimers: Map<string, any> = new Map()

  constructor(customOwnerId?: string) {
    this.ownerId = customOwnerId || `worker-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  }

  public getOwnerId(): string {
    return this.ownerId
  }

  public setOwnerIdForTesting(newOwnerId: string): void {
    this.ownerId = newOwnerId
  }

  /**
   * Generates a station-scoped lock key.
   */
  public getLockKey(dairyId?: string | null, stationId?: string | null): string {
    const d = (dairyId || 'default').trim().toLowerCase()
    const s = (stationId || 'kiosk').trim().toLowerCase()
    return `dfarm_sync_lock_${d}_${s}`
  }

  /**
   * Starts active lease renewal (heartbeat) while the worker is actively executing.
   * Periodically extends expiresAt in IndexedDB so long-running sync requests (> 45s)
   * do not expire prematurely and get stolen by another tab.
   */
  public startHeartbeat(lockKey: string, ttlMs: number = 45000): void {
    this.stopHeartbeat(lockKey)
    const intervalMs = Math.max(1000, Math.min(Math.floor(ttlMs / 3), 15000))
    const timer = setInterval(async () => {
      try {
        const renewed = await localDB.atomicRenewAdvisoryLock(lockKey, this.ownerId, ttlMs)
        if (!renewed) {
          console.warn(`[MultiTabLock] Heartbeat failed to renew lock '${lockKey}' for owner ${this.ownerId}`)
          this.stopHeartbeat(lockKey)
        }
      } catch (err) {
        console.warn(`[MultiTabLock] Heartbeat exception on lock '${lockKey}':`, err)
      }
    }, intervalMs)
    this.heartbeatTimers.set(lockKey, timer)
  }

  /**
   * Stops active heartbeat renewal timer.
   */
  public stopHeartbeat(lockKey: string): void {
    const timer = this.heartbeatTimers.get(lockKey)
    if (timer) {
      clearInterval(timer)
      this.heartbeatTimers.delete(lockKey)
    }
  }

  /**
   * Checks whether any live browser context currently holds the exclusive W3C Web Lock
   * for this lockKey. Returns null if navigator.locks.query is unavailable (e.g. non-browser test env).
   */
  public async isWebLockHeld(lockKey: string): Promise<boolean | null> {
    if (
      typeof navigator !== 'undefined' &&
      'locks' in navigator &&
      typeof navigator.locks?.query === 'function'
    ) {
      try {
        const snapshot = await navigator.locks.query()
        return Boolean(snapshot.held?.some((entry) => entry.name === lockKey))
      } catch {
        return null
      }
    }
    return null
  }

  /**
   * Executes a critical sync section protected by the multi-tab lock.
   * If the lock is held by another tab or worker, returns { executed: false } without throwing.
   */
  public async withLock<T>(
    lockKey: string,
    action: () => Promise<T>,
    ttlMs: number = 45000
  ): Promise<{ executed: boolean; result?: T; reason?: string }> {
    if (this.activeLocks.has(lockKey)) {
      return { executed: false, reason: 'LOCKED_BY_ANOTHER_TAB_IN_FLIGHT' }
    }
    this.activeLocks.set(lockKey, { releaseCallback: undefined })

    try {
      // 1. Try W3C Web Locks API if supported by the browser
      if (
        typeof navigator !== 'undefined' &&
        'locks' in navigator &&
        typeof navigator.locks?.request === 'function'
      ) {
        return await new Promise((resolve) => {
          navigator.locks.request(lockKey, { ifAvailable: true }, async (lock) => {
            if (!lock) {
              resolve({ executed: false, reason: 'LOCKED_BY_ANOTHER_TAB_WEBLOCK' })
              return
            }

            // Reclaim any orphaned IndexedDB advisory lock safely now that exclusive Web Lock is held
            const idbLock = await this.acquireIdbAdvisoryLock(lockKey, ttlMs, {
              forceReclaimOnWebLock: true,
            })
            if (!idbLock) {
              resolve({ executed: false, reason: 'LOCKED_BY_ANOTHER_TAB_IDB' })
              return
            }

            this.startHeartbeat(lockKey, ttlMs)
            try {
              const res = await action()
              resolve({ executed: true, result: res })
            } catch (err: any) {
              throw err
            } finally {
              this.stopHeartbeat(lockKey)
              await this.releaseIdbAdvisoryLock(lockKey)
            }
          }).catch((err) => {
            // If Web Locks throws unexpectedly, fallback to pure IDB lock
            console.warn('[MultiTabLock] Web Locks error, falling back to IDB lock:', err)
            this.executeWithIdbLockOnly(lockKey, action, ttlMs).then(resolve)
          })
        })
      }

      // 2. Fallback to IndexedDB Advisory Lock
      return await this.executeWithIdbLockOnly(lockKey, action, ttlMs)
    } finally {
      this.activeLocks.delete(lockKey)
    }
  }

  private async executeWithIdbLockOnly<T>(
    lockKey: string,
    action: () => Promise<T>,
    ttlMs: number
  ): Promise<{ executed: boolean; result?: T; reason?: string }> {
    const idbLock = await this.acquireIdbAdvisoryLock(lockKey, ttlMs)
    if (!idbLock) {
      return { executed: false, reason: 'LOCKED_BY_ANOTHER_TAB_IDB' }
    }

    this.startHeartbeat(lockKey, ttlMs)
    try {
      const res = await action()
      return { executed: true, result: res }
    } finally {
      this.stopHeartbeat(lockKey)
      await this.releaseIdbAdvisoryLock(lockKey)
    }
  }

  /**
   * Acquires an advisory lock in IndexedDB sync_metadata store.
   * Auto-recovers stale or abandoned locks after a process crash via atomic compare-and-update.
   */
  public async acquireIdbAdvisoryLock(
    lockKey: string,
    ttlMs: number = 45000,
    options?: { forceReclaimOnWebLock?: boolean }
  ): Promise<boolean> {
    try {
      return await localDB.atomicAcquireAdvisoryLock(lockKey, this.ownerId, ttlMs, options)
    } catch (err) {
      console.warn('[MultiTabLock] Error acquiring IDB advisory lock:', err)
      return false
    }
  }

  /**
   * Releases the advisory lock in IndexedDB sync_metadata store.
   * Strictly releases ONLY if owned by current ownerId.
   */
  public async releaseIdbAdvisoryLock(lockKey: string): Promise<void> {
    try {
      await localDB.atomicReleaseAdvisoryLock(lockKey, this.ownerId)
    } catch (err) {
      console.warn('[MultiTabLock] Error releasing IDB advisory lock:', err)
    }
  }
}

export const multiTabLock = new MultiTabSyncLock()
