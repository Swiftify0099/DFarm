// DFarm Collection App — Industrial-Grade IndexedDB Local-First Persistence Engine
// Strictly commits all milk intake transactions locally before initiating any cloud relay
// Guarantees atomic multi-store writes, strict durability, and complete offline operational cache

import type {
  ActiveCollectionSession,
  CollectionTransaction,
  CustomerIdentity,
  MilkCategory,
  OfflineQueueItem,
  RateChartCacheItem,
  SyncMetadataItem,
  SyncQueueStatus,
  TransactionSyncStatus,
} from '@/types'

const DB_NAME = 'dfarm_collection_local_db'
const DB_VERSION = 2

export class LocalCollectionDB {
  private db: IDBDatabase | null = null
  private initPromise: Promise<IDBDatabase> | null = null

  /**
   * Initializes or upgrades the local IndexedDB database.
   * Handles migrations from version 1 to version 2 without data loss.
   */
  public async init(): Promise<IDBDatabase> {
    if (this.db) return this.db
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const oldVersion = event.oldVersion

        console.info(`[IndexedDB] Upgrading schema from version ${oldVersion} to ${DB_VERSION}`)

        // 1. offline_queue store
        let queueStore: IDBObjectStore
        if (!db.objectStoreNames.contains('offline_queue')) {
          queueStore = db.createObjectStore('offline_queue', { keyPath: 'eventId' })
        } else {
          queueStore = (event.target as any).transaction.objectStore('offline_queue')
        }
        if (!queueStore.indexNames.contains('clientIntakeUuid')) {
          queueStore.createIndex('clientIntakeUuid', 'clientIntakeUuid', { unique: false })
        }
        if (!queueStore.indexNames.contains('status')) {
          queueStore.createIndex('status', 'status', { unique: false })
        }
        if (!queueStore.indexNames.contains('timestamp')) {
          queueStore.createIndex('timestamp', 'timestamp', { unique: false })
        }

        // 2. completed_transactions store
        let completedStore: IDBObjectStore
        if (!db.objectStoreNames.contains('completed_transactions')) {
          completedStore = db.createObjectStore('completed_transactions', { keyPath: 'id' })
        } else {
          completedStore = (event.target as any).transaction.objectStore('completed_transactions')
        }
        if (!completedStore.indexNames.contains('timestamp')) {
          completedStore.createIndex('timestamp', 'timestamp', { unique: false })
        }
        if (!completedStore.indexNames.contains('syncStatus')) {
          completedStore.createIndex('syncStatus', 'syncStatus', { unique: false })
        }
        if (!completedStore.indexNames.contains('customerId')) {
          completedStore.createIndex('customerId', 'customerId', { unique: false })
        }
        if (!completedStore.indexNames.contains('sessionId')) {
          completedStore.createIndex('sessionId', 'sessionId', { unique: false })
        }
        if (!completedStore.indexNames.contains('clientIntakeUuid')) {
          completedStore.createIndex('clientIntakeUuid', 'clientIntakeUuid', { unique: false })
        }

        // 3. active_session store
        if (!db.objectStoreNames.contains('active_session')) {
          db.createObjectStore('active_session', { keyPath: 'id' })
        }

        // 4. customers_cache store
        let custStore: IDBObjectStore
        if (!db.objectStoreNames.contains('customers_cache')) {
          custStore = db.createObjectStore('customers_cache', { keyPath: 'id' })
        } else {
          custStore = (event.target as any).transaction.objectStore('customers_cache')
        }
        if (!custStore.indexNames.contains('customerCode')) {
          custStore.createIndex('customerCode', 'customerCode', { unique: false })
        }
        if (!custStore.indexNames.contains('rfidCardUid')) {
          custStore.createIndex('rfidCardUid', 'rfidCardUid', { unique: false })
        }
        if (!custStore.indexNames.contains('dairyId')) {
          custStore.createIndex('dairyId', 'dairyId', { unique: false })
        }

        // 5. rate_charts_cache store
        let rateStore: IDBObjectStore
        if (!db.objectStoreNames.contains('rate_charts_cache')) {
          rateStore = db.createObjectStore('rate_charts_cache', { keyPath: 'id' })
        } else {
          rateStore = (event.target as any).transaction.objectStore('rate_charts_cache')
        }
        if (!rateStore.indexNames.contains('milkCategory')) {
          rateStore.createIndex('milkCategory', 'milkCategory', { unique: false })
        }
        if (!rateStore.indexNames.contains('dairyId')) {
          rateStore.createIndex('dairyId', 'dairyId', { unique: false })
        }

        // 6. sync_metadata store
        if (!db.objectStoreNames.contains('sync_metadata')) {
          db.createObjectStore('sync_metadata', { keyPath: 'key' })
        }
      }

      request.onsuccess = () => {
        this.db = request.result

        // Handle version change / closing from another tab
        this.db.onversionchange = () => {
          console.warn('[IndexedDB] Database version change detected, closing active connection.')
          this.db?.close()
          this.db = null
          this.initPromise = null
        }

        resolve(this.db)
      }

      request.onerror = () => {
        this.initPromise = null
        reject(request.error || new Error('Failed to open local IndexedDB'))
      }

