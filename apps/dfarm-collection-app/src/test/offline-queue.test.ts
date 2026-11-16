import { describe, it, expect } from 'vitest'
import { localDB } from '../services/local-storage'
import type { CollectionTransaction } from '../types'

describe('IndexedDB Offline Queue & Resilience', () => {
  const dummyTxn: CollectionTransaction = {
    id: 'txn-test-01',
    transactionCode: 'COL-999001',
    sessionId: 'ses-test',
    dairyId: 'dairy-ten-9801',
    customerId: 'cust-101',
    customerCode: 'C-101',
    customerName: 'Pandurang Patil',
    timestamp: new Date().toISOString(),
    date: '2026-11-15',
    shift: 'EVENING',
    milkCategory: 'COW',
    weightLiters: 12.0,
    fatPercentage: 4.2,
    snfPercentage: 8.7,
    clrDensity: 29.5,
    appliedRatePerLiter: 41.44,
    rateChartVersion: 2,
    totalAmount: 497.28,
    identificationMethod: 'FACE_YUNET_SFACE',
    syncStatus: 'PENDING_OFFLINE',
    deviceId: 'DF-KIOSK-001',
    operatorName: 'Sachin Patil',
  }

  it('queues offline collection transaction and returns queue item', async () => {
    const item = await localDB.queueOfflineTransaction(dummyTxn)
    expect(item.eventId).toBeDefined()
    expect(item.transactionId).toBe(dummyTxn.id)
    expect(item.status).toBe('QUEUED')
    expect(item.customerCode).toBe('C-101')
  })

  it('retrieves queued transactions from offline storage', async () => {
    const queue = await localDB.getOfflineQueue()
    expect(Array.isArray(queue)).toBe(true)
    expect(queue.length).toBeGreaterThan(0)
  })

  it('removes item from queue after successful synchronization', async () => {
    const item = await localDB.queueOfflineTransaction({
      ...dummyTxn,
      id: 'txn-to-delete',
    })
    await localDB.removeQueueItem(item.eventId)
    const queue = await localDB.getOfflineQueue()
    const found = queue.find((q) => q.eventId === item.eventId)
    expect(found).toBeUndefined()
  })
})
