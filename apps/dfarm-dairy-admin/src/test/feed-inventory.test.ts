import { describe, it, expect } from 'vitest'
import { MockDairyBackend } from '@/api/mock-server'

describe('Feed Inventory & Customer Sales Synchronization', () => {
  it('deducts physical inventory and creates server-authoritative ledger debit on customer sale', async () => {
    const products = await MockDairyBackend.getFeedProducts()
    const targetProd = products[0]
    const initialStock = targetProd.availableStock

    const sale = await MockDairyBackend.recordFeedSale(
      {
        customerId: 'cust-103',
        productId: targetProd.id,
        quantity: 3,
        paymentMode: 'LEDGER_DEBIT',
        notes: 'Monthly feed quota',
      },
      'Sachin Patil'
    )

    expect(sale).toBeDefined()
    expect(sale.totalAmount).toBe(targetProd.sellingRate * 3)

    // Verify product stock was reduced exactly by quantity
    expect(targetProd.availableStock).toBe(initialStock - 3)

    // Verify customer ledger has the corresponding debit
    const ledgers = await MockDairyBackend.getCustomerLedger('cust-103')
    const debitEntry = ledgers.find((l) => l.referenceId === sale.saleId)
    expect(debitEntry).toBeDefined()
    expect(debitEntry?.debit).toBe(sale.totalAmount)
  })

  it('rejects feed sale when requested quantity exceeds available stock', async () => {
    const products = await MockDairyBackend.getFeedProducts()
    const targetProd = products[0]

    await expect(
      MockDairyBackend.recordFeedSale(
        {
          customerId: 'cust-103',
          productId: targetProd.id,
          quantity: targetProd.availableStock + 500, // Exceeds available stock
          paymentMode: 'LEDGER_DEBIT',
        },
        'Sachin Patil'
      )
    ).rejects.toThrow(/Insufficient stock/)
  })
})
