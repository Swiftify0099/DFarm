import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MockCollectionBackend, CURRENT_DAIRY_ID } from './mocks/mock-backend'
import { ratesApi } from '@/api/client'
import { localDB } from '@/services/local-storage'

describe('Single-Screen Milk Collection Kiosk Workflow (Phase 12)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves farmer directly by code without navigation or page reload', async () => {
    const list = await MockCollectionBackend.getCustomers('C-101')
    expect(list.length).toBe(1)
    const customer = list[0]
    expect(customer).not.toBeNull()
    expect(customer.fullName).toBe('Pandurang Mahadev Patil')
    expect(customer.customerCode).toBe('C-101')
    expect(customer.preferredCategory).toBe('COW')
  })

  it('resolves farmer by mobile number cleanly', async () => {
    const list = await MockCollectionBackend.getCustomers('9822011223')
    expect(list.length).toBe(1)
    expect(list[0].fullName).toBe('Pandurang Mahadev Patil')
    expect(list[0].customerCode).toBe('C-101')
  })

  it('rejects unknown farmer code lookup without selecting arbitrary customer', async () => {
    const list = await MockCollectionBackend.getCustomers('NON_EXISTENT_CODE_99999')
    expect(list.length).toBe(0)
  })

  it('resolves patron by RFID card tap', async () => {
    const customer = await MockCollectionBackend.getCustomerByRfid('RFID-94A2B81C')
    expect(customer).not.toBeNull()
    expect(customer?.fullName).toBe('Pandurang Mahadev Patil')
    expect(customer?.customerCode).toBe('C-101')
  })

  it('correctly calculates dynamic rate matrix for Cow Milk vs Buffalo Milk', () => {
    // Cow milk: (Fat * 6.5) + (SNF * 2.8)
    const cowCalc = ratesApi.calculateRate('COW', 4.0, 8.5)
    // 4.0 * 6.5 = 26.0; 8.5 * 2.8 = 23.8; total = 49.80
    expect(cowCalc.ratePerLiter).toBe(49.8)
    expect(cowCalc.version).toBe(1)

    // Buffalo milk: (Fat * 7.2) + (SNF * 2.9)
    const buffaloCalc = ratesApi.calculateRate('BUFFALO', 6.5, 9.0)
    // 6.5 * 7.2 = 46.8; 9.0 * 2.9 = 26.1; total = 72.90
    expect(buffaloCalc.ratePerLiter).toBe(72.9)
    expect(buffaloCalc.version).toBe(1)
  })

  it('enforces minimum rate floor of Rs. 10.00 / L', () => {
    const lowCalc = ratesApi.calculateRate('COW', 0.5, 1.0)
    expect(lowCalc.ratePerLiter).toBe(10.0)
  })

  it('submits intake on single screen and updates session throughput', async () => {
    const list = await MockCollectionBackend.getCustomers('C-101')
    const customer = list[0]

    const txn = await MockCollectionBackend.submitTransaction({
      customerId: customer.id,
      milkCategory: 'COW',
      weightLiters: 12.5,
      fat: 4.2,
      snf: 8.6,
      clrDensity: 28.5,
      identificationMethod: 'FACE_YUNET_SFACE',
      operatorName: 'Collection Operator',
    })

    expect(txn.id).toBeDefined()
    expect(txn.transactionCode).toBeDefined()
    expect(txn.weightLiters).toBe(12.5)
    expect(txn.totalAmount).toBeGreaterThan(0)
    expect(txn.syncStatus).toBe('SYNCED_CLOUD')
  })

  it('preserves offline intake queue when offline mode is triggered', async () => {
    const list = await MockCollectionBackend.getCustomers('C-102')
    const customer = list[0]

    const offlineTxn = await MockCollectionBackend.submitTransaction({
      customerId: customer.id,
      milkCategory: 'BUFFALO',
      weightLiters: 20.0,
      fat: 6.8,
      snf: 9.1,
      clrDensity: 30.0,
      identificationMethod: 'MANUAL_SEARCH',
      operatorName: 'Collection Operator',
      isOffline: true,
    })

    expect(offlineTxn.syncStatus).toBe('PENDING_OFFLINE')
    expect(offlineTxn.totalAmount).toBeGreaterThan(0)

    const queue = await localDB.getOfflineQueue()
    expect(queue.some((i) => i.transactionId === offlineTxn.id || i.transaction.id === offlineTxn.id)).toBe(true)
  })
})
