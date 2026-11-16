import { describe, it, expect } from 'vitest'
import { MockDairyBackend } from '@/api/mock-server'

describe('Server-Authoritative Ledger & Billing Settlements', () => {
  it('posts non-destructive adjustments to collection records and logs ledger entry', async () => {
    const txns = await MockDairyBackend.getCollectionTransactions()
    const targetTxn = txns[0]
    const originalWeight = targetTxn.weightLiters
    const newWeight = originalWeight + 2.0 // e.g. calibration correction

    const adjusted = await MockDairyBackend.adjustCollectionRecord(
      targetTxn.id,
      newWeight,
      'Calibration check revealed scale under-read by 2.0L',
      'Rajesh Patel'
    )

    expect(adjusted.status).toBe('ADJUSTED')
    expect(adjusted.adjustment).toBeDefined()
    expect(adjusted.adjustment?.originalWeight).toBe(originalWeight)

    // Verify ledger entry
    const ledgers = await MockDairyBackend.getCustomerLedger(targetTxn.customerId)
    const latest = ledgers[ledgers.length - 1]
    expect(latest.entryType).toBe('AUTHORIZED_ADJUSTMENT')
    expect(latest.referenceId).toBe(targetTxn.transactionId)
  })

  it('prevents duplicate bill generation for the same customer and period', async () => {
    // Generate first bill
    const bill = await MockDairyBackend.generateFortnightlyBill(
      'cust-102',
      '2026-11-01',
      '2026-11-15',
      'Early November 2026',
      'Rajesh Patel'
    )
    expect(bill).toBeDefined()
    expect(bill.status).toBe('GENERATED')

    // Attempt duplicate bill generation for the same customer & period
    await expect(
      MockDairyBackend.generateFortnightlyBill(
        'cust-102',
        '2026-11-01',
        '2026-11-15',
        'Early November 2026',
        'Rajesh Patel'
      )
    ).rejects.toThrow(/has already been generated/)
  })
})
