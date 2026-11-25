// DFarm Collection App — Storage Quota & Persistence Service
// Requests durable storage via Chromium Storage API and monitors disk usage against thresholds

import type { StorageQuotaStatus } from '@/types'

const WARNING_THRESHOLD_PERCENT = 70
const CRITICAL_THRESHOLD_PERCENT = 85

class StoragePersistenceService {
  private persisted: boolean | null = null

  /**
   * Requests persistent storage permission from the browser.
   * In Chromium, persistent storage prevents IndexedDB eviction under low disk conditions.
   * Does NOT block application execution while awaiting determination.
   */
  public async requestPersistentStorage(): Promise<boolean> {
    if (this.persisted !== null) return this.persisted

    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist()
        this.persisted = isPersisted
        if (isPersisted) {
          console.info('[Storage] Durable Chromium persistent storage granted.')
        } else {
          console.warn('[Storage] Persistent storage not granted; operating in standard storage mode.')
        }
        return isPersisted
      }
    } catch (err) {
      console.warn('[Storage] Error requesting storage persistence:', err)
    }

    this.persisted = false
    return false
  }

  /**
   * Checks whether the current storage bucket is persisted.
   */
  public async isPersisted(): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
        return await navigator.storage.persisted()
      }
    } catch {
      // Fallback
    }
    return false
  }

  /**
   * Retrieves estimated storage quota and usage.
   * Reports warning thresholds (70% and 85%).
   */
  public async getStorageEstimate(): Promise<StorageQuotaStatus> {
    let usageBytes = 0
    let quotaBytes = 0
    let percentageUsed = 0

    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate()
        usageBytes = estimate.usage || 0
        quotaBytes = estimate.quota || 0
        if (quotaBytes > 0) {
          percentageUsed = Number(((usageBytes / quotaBytes) * 100).toFixed(1))
        }
      }
    } catch (err) {
      console.warn('[Storage] Could not calculate storage estimate:', err)
    }

    const isPersisted = await this.isPersisted()

    return {
      isPersisted,
      usageBytes,
      quotaBytes,
      percentageUsed,
      isWarning: percentageUsed >= WARNING_THRESHOLD_PERCENT,
      isCritical: percentageUsed >= CRITICAL_THRESHOLD_PERCENT,
    }
  }

  /**
   * Determines whether an error is a QuotaExceededError.
   */
  public isQuotaExceededError(err: any): boolean {
    if (!err) return false
    return (
      err.name === 'QuotaExceededError' ||
      err.code === 22 ||
      String(err.message || '').toLowerCase().includes('quota')
    )
  }
}

export const storagePersistence = new StoragePersistenceService()
