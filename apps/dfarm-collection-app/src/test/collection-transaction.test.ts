import { describe, it, expect } from 'vitest'
import { MockCollectionBackend, CURRENT_DAIRY_ID } from '../api/mock-backend'

describe('Collection Transaction Validation Gate & Journaling', () => {
  it('successfully submits valid milk intake transaction', async () => {
    const txn = await MockCollectionBackend.submitTransaction({
      customerId: 'cust-101',
      milkCategory: 'COW',
      weightLiters: 15.0,
      fat: 4.2,
      snf: 8.7,
      clrDensity: 29.5,
      identificationMethod: 'FACE_YUNET_SFACE',
      operatorName: 'Sachin Patil',
    })

    expect(txn.id).toBeDefined()
    expect(txn.dairyId).toBe(CURRENT_DAIRY_ID)
    expect(txn.customerCode).toBe('C-101')
    expect(txn.weightLiters).toBe(15.0)
    expect(txn.appliedRatePerLiter).toBeGreaterThan(38.0)
    expect(txn.totalAmount).toBe(Number((txn.appliedRatePerLiter * 15.0).toFixed(2)))
    expect(txn.syncStatus).toBe('SYNCED_CLOUD')
  })

  it('rejects transaction when milk volume is zero or negative', async () => {
    await expect(
      MockCollectionBackend.submitTransaction({
        customerId: 'cust-101',
        milkCategory: 'COW',
        weightLiters: 0,
        fat: 4.2,
        snf: 8.7,
        clrDensity: 29.5,
        identificationMethod: 'FACE_YUNET_SFACE',
        operatorName: 'Sachin Patil',
      })
    ).rejects.toThrow('Milk weight must be greater than zero')
  })

  it('rejects transaction when Fat reading is outside biological bounds', async () => {
    await expect(
      MockCollectionBackend.submitTransaction({
        customerId: 'cust-101',
        milkCategory: 'COW',
        weightLiters: 10,
        fat: 1.2, // Below 2.0%
        snf: 8.7,
        clrDensity: 29.5,
        identificationMethod: 'FACE_YUNET_SFACE',
        operatorName: 'Sachin Patil',
      })
    ).rejects.toThrow('Invalid Fat reading out of biological bounds')
  })

  it('rejects transaction when SNF reading is outside biological bounds', async () => {
    await expect(
      MockCollectionBackend.submitTransaction({
        customerId: 'cust-101',
        milkCategory: 'COW',
        weightLiters: 10,
        fat: 4.2,
        snf: 14.5, // Above 12.0%
        clrDensity: 29.5,
        identificationMethod: 'FACE_YUNET_SFACE',
        operatorName: 'Sachin Patil',
      })
    ).rejects.toThrow('Invalid SNF reading out of biological bounds')
  })

  it('rejects transaction when customer identity is unknown', async () => {
    await expect(
      MockCollectionBackend.submitTransaction({
        customerId: 'unknown-999',
        milkCategory: 'COW',
        weightLiters: 10,
        fat: 4.2,
        snf: 8.7,
        clrDensity: 29.5,
        identificationMethod: 'FACE_YUNET_SFACE',
        operatorName: 'Sachin Patil',
      })
    ).rejects.toThrow('Customer identity not found')
  })
})
