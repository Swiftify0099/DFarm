// DFarm Collection App — IndexedDB Local Persistence Engine
// Offline-first transactional queue, cached patron templates, active sessions

import type {
  ActiveCollectionSession,
  CollectionTransaction,
  CustomerIdentity,
  OfflineQueueItem,
  RateMatrixConfig,
} from '@/types'

const DB_NAME = 'dfarm_collection_local_db'
const DB_VERSION = 1

export class LocalCollectionDB {
  private db: IDBDatabase | null = null

  public async init(): Promise<void> {
    if (this.db) return

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        if (!db.objectStoreNames.contains('offline_queue')) {
          db.createObjectStore('offline_queue', { keyPath: 'eventId' })
        }
        if (!db.objectStoreNames.contains('active_session')) {
          db.createObjectStore('active_session', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('customers_cache')) {
          db.createObjectStore('customers_cache', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('completed_transactions')) {
          db.createObjectStore('completed_transactions', { keyPath: 'id' })
        }
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onerror = () => {
        reject(new Error('Failed to open local IndexedDB'))
      }
    })
  }

  // Queue an offline collection transaction
  public async queueOfflineTransaction(txn: CollectionTransaction): Promise<OfflineQueueItem> {
    await this.init()
    const item: OfflineQueueItem = {
      eventId: `OFFLINE-EVT-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      transactionId: txn.id,
      customerCode: txn.customerCode,
      customerName: txn.customerName,
      timestamp: txn.timestamp,
      retryCount: 0,
      status: 'QUEUED',
      errorReason: null,
      transaction: txn,
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('offline_queue', 'readwrite')
      const store = tx.objectStore('offline_queue')
      const req = store.add(item)
      req.onsuccess = () => resolve(item)
      req.onerror = () => reject(new Error('Failed to write offline transaction'))
    })
  }

  // Get all items in offline queue
  public async getOfflineQueue(): Promise<OfflineQueueItem[]> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('offline_queue', 'readonly')
      const store = tx.objectStore('offline_queue')
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(new Error('Failed to read offline queue'))
    })
  }

  // Remove resolved item from queue
  public async removeQueueItem(eventId: string): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('offline_queue', 'readwrite')
      const store = tx.objectStore('offline_queue')
      const req = store.delete(eventId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(new Error('Failed to delete item from queue'))
    })
  }

  // Store completed transaction in local journal
  public async saveCompletedTransaction(txn: CollectionTransaction): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('completed_transactions', 'readwrite')
      const store = tx.objectStore('completed_transactions')
      const req = store.put(txn)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(new Error('Failed to save completed transaction'))
    })
  }

  public async saveTransaction(txn: CollectionTransaction): Promise<void> {
    return this.saveCompletedTransaction(txn)
  }

  // Get recent transactions for active shift
  public async getRecentTransactions(): Promise<CollectionTransaction[]> {
    await this.init()
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction('completed_transactions', 'readonly')
      const store = tx.objectStore('completed_transactions')
      const req = store.getAll()
      req.onsuccess = () => {
        const list: CollectionTransaction[] = req.result || []
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        resolve(list)
      }
      req.onerror = () => reject(new Error('Failed to load completed transactions'))
    })
  }

  public async getTransactions(): Promise<CollectionTransaction[]> {
    return this.getRecentTransactions()
  }
}

export const localDB = new LocalCollectionDB()
