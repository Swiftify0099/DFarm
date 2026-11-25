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

  it('correctly calculates dynamic rate matrix for Cow Milk vs Buffalo Milk from cached charts', () => {
    const cowChart: any = {
      id: 'd1_cow_v1',
      dairyId: 'd1',
      milkCategory: 'COW',
      version: 1,
      effectiveFrom: '2026-01-01',
      baseFat: 3.5,
      baseSnf: 8.5,
      baseRate: 46.55,
      ratePerFatUnit: 6.5,
      ratePerSnfUnit: 2.8,
      updatedAt: new Date().toISOString(),
    }
    const buffaloChart: any = {
      id: 'd1_buf_v1',
      dairyId: 'd1',
      milkCategory: 'BUFFALO',
      version: 1,
      effectiveFrom: '2026-01-01',
      baseFat: 6.0,
      baseSnf: 9.0,
      baseRate: 69.3,
      ratePerFatUnit: 7.2,
      ratePerSnfUnit: 2.9,
      updatedAt: new Date().toISOString(),
    }

    // Cow milk: baseRate 46.55 + (4.0 - 3.5) * 6.5 + (8.5 - 8.5) * 2.8 = 46.55 + 3.25 = 49.80
    const cowCalc = ratesApi.calculateRate('COW', 4.0, 8.5, cowChart)
    expect(cowCalc.isValid).toBe(true)
    expect(cowCalc.ratePerLiter).toBe(49.8)
    expect(cowCalc.version).toBe(1)

    // Buffalo milk: baseRate 69.30 + (6.5 - 6.0) * 7.2 + (9.0 - 9.0) * 2.9 = 69.30 + 3.60 = 72.90
    const buffaloCalc = ratesApi.calculateRate('BUFFALO', 6.5, 9.0, buffaloChart)
    expect(buffaloCalc.isValid).toBe(true)
    expect(buffaloCalc.ratePerLiter).toBe(72.9)
    expect(buffaloCalc.version).toBe(1)
  })

  it('fails safely and blocks calculation when rate chart is missing or expired', () => {
    // Missing chart
    const missingCalc = ratesApi.calculateRate('COW', 4.0, 8.5, null)
    expect(missingCalc.isValid).toBe(false)
    expect(missingCalc.ratePerLiter).toBe(0)
    expect(missingCalc.error).toContain('No active rate chart cached for COW')

    // Expired chart
    const expiredChart: any = {
      id: 'd1_cow_exp',
      dairyId: 'd1',
      milkCategory: 'COW',
      version: 1,
      effectiveFrom: '2020-01-01',
      effectiveTo: '2021-01-01',
      baseFat: 3.5,
      baseSnf: 8.5,
      baseRate: 40.0,
      updatedAt: new Date().toISOString(),
    }
    const expiredCalc = ratesApi.calculateRate('COW', 4.0, 8.5, expiredChart)
    expect(expiredCalc.isValid).toBe(false)
    expect(expiredCalc.error).toContain('expired')
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