      request.onblocked = () => {
        console.warn('[IndexedDB] Database upgrade blocked by another active connection.')
      }
    })

    return this.initPromise
  }

  /**
   * Helper to open an IDB transaction with strict durability when supported by Chromium.
   */
  private getTransaction(storeNames: string | string[], mode: IDBTransactionMode): IDBTransaction {
    if (!this.db) {
      throw new Error('IndexedDB not initialized. Call init() first.')
    }
    const names = Array.isArray(storeNames) ? storeNames : [storeNames]
    try {
      // W3C spec supports { durability: 'strict' } on readwrite transactions
      if (mode === 'readwrite') {
        return (this.db as any).transaction(names, mode, { durability: 'strict' })
      }
      return this.db.transaction(names, mode)
    } catch {
      // Fallback for browsers or test environments without durability options support
      return this.db.transaction(names, mode)
    }
  }

  // ============================================================================
  // TASK 1 & 2: ATOMIC MULTI-STORE INTAKE PERSISTENCE
  // ============================================================================

  /**
   * Saves a finalized milk intake transaction atomically across BOTH stores:
   * 1. 'completed_transactions' (permanent local journal)
   * 2. 'offline_queue' (pending upstream synchronization)
   *
   * ACID Guarantees:
   * - Both writes execute in ONE readwrite transaction.
   * - Resolves ONLY after tx.oncomplete event confirms disk flush.
   * - If either put() fails or the transaction aborts, the entire transaction rolls back.
   */
  public async saveIntakeAtomically(
    txn: CollectionTransaction,
    queueItem: OfflineQueueItem
  ): Promise<{ transaction: CollectionTransaction; queueItem: OfflineQueueItem }> {
    await this.init()

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction(['completed_transactions', 'offline_queue'], 'readwrite')

        tx.oncomplete = () => {
          resolve({ transaction: txn, queueItem })
        }

        tx.onerror = (evt) => {
          const err = tx.error || (evt.target as any)?.error || new Error('Atomic IndexedDB save transaction failed')
          reject(err)
        }

        tx.onabort = () => {
          const err = tx.error || new Error('Atomic IndexedDB save transaction aborted')
          reject(err)
        }

        const completedStore = tx.objectStore('completed_transactions')
        const queueStore = tx.objectStore('offline_queue')

        completedStore.put(txn)
        queueStore.put(queueItem)
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Updates a locally committed transaction upon server acknowledgement:
   * - Marks completed_transactions row as 'SYNCED_CLOUD' with serverTransactionId and receiptNumber.
   * - Removes the corresponding entry from offline_queue.
   * Both operations commit atomically in a single transaction.
   */
  public async markTransactionSynced(
    clientIntakeUuid: string,
    serverData: {
      serverTransactionId?: string
      receiptNumber?: string
      syncedAt?: string
    }
  ): Promise<void> {
    await this.init()

    return new Promise((resolve, reject) => {
      try {
        let abortReason: Error | null = null
        const tx = this.getTransaction(['completed_transactions', 'offline_queue'], 'readwrite')

        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(abortReason || tx.error || new Error('Failed to update synced transaction in IndexedDB'))
        tx.onabort = (e: any) =>
          reject(abortReason || tx.error || (e?.target as any)?.error || new Error('Sync acknowledgement transaction aborted'))

        const completedStore = tx.objectStore('completed_transactions')
        const queueStore = tx.objectStore('offline_queue')

        // 1. Fetch current record in completed_transactions
        const getReq = completedStore.get(clientIntakeUuid)
        getReq.onsuccess = () => {
          const existing = getReq.result as CollectionTransaction | undefined
          if (!existing) {
            // CRITICAL INTEGRITY SAFEGUARD (Priority 3):
            // Abort immediately and do NOT delete queue item if completed record is missing!
            abortReason = new Error(
              `[markTransactionSynced] Cannot mark non-existent transaction as synced: ${clientIntakeUuid}`
            )
            try {
              tx.abort()
            } catch {
              // Ignore if already aborted
            }
            reject(abortReason)
            return
          }

          // 2. Safely update completed_transactions
          existing.syncStatus = 'SYNCED_CLOUD'
          if (serverData.serverTransactionId) {
            existing.serverTransactionId = serverData.serverTransactionId
          }
          if (serverData.receiptNumber) {
            existing.receiptNumber = serverData.receiptNumber
          }
          existing.syncedAt = serverData.syncedAt || new Date().toISOString()
          completedStore.put(existing)

          // 3. ONLY delete from offline_queue after verifying completed transaction was updated
          queueStore.delete(`EVT-${clientIntakeUuid}`)
          queueStore.delete(clientIntakeUuid)

          if (queueStore.indexNames.contains('clientIntakeUuid')) {
            const idx = queueStore.index('clientIntakeUuid')
            const idxReq = idx.openCursor(IDBKeyRange.only(clientIntakeUuid))
            idxReq.onsuccess = (e) => {
              const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result
              if (cursor) {
                cursor.delete()
                cursor.continue()
              }
            }
          }
        }

        getReq.onerror = () => {
          try {
            tx.abort()
          } catch {}
          reject(getReq.error || new Error(`[markTransactionSynced] Failed to read transaction: ${clientIntakeUuid}`))
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  // ============================================================================
  // OFFLINE QUEUE MANAGEMENT
  // ============================================================================

  /**
   * Queue a transaction in offline_queue individually (fallback / direct queueing).
   */
  public async queueOfflineTransaction(txn: CollectionTransaction): Promise<OfflineQueueItem> {
    await this.init()
    const uuid = txn.clientIntakeUuid || txn.id
    const item: OfflineQueueItem = {
      eventId: `EVT-${uuid}`,
      transactionId: uuid,
      clientIntakeUuid: uuid,
      customerCode: txn.customerCode,
      customerName: txn.customerName,
      timestamp: txn.timestamp,
      retryCount: 0,
      status: 'QUEUED',
      errorReason: null,
      lastAttemptedAt: null,
      transaction: txn,
    }

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('offline_queue', 'readwrite')
        tx.oncomplete = () => resolve(item)
        tx.onerror = () => reject(tx.error || new Error('Failed to queue offline transaction'))
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted while queueing'))
        tx.objectStore('offline_queue').put(item)
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Retrieve all items in the offline queue pending synchronization.
   */
  public async getOfflineQueue(): Promise<OfflineQueueItem[]> {
    await this.init()
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('offline_queue', 'readonly')
        const store = tx.objectStore('offline_queue')
        const req = store.getAll()
        req.onsuccess = () => resolve(req.result || [])
        req.onerror = () => reject(req.error || new Error('Failed to read offline queue'))
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Returns count of records pending synchronization.
   */
  public async getPendingQueueCount(): Promise<number> {
    await this.init()
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('offline_queue', 'readonly')
        const store = tx.objectStore('offline_queue')
        const req = store.count()
        req.onsuccess = () => resolve(req.result || 0)
        req.onerror = () => reject(req.error || new Error('Failed to count offline queue items'))
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Updates status, retry count and last error reason for an offline queue item.
   */
  public async updateQueueItemStatus(
    eventId: string,
    status: OfflineQueueItem['status'],
    errorReason: string | null = null
  ): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('offline_queue', 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('Failed to update queue item status'))
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted during status update'))

        const store = tx.objectStore('offline_queue')
        const getReq = store.get(eventId)
        getReq.onsuccess = () => {
          const item = getReq.result as OfflineQueueItem | undefined
          if (item) {
            item.status = status
            item.errorReason = errorReason
            item.lastAttemptedAt = new Date().toISOString()
            if (status === 'FAILED') {
              item.retryCount = (item.retryCount || 0) + 1
            }
            store.put(item)
          }
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Removes a resolved item from the offline queue.
   */
  public async removeQueueItem(eventId: string): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('offline_queue', 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('Failed to delete item from offline queue'))
        tx.onabort = () => reject(tx.error || new Error('Delete transaction aborted'))
        tx.objectStore('offline_queue').delete(eventId)
      } catch (err) {
        reject(err)
      }
    })
  }

  // ============================================================================
  // COMPLETED TRANSACTIONS JOURNAL
  // ============================================================================

  /**
   * Store or update a completed transaction in local journal.
   */
  public async saveCompletedTransaction(txn: CollectionTransaction): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('completed_transactions', 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('Failed to save completed transaction'))
        tx.onabort = () => reject(tx.error || new Error('Save transaction aborted'))
        tx.objectStore('completed_transactions').put(txn)
      } catch (err) {
        reject(err)
      }
    })
  }

  public async saveTransaction(txn: CollectionTransaction): Promise<void> {
    return this.saveCompletedTransaction(txn)
  }

  /**
   * Get recent transactions sorted newest first.
   */
  public async getRecentTransactions(limit: number = 100): Promise<CollectionTransaction[]> {
    await this.init()
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('completed_transactions', 'readonly')
        const store = tx.objectStore('completed_transactions')
        const req = store.getAll()
        req.onsuccess = () => {
          const list: CollectionTransaction[] = req.result || []
          list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          resolve(list.slice(0, limit))
        }
        req.onerror = () => reject(req.error || new Error('Failed to load completed transactions'))
      } catch (err) {
        reject(err)
      }
    })
  }

  public async getTransactions(): Promise<CollectionTransaction[]> {
    return this.getRecentTransactions()
  }

  public async getTransactionById(id: string): Promise<CollectionTransaction | null> {
    await this.init()
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('completed_transactions', 'readonly')
        const req = tx.objectStore('completed_transactions').get(id)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error || new Error('Failed to get transaction by id'))
      } catch (err) {
        reject(err)
      }
    })
  }

  // ============================================================================
  // ACTIVE SHIFT SESSION PERSISTENCE & HYDRATION
  // ============================================================================

  /**
   * Persists active session details into IndexedDB.
   */
  public async saveActiveSession(session: ActiveCollectionSession): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('active_session', 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('Failed to save active session'))
        tx.onabort = () => reject(tx.error || new Error('Active session save aborted'))
        tx.objectStore('active_session').put(session)
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Retrieves active collection session from local IndexedDB cache.
   * Enables immediate hydration on offline boot or browser reload.
   * Strictly enforces:
   * 1. Mandatory tenant isolation (dairyId required; missing tenant NEVER acts as a wildcard).
   * 2. Collection center isolation (centerId match if provided; fails closed if absent without explicit dairy-wide scope).
   * 3. Counter/device isolation (deviceId match if provided).
   * 4. Session status must be OPEN and not closedAt.
   * 5. Authoritative Business Date validity: session date must match the current business date calculated
   *    in the dairy's configured IANA timezone (or options.timezone). Stale sessions from previous business dates
   *    or sessions missing business date are rejected. Broad multi-timezone acceptance sets are prohibited.
   */
  public async getActiveSession(
    dairyId?: string,
    centerId?: string,
    deviceId?: string,
    options?: {
      isDairyWideAuthorized?: boolean
      timezone?: string
      currentDate?: string
    }
  ): Promise<ActiveCollectionSession | null> {
    if (!dairyId || !dairyId.trim()) {
      // Missing tenant context must NEVER act as a wildcard
      return null
    }
    await this.init()
    const targetDairy = dairyId.trim().toLowerCase()
    const targetCenter = centerId && centerId.trim() ? centerId.trim().toLowerCase() : null
    const targetDevice = deviceId && deviceId.trim() ? deviceId.trim().toLowerCase() : null
    const isDairyWide = Boolean(options?.isDairyWideAuthorized)

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('active_session', 'readonly')
        const store = tx.objectStore('active_session')
        const req = store.getAll()
        req.onsuccess = () => {
          let sessions: ActiveCollectionSession[] = req.result || []

          // 1. Filter by mandatory dairy tenant
          sessions = sessions.filter(
            (s) => s.dairyId && s.dairyId.trim().toLowerCase() === targetDairy
          )

          // 2. Filter by center if specified, or fail closed if centre-restricted
          if (targetCenter) {
            sessions = sessions.filter(
              (s) => s.centerId && s.centerId.trim().toLowerCase() === targetCenter
            )
          } else if (!isDairyWide) {
            // Missing center on centre-restricted station fails closed
            sessions = sessions.filter((s) => !s.centerId)
          }

          // 3. Filter by device if specified
          if (targetDevice) {
            sessions = sessions.filter(
              (s) => s.deviceId && s.deviceId.trim().toLowerCase() === targetDevice
            )
          }

          // 4. Filter for currently OPEN sessions only
          let openSessions = sessions.filter((s) => s.status === 'OPEN' && !s.closedAt)

          // 5. Enforce Authoritative Business Date Validity using Dairy Configured Timezone
          // Reject stale sessions, missing dates, or previous business dates.
          openSessions = openSessions.filter((s) => {
            const sessionDate = s.businessDate || s.date
            if (!sessionDate || !sessionDate.trim()) {
              console.warn(`[getActiveSession] Rejecting session (${s.sessionCode}) missing business date.`)
              return false
            }

            // Determine authoritative timezone (priority: options.timezone -> session.timezone)
            // Stale, missing, or invalid timezones fail closed - no silent fallback to browser/UTC
            const targetTimezone = options?.timezone || s.timezone
            if (!targetTimezone || !targetTimezone.trim()) {
              console.warn(`[getActiveSession] Rejecting session (${s.sessionCode}) due to missing authoritative timezone.`)
              return false
            }

            // Compute authoritative current date in that configured timezone
            let authoritativeToday: string
            if (options?.currentDate) {
              authoritativeToday = options.currentDate
            } else {
              try {
                authoritativeToday = new Intl.DateTimeFormat('en-CA', { timeZone: targetTimezone }).format(new Date())
              } catch {
                console.warn(`[getActiveSession] Rejecting session (${s.sessionCode}) due to unresolvable/invalid timezone: ${targetTimezone}`)
                return false
              }
            }

            if (sessionDate.trim() !== authoritativeToday.trim()) {
              console.warn(
                `[getActiveSession] Rejecting stale cached session (${s.sessionCode}) from past business date: ${sessionDate} vs authoritative: ${authoritativeToday} (${targetTimezone})`
              )
              return false
            }
            return true
          })

          if (openSessions.length === 0) {
            resolve(null)
            return
          }

          // Sort latest opened first
          openSessions.sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime())
          resolve(openSessions[0])
        }
        req.onerror = () => reject(req.error || new Error('Failed to load cached active session'))
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Clears or updates session when closed.
   */
  public async clearActiveSession(sessionId?: string, dairyId?: string, centerId?: string): Promise<void> {
    await this.init()
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('active_session', 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('Failed to clear active session'))
        const store = tx.objectStore('active_session')
        if (sessionId) {
          store.delete(sessionId)
        } else if (dairyId && dairyId.trim()) {
          const req = store.getAll()
          req.onsuccess = () => {
            const sessions: ActiveCollectionSession[] = req.result || []
            const normalizedDairy = dairyId.trim().toLowerCase()
            const normalizedCenter = centerId && centerId.trim() ? centerId.trim().toLowerCase() : null
            for (const s of sessions) {
              const dairyMatches = s.dairyId && s.dairyId.trim().toLowerCase() === normalizedDairy
              const centerMatches = !normalizedCenter || (s.centerId && s.centerId.trim().toLowerCase() === normalizedCenter)
              if (dairyMatches && centerMatches) {
                store.delete(s.id)
              }
            }
          }
        } else {
          store.clear()
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  // ============================================================================
  // CUSTOMER DIRECTORY & RFID CACHE (TENANT & CENTER ISOLATED)
  // ============================================================================

  /**
   * Caches customer directory records in IndexedDB for offline identification.
   */
  public async saveCustomersCache(customers: CustomerIdentity[], dairyId?: string, centerId?: string): Promise<void> {
    await this.init()
    if (!customers || customers.length === 0) return

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('customers_cache', 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('Failed to save customers cache'))
        tx.onabort = () => reject(tx.error || new Error('Customer cache save aborted'))

        const store = tx.objectStore('customers_cache')
        for (const cust of customers) {
          if (dairyId && !cust.dairyId) {
            cust.dairyId = dairyId
          }
          if (centerId && !cust.centerId) {
            cust.centerId = centerId
          }
          store.put(cust)
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Loads cached customers from IndexedDB for a specific dairy tenant and center.
   * Enforces tenant and centre isolation — missing dairyId rejects; missing centerId fails closed
   * unless explicit dairy-wide scope is authorized.
   */
  public async getCustomersCache(
    dairyId?: string,
    centerId?: string,
    options?: { isDairyWideAuthorized?: boolean }
  ): Promise<CustomerIdentity[]> {
    if (!dairyId || !dairyId.trim()) {
      throw new Error('[getCustomersCache] Mandatory dairyId parameter is required for tenant isolation.')
    }
    await this.init()
    const targetDairy = dairyId.trim().toLowerCase()
    const targetCenter = centerId && centerId.trim() ? centerId.trim().toLowerCase() : null
    const isDairyWide = Boolean(options?.isDairyWideAuthorized)

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('customers_cache', 'readonly')
        const store = tx.objectStore('customers_cache')
        const req = store.getAll()
        req.onsuccess = () => {
          const list: CustomerIdentity[] = req.result || []
          const filtered = list.filter((c) => {
            const dairyMatch = c.dairyId && c.dairyId.trim().toLowerCase() === targetDairy
            if (!dairyMatch) return false

            if (targetCenter) {
              // Centre-restricted: only return patrons explicitly registered to this center
              return Boolean(c.centerId && c.centerId.trim().toLowerCase() === targetCenter)
            }

            if (isDairyWide) {
              return true
            }

            // Absent centre identifier fails closed: do not expose customers belonging to specific centres
            return !c.centerId
          })
          resolve(filtered)
        }
        req.onerror = () => reject(req.error || new Error('Failed to read customers cache'))
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Looks up a customer in the local cache by RFID card UID, scoped strictly to dairy tenant and center.
   * Fails closed: On a centre-restricted station, unassigned cards or cards belonging to another centre are rejected.
   */
  public async getCustomerByRfid(
    cardUid: string,
    dairyId?: string,
    centerId?: string,
    options?: { isDairyWideAuthorized?: boolean }
  ): Promise<CustomerIdentity | null> {
    if (!dairyId || !dairyId.trim()) {
      throw new Error('[getCustomerByRfid] Mandatory dairyId parameter is required for tenant isolation.')
    }
    if (!cardUid || !cardUid.trim()) return null
    await this.init()
    const normalizedUid = cardUid.trim().toUpperCase()
    const targetDairy = dairyId.trim().toLowerCase()
    const targetCenter = centerId && centerId.trim() ? centerId.trim().toLowerCase() : null
    const isDairyWide = Boolean(options?.isDairyWideAuthorized)

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('customers_cache', 'readonly')
        const store = tx.objectStore('customers_cache')
        const req = store.getAll()
        req.onsuccess = () => {
          const list: CustomerIdentity[] = req.result || []
          const matched = list.find((c) => {
            const uidMatch = c.rfidCardUid && c.rfidCardUid.trim().toUpperCase() === normalizedUid
            const dairyMatch = c.dairyId && c.dairyId.trim().toLowerCase() === targetDairy
            if (!uidMatch || !dairyMatch) return false

            if (targetCenter) {
              // On a centre-restricted station, customer MUST be explicitly registered to this center
              return Boolean(c.centerId && c.centerId.trim().toLowerCase() === targetCenter)
            }

            if (isDairyWide) {
              return true
            }
            return !c.centerId
          })
          resolve(matched || null)
        }
        req.onerror = () => reject(req.error || new Error('RFID lookup error'))
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Looks up a customer in the local cache by customer code or farmer code, scoped strictly to dairy tenant and center.
   * Fails closed: On a centre-restricted station, unassigned customers or customers of another centre are rejected.
   */
  public async getCustomerByCode(
    code: string,
    dairyId?: string,
    centerId?: string,
    options?: { isDairyWideAuthorized?: boolean }
  ): Promise<CustomerIdentity | null> {
    if (!dairyId || !dairyId.trim()) {
      throw new Error('[getCustomerByCode] Mandatory dairyId parameter is required for tenant isolation.')
    }
    if (!code || !code.trim()) return null
    await this.init()
    const targetCode = code.trim().toLowerCase()
    const targetDairy = dairyId.trim().toLowerCase()
    const targetCenter = centerId && centerId.trim() ? centerId.trim().toLowerCase() : null
    const isDairyWide = Boolean(options?.isDairyWideAuthorized)

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('customers_cache', 'readonly')
        const store = tx.objectStore('customers_cache')
        const req = store.getAll()
        req.onsuccess = () => {
          const list: CustomerIdentity[] = req.result || []
          const found = list.find((c) => {
            const codeMatch =
              c.customerCode?.trim().toLowerCase() === targetCode ||
              c.farmerCode?.trim().toLowerCase() === targetCode ||
              c.id === code
            const dairyMatch = c.dairyId && c.dairyId.trim().toLowerCase() === targetDairy
            if (!codeMatch || !dairyMatch) return false

            if (targetCenter) {
              return Boolean(c.centerId && c.centerId.trim().toLowerCase() === targetCenter)
            }

            if (isDairyWide) {
              return true
            }
            return !c.centerId
          })
          resolve(found || null)
        }
        req.onerror = () => reject(req.error || new Error('Failed to find customer by code'))
      } catch (err) {
        reject(err)
      }
    })
  }

  // ============================================================================
  // RATE CHARTS CACHE (TENANT ISOLATED & EXPIRATION CHECKED)
  // ============================================================================

  /**
   * Generates a collision-safe rate chart cache key based on authoritative DTO fields.
   * Format: rc_<tenantId>_<explicitScope>_<centerId-or-explicit-org-scope>_<chartId>_<versionNumber>_<versionId>
   * Strictly enforces explicit discriminated scope ('ORGANIZATION_WIDE' vs 'CENTER_SPECIFIC').
   * Missing centerId must NEVER automatically become organization-wide. Incomplete/invalid scope fails closed.
   */
  public static buildRateChartCacheKey(params: {
    dairyId: string
    milkCategory: MilkCategory
    centerScope?: 'ORGANIZATION_WIDE' | 'CENTER_SPECIFIC' | string
    centerId?: string | null
    chartId?: string | null
    versionId?: string | null
    versionNumber?: number | null
  }): string {
    const d = (params.dairyId || '').trim().toLowerCase()
    if (!d) {
      throw new Error('[buildRateChartCacheKey] Mandatory dairyId parameter is required for tenant isolation.')
    }
    if (!params.milkCategory) {
      throw new Error('[buildRateChartCacheKey] Mandatory milkCategory parameter is required.')
    }
    const chart = (params.chartId || 'default_chart').trim().toLowerCase()
    const vNum = params.versionNumber ?? 1
    const ver = params.versionId && params.versionId.trim()
      ? params.versionId.trim().toLowerCase()
      : `v${vNum}`

    // Strict explicit discriminated scope resolution: FAIL CLOSED
    let explicitScope: 'ORGANIZATION_WIDE' | 'CENTER_SPECIFIC'
    let scopeTarget: string

    if (params.centerScope === 'ORGANIZATION_WIDE') {
      if (params.centerId && params.centerId.trim()) {
        throw new Error(
          `[buildRateChartCacheKey] ORGANIZATION_WIDE rate chart scope must not contain a centerId (${params.centerId}).`
        )
      }
      explicitScope = 'ORGANIZATION_WIDE'
      scopeTarget = 'org_wide'
    } else if (params.centerScope === 'CENTER_SPECIFIC' && params.centerId && params.centerId.trim()) {
      explicitScope = 'CENTER_SPECIFIC'
      scopeTarget = params.centerId.trim().toLowerCase()
    } else {
      // Missing/invalid scope or missing centerId without explicit ORGANIZATION_WIDE declaration: FAIL CLOSED!
      throw new Error(
        `[buildRateChartCacheKey] Invalid or incomplete rate chart scope. centerScope=${params.centerScope}, centerId=${params.centerId}. Missing centerId must never automatically become organization-wide scope.`
      )
    }

    return `rc_${d}_${explicitScope}_${scopeTarget}_${chart}_${vNum}_${ver}`
  }

  /**
   * Caches an active rate chart for a milk category and dairy.
   * Automatically validates explicit discriminated scope and ensures collision-safe primary key.
   * Fails closed if scope is ambiguous or missing centerId without ORGANIZATION_WIDE declaration.
   */
  public async saveRateChart(chart: RateChartCacheItem): Promise<void> {
    if (!chart.dairyId || !chart.dairyId.trim() || !chart.milkCategory) {
      throw new Error('[saveRateChart] Chart must contain valid dairyId and milkCategory.')
    }

    // Explicit discriminated scope validation: FAIL CLOSED
    if (chart.centerScope === 'ORGANIZATION_WIDE') {
      if (chart.centerId && chart.centerId.trim()) {
        throw new Error(
          `[saveRateChart] Invalid rate chart scope: ORGANIZATION_WIDE chart cannot specify centerId (${chart.centerId}).`
        )
      }
      chart.centerId = null
      chart.isOrganizationWide = true
    } else if (chart.centerScope === 'CENTER_SPECIFIC' && chart.centerId && chart.centerId.trim()) {
      chart.centerId = chart.centerId.trim()
      chart.isOrganizationWide = false
    } else {
      throw new Error(
        `[saveRateChart] Invalid or incomplete rate chart scope. Missing centerId must never automatically become organization-wide scope. centerScope=${chart.centerScope}, centerId=${chart.centerId}`
      )
    }

    // Ensure collision-safe key if not explicitly set
    if (!chart.id) {
      chart.id = LocalCollectionDB.buildRateChartCacheKey({
        dairyId: chart.dairyId,
        milkCategory: chart.milkCategory,
        centerScope: chart.centerScope,
        centerId: chart.centerId,
        chartId: chart.chartId,
        versionId: chart.versionId,
        versionNumber: chart.versionNumber || chart.version,
      })
    }
    await this.init()
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('rate_charts_cache', 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('Failed to save rate chart cache'))
        tx.objectStore('rate_charts_cache').put(chart)
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Retrieves active rate chart from cache for milk category, dairy and optional center.
   * Strictly enforces tenant isolation and filters out expired charts.
   * Priority: Center-specific chart first, then organization-wide chart.
   * FAILS CLOSED: If neither center-specific nor organization-wide chart exists,
   * returns null. NEVER falls back to another centre's rate chart.
   */
  public async getRateChart(
    dairyId: string,
    milkCategory: MilkCategory,
    centerId?: string
  ): Promise<RateChartCacheItem | null> {
    if (!dairyId || !dairyId.trim()) {
      throw new Error('[getRateChart] Mandatory dairyId parameter is required for tenant isolation.')
    }
    await this.init()
    const targetDairy = dairyId.trim().toLowerCase()
    const targetCenter = centerId && centerId.trim() ? centerId.trim().toLowerCase() : null
    const todayStr = new Date().toISOString().split('T')[0]

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('rate_charts_cache', 'readonly')
        const store = tx.objectStore('rate_charts_cache')
        const req = store.getAll()
        req.onsuccess = () => {
          const charts: RateChartCacheItem[] = req.result || []
          const matching = charts.filter(
            (c) =>
              c.dairyId &&
              c.dairyId.trim().toLowerCase() === targetDairy &&
              c.milkCategory === milkCategory &&
              (!c.effectiveTo || c.effectiveTo >= todayStr)
          )

          if (matching.length === 0) {
            resolve(null)
            return
          }

          // Strict explicit discriminated scope resolution (Prompt 5.2):
          // RULE: Missing centerId must NEVER automatically become organization-wide scope.
          // An organization-wide chart MUST explicitly declare centerScope === 'ORGANIZATION_WIDE' (without a centerId).
          // A centre-specific chart MUST explicitly declare centerScope === 'CENTER_SPECIFIC' and contain a valid centerId.
          const isExplicitOrgWide = (c: RateChartCacheItem) =>
            c.centerScope === 'ORGANIZATION_WIDE' && (!c.centerId || !c.centerId.trim())
          const isCenterSpecific = (c: RateChartCacheItem) =>
            c.centerScope === 'CENTER_SPECIFIC' && Boolean(c.centerId && c.centerId.trim())

          // If centerId specified, look for center-specific chart first
          if (targetCenter) {
            const centerSpecific = matching.filter(
              (c) => isCenterSpecific(c) && c.centerId!.trim().toLowerCase() === targetCenter
            )
            if (centerSpecific.length > 0) {
              centerSpecific.sort((a, b) => (b.versionNumber || b.version || 0) - (a.versionNumber || a.version || 0))
              resolve(centerSpecific[0])
              return
            }

            // Fallback to dairy-wide chart ONLY if explicitly declared as ORGANIZATION_WIDE
            // RULE: Never fall back to another centre's chart, or an organization-wide chart
            // unless the DTO/item explicitly declares that chart as organization-wide.
            const orgWide = matching.filter((c) => isExplicitOrgWide(c))
            if (orgWide.length > 0) {
              orgWide.sort((a, b) => (b.versionNumber || b.version || 0) - (a.versionNumber || a.version || 0))
              resolve(orgWide[0])
              return
            }

            // Fail closed: exact centre scope could not be resolved
            resolve(null)
            return
          }

          // If NO centerId specified, caller is querying dairy's default/organization-wide chart directly
          const directOrgCharts = matching.filter((c) => isExplicitOrgWide(c))
          if (directOrgCharts.length > 0) {
            directOrgCharts.sort((a, b) => (b.versionNumber || b.version || 0) - (a.versionNumber || a.version || 0))
            resolve(directOrgCharts[0])
            return
          }

          // Fail closed
          resolve(null)
        }
        req.onerror = () => reject(req.error || new Error('Failed to load rate chart from cache'))
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Retrieves an exact historical rate chart version for pending transaction reconciliation.
   * Matches by versionId, versionNumber, or version while preserving strict tenant and center scope.
   */
  public async getRateChartByVersion(
    dairyId: string,
    milkCategory: MilkCategory,
    versionOrId: number | string,
    centerId?: string | null,
    chartId?: string | null
  ): Promise<RateChartCacheItem | null> {
    if (!dairyId || !dairyId.trim()) {
      throw new Error('[getRateChartByVersion] Mandatory dairyId parameter is required for tenant isolation.')
    }
    await this.init()
    if (versionOrId === undefined || versionOrId === null || String(versionOrId).trim() === '') {
      return null
    }

    const targetDairy = dairyId.trim().toLowerCase()
    const targetCenter = centerId && centerId.trim() ? centerId.trim().toLowerCase() : null
    const targetChartId = chartId && chartId.trim() ? chartId.trim().toLowerCase() : null
    const isNum = typeof versionOrId === 'number' || !isNaN(Number(versionOrId))
    const versionNum = isNum ? Number(versionOrId) : null
    const versionStr = String(versionOrId).trim().toLowerCase()

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('rate_charts_cache', 'readonly')
        const store = tx.objectStore('rate_charts_cache')
        const req = store.getAll()
        req.onsuccess = () => {
          const charts: RateChartCacheItem[] = req.result || []
          const matching = charts.filter((c) => {
            if (!c.dairyId || c.dairyId.trim().toLowerCase() !== targetDairy) return false
            if (c.milkCategory !== milkCategory) return false

            if (targetChartId && (!c.chartId || c.chartId.trim().toLowerCase() !== targetChartId)) {
              return false
            }

            const matchVerId = c.versionId && c.versionId.trim().toLowerCase() === versionStr
            const matchVerNum =
              versionNum !== null &&
              ((c.versionNumber !== undefined && c.versionNumber === versionNum) ||
                c.version === versionNum)
            return matchVerId || matchVerNum
          })

          if (matching.length === 0) {
            resolve(null)
            return
          }

          // Strict explicit discriminated scope resolution (Prompt 5.2):
          const isExplicitOrgWide = (c: RateChartCacheItem) =>
            c.centerScope === 'ORGANIZATION_WIDE' && (!c.centerId || !c.centerId.trim())
          const isCenterSpecific = (c: RateChartCacheItem) =>
            c.centerScope === 'CENTER_SPECIFIC' && Boolean(c.centerId && c.centerId.trim())

          // If centerId specified, look for center-specific version first
          if (targetCenter) {
            const centerSpecific = matching.filter(
              (c) => isCenterSpecific(c) && c.centerId!.trim().toLowerCase() === targetCenter
            )
            if (centerSpecific.length > 0) {
              resolve(centerSpecific[0])
              return
            }

            // Fallback to org-wide version ONLY if explicitly declared as ORGANIZATION_WIDE
            // RULE: If exact historical chart version and centre scope cannot be resolved, fail closed.
            // Never fall back to latest chart, another centre's chart, or an org-wide chart unless explicitly declared.
            const orgWide = matching.filter((c) => isExplicitOrgWide(c))
            if (orgWide.length > 0) {
              resolve(orgWide[0])
              return
            }

            // Fail closed: exact historical version and centre scope could not be resolved
            resolve(null)
            return
          }

          // If NO centerId specified, resolve matching organization-wide chart directly
          const directOrgCharts = matching.filter((c) => isExplicitOrgWide(c))
          if (directOrgCharts.length > 0) {
            resolve(directOrgCharts[0])
            return
          }

          resolve(null)
        }
        req.onerror = () => reject(req.error || new Error('Failed to load historical rate chart by version'))
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Retrieves all non-expired rate charts cached for a dairy.
   */
  public async getRateCharts(dairyId: string): Promise<RateChartCacheItem[]> {
    if (!dairyId || !dairyId.trim()) {
      throw new Error('[getRateCharts] Mandatory dairyId parameter is required for tenant isolation.')
    }
    await this.init()
    const targetDairy = dairyId.trim().toLowerCase()
    const todayStr = new Date().toISOString().split('T')[0]

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('rate_charts_cache', 'readonly')
        const store = tx.objectStore('rate_charts_cache')
        const req = store.getAll()
        req.onsuccess = () => {
          const charts: RateChartCacheItem[] = req.result || []
          const matching = charts.filter(
            (c) =>
              c.dairyId &&
              c.dairyId.trim().toLowerCase() === targetDairy &&
              (!c.effectiveTo || c.effectiveTo >= todayStr)
          )
          resolve(matching)
        }
        req.onerror = () => reject(req.error || new Error('Failed to load rate charts from cache'))
      } catch (err) {
        reject(err)
      }
    })
  }

  // ============================================================================
  // SYNC METADATA
  // ============================================================================

  public async setMetadata(key: string, value: any): Promise<void> {
    await this.init()
    const item: SyncMetadataItem = {
      key,
      value,
      updatedAt: new Date().toISOString(),
    }
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('sync_metadata', 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error(`Failed to set sync metadata ${key}`))
        tx.objectStore('sync_metadata').put(item)
      } catch (err) {
        reject(err)
      }
    })
  }

  public async getMetadata<T = any>(key: string): Promise<T | null> {
    await this.init()
    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('sync_metadata', 'readonly')
        const req = tx.objectStore('sync_metadata').get(key)
        req.onsuccess = () => {
          const item = req.result as SyncMetadataItem | undefined
          resolve(item ? item.value : null)
        }
        req.onerror = () => reject(req.error || new Error(`Failed to get sync metadata ${key}`))
      } catch (err) {
        reject(err)
      }
    })
  }

  // ============================================================================
  // ATOMIC MULTI-TAB ADVISORY LOCKING (W3C / INDEXEDDB ATOMIC CAS)
  // ============================================================================

  /**
   * Atomically acquires an advisory lock in IndexedDB in a single readwrite transaction.
   * If lock is already held by another unexpired owner, acquisition fails safely.
   * Expired locks from crashed workers are atomically recovered.
   */
  public async atomicAcquireAdvisoryLock(
    lockKey: string,
    ownerId: string,
    ttlMs: number = 45000,
    options?: { forceReclaimOnWebLock?: boolean }
  ): Promise<boolean> {
    await this.init()
    const metadataKey = `advisory_lock_${lockKey}`
    const now = Date.now()
    const forceReclaim = options?.forceReclaimOnWebLock === true

    return new Promise((resolve, reject) => {
      try {
        let acquired = false
        let abortReason: Error | null = null
        const tx = this.getTransaction('sync_metadata', 'readwrite')

        tx.oncomplete = () => resolve(acquired)
        tx.onerror = () => reject(abortReason || tx.error || new Error(`Failed to acquire lock ${lockKey}`))
        tx.onabort = (e: any) =>
          reject(abortReason || tx.error || (e?.target as any)?.error || new Error(`Lock acquire aborted ${lockKey}`))

        const store = tx.objectStore('sync_metadata')
        const getReq = store.get(metadataKey)

        getReq.onsuccess = () => {
          const existingItem = getReq.result as SyncMetadataItem | undefined
          const existing = existingItem?.value

          if (existing && existing.ownerId && existing.ownerId !== ownerId) {
            const isUnexpired = Boolean(existing.expiresAt && existing.expiresAt > now)
            if (isUnexpired && !forceReclaim) {
              // Held by another live owner and not yet expired: fail acquisition
              acquired = false
              return
            }
            if (isUnexpired && forceReclaim) {
              console.info(`[MultiTabLock] Reclaiming orphaned advisory lock '${lockKey}' from ${existing.ownerId} after exclusive Web Lock grant`)
            } else {
              console.info(`[MultiTabLock] Atomic recovery of expired lock '${lockKey}' previously held by ${existing.ownerId}`)
            }
          }

          const lockRecord = {
            ownerId,
            lockKey,
            acquiredAt: new Date().toISOString(),
            expiresAt: now + ttlMs,
          }

          acquired = true
          store.put({
            key: metadataKey,
            value: lockRecord,
            updatedAt: new Date().toISOString(),
          })
        }

        getReq.onerror = () => {
          abortReason = getReq.error || new Error(`Failed to acquire lock ${lockKey}`)
          try {
            tx.abort()
          } catch {}
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Atomically renews (heartbeats) an active advisory lock in IndexedDB.
   * STRICT: Renews ONLY if currently owned by this exact ownerId.
   * Stale or hijacked workers cannot renew a lock owned by another worker.
   */
  public async atomicRenewAdvisoryLock(
    lockKey: string,
    ownerId: string,
    ttlMs: number = 45000
  ): Promise<boolean> {
    await this.init()
    const metadataKey = `advisory_lock_${lockKey}`
    const now = Date.now()

    return new Promise((resolve, reject) => {
      try {
        let renewed = false
        let abortReason: Error | null = null
        const tx = this.getTransaction('sync_metadata', 'readwrite')

        tx.oncomplete = () => resolve(renewed)
        tx.onerror = () => reject(abortReason || tx.error || new Error(`Failed to renew lock ${lockKey}`))
        tx.onabort = (e: any) =>
          reject(abortReason || tx.error || (e?.target as any)?.error || new Error(`Lock renew aborted ${lockKey}`))

        const store = tx.objectStore('sync_metadata')
        const getReq = store.get(metadataKey)

        getReq.onsuccess = () => {
          const existingItem = getReq.result as SyncMetadataItem | undefined
          const existing = existingItem?.value

          if (existing && existing.ownerId === ownerId) {
            renewed = true
            store.put({
              key: metadataKey,
              value: {
                ...existing,
                expiresAt: now + ttlMs,
                lastHeartbeatAt: new Date().toISOString(),
              },
              updatedAt: new Date().toISOString(),
            })
            return
          }

          renewed = false
        }

        getReq.onerror = () => {
          abortReason = getReq.error || new Error(`Failed to renew lock ${lockKey}`)
          try {
            tx.abort()
          } catch {}
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Atomically releases an advisory lock in IndexedDB.
   * STRICT: Releases ONLY if owned by current ownerId.
   * Prevents an expired worker from accidentally clearing a replacement lock acquired by a newer worker.
   */
  public async atomicReleaseAdvisoryLock(
    lockKey: string,
    ownerId: string
  ): Promise<boolean> {
    await this.init()
    const metadataKey = `advisory_lock_${lockKey}`

    return new Promise((resolve, reject) => {
      try {
        let released = false
        let abortReason: Error | null = null
        const tx = this.getTransaction('sync_metadata', 'readwrite')

        tx.oncomplete = () => resolve(released)
        tx.onerror = () => reject(abortReason || tx.error || new Error(`Failed to release lock ${lockKey}`))
        tx.onabort = (e: any) =>
          reject(abortReason || tx.error || (e?.target as any)?.error || new Error(`Lock release aborted ${lockKey}`))

        const store = tx.objectStore('sync_metadata')
        const getReq = store.get(metadataKey)

        getReq.onsuccess = () => {
          const existingItem = getReq.result as SyncMetadataItem | undefined
          const existing = existingItem?.value

          if (existing && existing.ownerId === ownerId) {
            released = true
            store.put({
              key: metadataKey,
              value: {
                ownerId: null,
                lockKey,
                acquiredAt: null,
                expiresAt: 0,
              },
              updatedAt: new Date().toISOString(),
            })
            return
          }

          released = false
        }

        getReq.onerror = () => {
          abortReason = getReq.error || new Error(`Failed to release lock ${lockKey}`)
          try {
            tx.abort()
          } catch {}
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  // ============================================================================
  // HOUSEKEEPING & RETENTION (ZERO DATA LOSS FOR PENDING ENTRIES)
  // ============================================================================

  /**
   * Purges old SYNCED transactions that have already been acknowledged by PostgreSQL
   * and exceed the retention window (default 30 days).
   *
   * STRICT SAFETY INVARIANTS:
   * - NEVER deletes any record where syncStatus !== 'SYNCED_CLOUD'.
   * - NEVER touches offline_queue.
   * - Returns number of purged archived records.
   */
  public async cleanupSyncedTransactions(retentionDays: number = 30): Promise<number> {
    if (!Number.isFinite(retentionDays) || retentionDays < 0) return 0
    await this.init()
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('completed_transactions', 'readwrite')
        let purgedCount = 0

        tx.oncomplete = () => resolve(purgedCount)
        tx.onerror = () => reject(tx.error || new Error('Failed to run synced transaction cleanup'))

        const store = tx.objectStore('completed_transactions')
        const req = store.openCursor()

        req.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor) {
            const txn = cursor.value as CollectionTransaction
            const txnTimeMs = txn.timestamp ? Date.parse(txn.timestamp) : NaN
            // ONLY purge if strictly confirmed SYNCED_CLOUD AND valid timestamp older than retention window
            // Never purge PENDING*, RETRYABLE, SYNCING, REJECTED, MANUAL_REVIEW, AUTH_REQUIRED, or DEVICE_BLOCKED
            if (txn.syncStatus === 'SYNCED_CLOUD' && Number.isFinite(txnTimeMs) && txnTimeMs < cutoffMs) {
              cursor.delete()
              purgedCount++
            }
            cursor.continue()
          }
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  // ============================================================================
  // PROMPT 5: AUTOMATIC SYNC RECONCILIATION & QUEUE STATE MACHINE METHODS
  // ============================================================================

  /**
   * Updates a locally committed transaction upon server rejection (or manual review flag).
   * - Marks completed_transactions row as 'REJECTED' or 'MANUAL_REVIEW' with error code and message.
   * - Updates offline_queue row with rejection status, error details, and timestamp.
   * - NEVER deletes the item; retains it strictly for administrator audit and investigation.
   */
  public async markTransactionRejected(
    clientIntakeUuid: string,
    rejectionData: {
      errorCode?: string | null
      errorMessage?: string | null
      status?: 'REJECTED' | 'MANUAL_REVIEW' | 'DEVICE_BLOCKED'
      rejectionTimestamp?: string
    }
  ): Promise<void> {
    await this.init()

    return new Promise((resolve, reject) => {
      try {
        let abortReason: Error | null = null
        const tx = this.getTransaction(['completed_transactions', 'offline_queue'], 'readwrite')

        tx.oncomplete = () => resolve()
        tx.onerror = () =>
          reject(abortReason || tx.error || new Error('Failed to record rejection in IndexedDB'))
        tx.onabort = (e: any) =>
          reject(
            abortReason ||
              tx.error ||
              (e?.target as any)?.error ||
              new Error('Rejection transaction aborted')
          )

        const completedStore = tx.objectStore('completed_transactions')
        const queueStore = tx.objectStore('offline_queue')
        const targetStatus = rejectionData.status || 'REJECTED'
        const nowIso = new Date().toISOString()

        const getReq = completedStore.get(clientIntakeUuid)
        getReq.onsuccess = () => {
          const existing = getReq.result as CollectionTransaction | undefined
          if (existing) {
            existing.syncStatus = targetStatus
            existing.syncErrorCode = rejectionData.errorCode || null
            existing.syncErrorMessage = rejectionData.errorMessage || null
            completedStore.put(existing)
          }

          // Update offline_queue item
          const qReq = queueStore.get(`EVT-${clientIntakeUuid}`)
          qReq.onsuccess = () => {
            let item = qReq.result as OfflineQueueItem | undefined
            const applyRejection = (targetItem: OfflineQueueItem) => {
              targetItem.status = targetStatus as any
              targetItem.syncQueueStatus = targetStatus as any
              targetItem.errorCode = rejectionData.errorCode || null
              targetItem.errorReason = rejectionData.errorMessage || null
              targetItem.lastError = rejectionData.errorMessage || null
              targetItem.rejectionTimestamp = rejectionData.rejectionTimestamp || nowIso
              targetItem.lastAttemptedAt = nowIso
              targetItem.lastAttemptAt = nowIso
              queueStore.put(targetItem)
            }

            if (!item) {
              const altReq = queueStore.get(clientIntakeUuid)
              altReq.onsuccess = () => {
                item = altReq.result as OfflineQueueItem | undefined
                if (item) applyRejection(item)
              }
            } else {
              applyRejection(item)
            }
          }
        }

        getReq.onerror = () => {
          try {
            tx.abort()
          } catch {}
          reject(getReq.error || new Error(`Failed to read transaction: ${clientIntakeUuid}`))
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Pauses a queued transaction due to HTTP 401 authentication expiration.
   * Preserves all retry metadata (retryCount, nextAttemptAt, lastError) without incrementing retryCount,
   * and excludes the item from automatic sync attempts until re-authentication.
   */
  public async markTransactionAuthRequired(
    clientIntakeUuid: string,
    authData: {
      errorReason: string
      errorCode?: string | null
    }
  ): Promise<void> {
    await this.init()

    return new Promise((resolve, reject) => {
      try {
        let abortReason: Error | null = null
        const tx = this.getTransaction(['completed_transactions', 'offline_queue'], 'readwrite')

        tx.oncomplete = () => resolve()
        tx.onerror = () =>
          reject(abortReason || tx.error || new Error('Failed to mark transaction AUTH_REQUIRED'))
        tx.onabort = (e: any) =>
          reject(
            abortReason ||
              tx.error ||
              (e?.target as any)?.error ||
              new Error('Auth-required status update aborted')
          )

        const completedStore = tx.objectStore('completed_transactions')
        const queueStore = tx.objectStore('offline_queue')
        const nowIso = new Date().toISOString()

        const getReq = completedStore.get(clientIntakeUuid)
        getReq.onsuccess = () => {
          const existing = getReq.result as CollectionTransaction | undefined
          if (existing && existing.syncStatus !== 'SYNCED_CLOUD') {
            existing.syncStatus = 'AUTH_REQUIRED'
            existing.syncErrorCode = authData.errorCode || 'AUTH_REQUIRED'
            existing.syncErrorMessage = authData.errorReason
            completedStore.put(existing)
          }

          const qReq = queueStore.get(`EVT-${clientIntakeUuid}`)
          qReq.onsuccess = () => {
            let item = qReq.result as OfflineQueueItem | undefined
            const applyAuthPause = (targetItem: OfflineQueueItem) => {
              targetItem.status = 'AUTH_REQUIRED'
              targetItem.syncQueueStatus = 'AUTH_REQUIRED'
              targetItem.errorCode = authData.errorCode || 'AUTH_REQUIRED'
              targetItem.errorReason = authData.errorReason
              targetItem.lastError = authData.errorReason
              targetItem.lastAttemptedAt = nowIso
              targetItem.lastAttemptAt = nowIso
              queueStore.put(targetItem)
            }

            if (!item) {
              const altReq = queueStore.get(clientIntakeUuid)
              altReq.onsuccess = () => {
                item = altReq.result as OfflineQueueItem | undefined
                if (item) applyAuthPause(item)
              }
            } else {
              applyAuthPause(item)
            }
          }
        }

        getReq.onerror = () => {
          abortReason = getReq.error || new Error(`Failed to read transaction: ${clientIntakeUuid}`)
          try {
            tx.abort()
          } catch {}
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Resumes AUTH_REQUIRED transactions back to RETRYABLE after the operator re-authenticates,
   * preserving original UUID, idempotencyKey, offline lease, and retry metadata.
   */
  public async resumeAuthPausedTransactions(): Promise<number> {
    await this.init()

    return new Promise((resolve, reject) => {
      try {
        let resumedCount = 0
        const tx = this.getTransaction(['completed_transactions', 'offline_queue'], 'readwrite')

        tx.oncomplete = () => resolve(resumedCount)
        tx.onerror = () => reject(tx.error || new Error('Failed to resume auth-paused items'))

        const completedStore = tx.objectStore('completed_transactions')
        const queueStore = tx.objectStore('offline_queue')
        const req = queueStore.getAll()

        req.onsuccess = () => {
          const items: OfflineQueueItem[] = req.result || []
          for (const item of items) {
            if (item.syncQueueStatus === 'AUTH_REQUIRED' || item.status === 'AUTH_REQUIRED') {
              item.status = 'RETRYABLE'
              item.syncQueueStatus = 'RETRYABLE'
              queueStore.put(item)
              resumedCount++

              const uuid = item.clientIntakeUuid || item.transactionId
              if (uuid) {
                const compReq = completedStore.get(uuid)
                compReq.onsuccess = () => {
                  const txn = compReq.result as CollectionTransaction | undefined
                  if (txn && txn.syncStatus === 'AUTH_REQUIRED') {
                    txn.syncStatus = 'RETRYABLE'
                    completedStore.put(txn)
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Updates a locally committed transaction upon temporary failure:
   * - Increments retryCount on offline_queue item.
   * - Sets status to 'RETRYABLE'.
   * - Sets nextRetryAt timestamp calculated with exponential backoff & jitter.
   * - Updates completed_transactions with latest error reason.
   */
  public async markTransactionRetryable(
    clientIntakeUuid: string,
    retryData: {
      errorReason: string
      errorCode?: string | null
      nextRetryAt?: string
    }
  ): Promise<void> {
    await this.init()

    return new Promise((resolve, reject) => {
      try {
        let abortReason: Error | null = null
        const tx = this.getTransaction(['completed_transactions', 'offline_queue'], 'readwrite')

        tx.oncomplete = () => resolve()
        tx.onerror = () =>
          reject(abortReason || tx.error || new Error('Failed to update retryable transaction'))
        tx.onabort = (e: any) =>
          reject(
            abortReason ||
              tx.error ||
              (e?.target as any)?.error ||
              new Error('Retryable transaction aborted')
          )

        const completedStore = tx.objectStore('completed_transactions')
        const queueStore = tx.objectStore('offline_queue')

        const getReq = completedStore.get(clientIntakeUuid)
        getReq.onsuccess = () => {
          const existing = getReq.result as CollectionTransaction | undefined
          if (existing) {
            existing.syncStatus = 'RETRYABLE'
            existing.syncErrorCode = retryData.errorCode || null
            existing.syncErrorMessage = retryData.errorReason
            completedStore.put(existing)
          }

          const qReq = queueStore.get(`EVT-${clientIntakeUuid}`)
          qReq.onsuccess = () => {
            let item = qReq.result as OfflineQueueItem | undefined
            const applyRetry = (targetItem: OfflineQueueItem) => {
              targetItem.status = 'RETRYABLE'
              targetItem.syncQueueStatus = 'RETRYABLE'
              targetItem.retryCount = (targetItem.retryCount || 0) + 1
              targetItem.errorReason = retryData.errorReason
              targetItem.lastError = retryData.errorReason
              targetItem.errorCode = retryData.errorCode || null
              const nextTime =
                retryData.nextRetryAt || new Date(Date.now() + 5000).toISOString()
              targetItem.nextRetryAt = nextTime
              targetItem.nextAttemptAt = nextTime
              const attemptedAt = new Date().toISOString()
              targetItem.lastAttemptedAt = attemptedAt
              targetItem.lastAttemptAt = attemptedAt
              queueStore.put(targetItem)
            }

            if (!item) {
              const altReq = queueStore.get(clientIntakeUuid)
              altReq.onsuccess = () => {
                item = altReq.result as OfflineQueueItem | undefined
                if (item) applyRetry(item)
              }
            } else {
              applyRetry(item)
            }
          }
        }

        getReq.onerror = () => {
          try {
            tx.abort()
          } catch {}
          reject(getReq.error || new Error(`Failed to read transaction: ${clientIntakeUuid}`))
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Sets in-flight status for a batch of transactions about to be submitted over the network.
   */
  public async markTransactionsSyncing(clientIntakeUuids: string[]): Promise<void> {
    if (!clientIntakeUuids || clientIntakeUuids.length === 0) return
    await this.init()

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction(['completed_transactions', 'offline_queue'], 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error || new Error('Failed to mark transactions as syncing'))
        tx.onabort = () => reject(tx.error || new Error('Syncing status transaction aborted'))

        const completedStore = tx.objectStore('completed_transactions')
        const queueStore = tx.objectStore('offline_queue')
        const nowIso = new Date().toISOString()

        for (const uuid of clientIntakeUuids) {
          const compReq = completedStore.get(uuid)
          compReq.onsuccess = () => {
            const txn = compReq.result as CollectionTransaction | undefined
            if (txn && txn.syncStatus !== 'SYNCED_CLOUD') {
              txn.syncStatus = 'SYNCING'
              completedStore.put(txn)
            }
          }

          const qReq = queueStore.get(`EVT-${uuid}`)
          qReq.onsuccess = () => {
            let item = qReq.result as OfflineQueueItem | undefined
            const markItemSyncing = (targetItem: OfflineQueueItem) => {
              targetItem.status = 'SYNCING'
              targetItem.syncQueueStatus = 'SYNCING'
              targetItem.lastAttemptedAt = nowIso
              targetItem.lastAttemptAt = nowIso
              queueStore.put(targetItem)
            }

            if (item) {
              markItemSyncing(item)
            } else {
              const altReq = queueStore.get(uuid)
              altReq.onsuccess = () => {
                item = altReq.result as OfflineQueueItem | undefined
                if (item) markItemSyncing(item)
              }
            }
          }
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Recovers any records stuck in 'SYNCING' state due to an unexpected process crash,
   * tab closure, power outage, or browser reload. Returns them to 'RETRYABLE'.
   */
  public async recoverStaleSyncingItems(staleTimeoutMs = 60000): Promise<number> {
    await this.init()

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction(['completed_transactions', 'offline_queue'], 'readwrite')
        let recoveredCount = 0

        tx.oncomplete = () => resolve(recoveredCount)
        tx.onerror = () => reject(tx.error || new Error('Failed to recover stale syncing items'))
        tx.onabort = () => reject(tx.error || new Error('Stale recovery transaction aborted'))

        const completedStore = tx.objectStore('completed_transactions')
        const queueStore = tx.objectStore('offline_queue')
        const req = queueStore.getAll()

        req.onsuccess = () => {
          const items: OfflineQueueItem[] = req.result || []
          const now = Date.now()

          for (const item of items) {
            if (item.status === 'SYNCING' || item.syncQueueStatus === 'SYNCING') {
              const rawAttempt = item.lastAttemptAt || item.lastAttemptedAt
              const parsedAttempt = rawAttempt ? Date.parse(rawAttempt) : 0
              const lastAttempt = Number.isFinite(parsedAttempt) ? parsedAttempt : 0
              if (now - lastAttempt > staleTimeoutMs || lastAttempt === 0) {
                item.status = 'FAILED'
                item.syncQueueStatus = 'RETRYABLE'
                item.errorReason = 'Interrupted during sync flight (recovered on startup)'
                item.lastError = item.lastError || item.errorReason
                queueStore.put(item)
                recoveredCount++

                const uuid = item.clientIntakeUuid || item.transactionId
                if (uuid) {
                  const compReq = completedStore.get(uuid)
                  compReq.onsuccess = () => {
                    const txn = compReq.result as CollectionTransaction | undefined
                    if (txn && txn.syncStatus === 'SYNCING') {
                      txn.syncStatus = 'RETRYABLE'
                      txn.syncErrorMessage = txn.syncErrorMessage || item.errorReason
                      completedStore.put(txn)
                    }
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Retrieves pending or retryable items that are ready for immediate network transmission.
   * - Status must be PENDING, QUEUED, RETRYABLE, or FAILED.
   * - Excludes REJECTED, MANUAL_REVIEW, DEVICE_BLOCKED, and SYNCED records.
   * - nextRetryAt must be elapsed.
   * - FIFO order by collection timestamp.
   */
  public async getEligibleQueueItems(limit = 100): Promise<OfflineQueueItem[]> {
    await this.init()

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('offline_queue', 'readonly')
        const store = tx.objectStore('offline_queue')
        const req = store.getAll()

        req.onsuccess = () => {
          const items: OfflineQueueItem[] = req.result || []
          const now = Date.now()

          const eligible = items.filter((item) => {
            const st = item.syncQueueStatus || item.status
            const isEligibleStatus =
              st === 'PENDING' ||
              st === 'QUEUED' ||
              st === 'RETRYABLE' ||
              (st === 'FAILED' && !item.errorCode?.startsWith('PERM_'))

            if (!isEligibleStatus) return false

            // Enforce backoff scheduling
            const nextAt = item.nextAttemptAt || item.nextRetryAt
            if (nextAt) {
              const retryTime = new Date(nextAt).getTime()
              if (Number.isFinite(retryTime) && retryTime > now) {
                return false
              }
            }

            return true
          })

          // Sort FIFO by collection timestamp
          eligible.sort((a, b) => {
            const tA = new Date(a.timestamp || a.transaction?.timestamp || 0).getTime()
            const tB = new Date(b.timestamp || b.transaction?.timestamp || 0).getTime()
            return tA - tB
          })

          resolve(eligible.slice(0, limit))
        }

        req.onerror = () => reject(req.error || new Error('Failed to read eligible queue items'))
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Returns a complete breakdown of offline queue items by state.
   */
  public async getQueueSummary(): Promise<{
    pending: number
    syncing: number
    synced: number
    retryable: number
    rejected: number
    manualReview: number
    authRequired: number
    deviceBlocked: number
    total: number
  }> {
    await this.init()

    return new Promise((resolve, reject) => {
      try {
        const tx = this.getTransaction('offline_queue', 'readonly')
        const store = tx.objectStore('offline_queue')
        const req = store.getAll()

        req.onsuccess = () => {
          const items: OfflineQueueItem[] = req.result || []
          let pending = 0
          let syncing = 0
          let synced = 0
          let retryable = 0
          let rejected = 0
          let manualReview = 0
          let authRequired = 0
          let deviceBlocked = 0

          for (const item of items) {
            const st = item.syncQueueStatus || item.status
            switch (st) {
              case 'PENDING':
              case 'QUEUED':
                pending++
                break
              case 'SYNCING':
                syncing++
                break
              case 'SYNCED':
              case 'RESOLVED':
                synced++
                break
              case 'RETRYABLE':
              case 'FAILED':
                retryable++
                break
              case 'REJECTED':
                rejected++
                break
              case 'MANUAL_REVIEW':
                manualReview++
                break
              case 'AUTH_REQUIRED':
                authRequired++
                break
              case 'DEVICE_BLOCKED':
                deviceBlocked++
                break
              default:
                pending++
            }
          }

          resolve({
            pending,
            syncing,
            synced,
            retryable,
            rejected,
            manualReview,
            authRequired,
            deviceBlocked,
            total: items.length,
          })
        }

        req.onerror = () => reject(req.error || new Error('Failed to calculate queue summary'))
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Offline Session Authorization Caching & Scope Binding
   */
  public async saveSessionOfflineAuth(
    sessionCodeOrIdOrAuth: string | { token: string; payload?: any; sessionId?: string; sessionCode?: string },
    auth?: { token: string; payload: any }
  ): Promise<void> {
    if (typeof sessionCodeOrIdOrAuth === 'object' && sessionCodeOrIdOrAuth !== null) {
      const token = sessionCodeOrIdOrAuth.token
      const payload = (sessionCodeOrIdOrAuth as any).payload || sessionCodeOrIdOrAuth
      const keyId = (sessionCodeOrIdOrAuth as any).sessionId || (sessionCodeOrIdOrAuth as any).sessionCode || 'active'
      await this.setMetadata(`session_offline_auth_${keyId}`, { token, payload })
      await this.setMetadata('active_session_offline_auth', { token, payload })
      return
    }
    await this.setMetadata(`session_offline_auth_${sessionCodeOrIdOrAuth}`, auth)
    await this.setMetadata('active_session_offline_auth', auth)
  }

  public async getSessionOfflineAuth(
    sessionCodeOrId: string
  ): Promise<{ token: string; payload: any } | null> {
    return (await this.getMetadata(`session_offline_auth_${sessionCodeOrId}`)) || null
  }

  public async getActiveSessionOfflineAuth(
    sessionCodeOrId?: string
  ): Promise<{ token: string; payload: any } | null> {
    if (sessionCodeOrId) {
      const specific = await this.getMetadata(`session_offline_auth_${sessionCodeOrId}`)
      if (specific) return specific
    }
    return (await this.getMetadata('active_session_offline_auth')) || null
  }

  public async clearAllStoresForTesting(): Promise<void> {
    await this.init()
    const stores = [
      'completed_transactions',
      'offline_queue',
      'sync_metadata',
      'rate_charts_cache',
      'customers_cache',
      'active_session',
    ]
    const tx = this.getTransaction(stores, 'readwrite')
    for (const s of stores) {
      tx.objectStore(s).clear()
    }
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve()
    })
  }
}

export const localDB = new LocalCollectionDB()
