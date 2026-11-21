import {
  normalizeMilkCollectionRecord,
  normalizeLedgerEntry,
  normalizeBillStatement,
} from '../../src/utils/normalizers';

describe('API Data Normalization & Defensive Parsing', () => {
  describe('normalizeMilkCollectionRecord', () => {
    test('handles raw backend transaction with weightLiters and milkCategory', () => {
      const rawBackendTx = {
        id: '1c01e92a-7140-4bc2-8a90-34901f440a01',
        transactionCode: 'TXN-1C01E92A',
        weightLiters: 12.5,
        fatPercentage: 4.5,
        snfPercentage: 8.8,
        appliedRatePerLiter: 42.0,
        totalAmount: 525.0,
        milkCategory: 'COW',
        shift: 'MORNING',
        date: '2026-11-20',
        timestamp: '2026-11-20T06:30:00.000Z',
        operatorName: 'Sanjay Shinde',
      };

      const normalized = normalizeMilkCollectionRecord(rawBackendTx);

      expect(normalized.quantityLiters).toBe(12.5);
      expect(normalized.ratePerLiter).toBe(42.0);
      expect(normalized.animalType).toBe('COW');
      expect(normalized.receiptNumber).toBe('TXN-1C01E92A');
      expect(normalized.collectionDate).toBe('2026-11-20');
      expect(normalized.collectionTime).toBe('06:30');
      expect(normalized.totalAmount).toBe(525.0);
    });

    test('handles undefined or partial fields safely without throwing', () => {
      const rawEmpty = {};
      const normalized = normalizeMilkCollectionRecord(rawEmpty);

      expect(normalized.quantityLiters).toBe(0);
      expect(normalized.ratePerLiter).toBe(0);
      expect(normalized.totalAmount).toBe(0);
      expect(normalized.fatPercentage).toBe(0);
      expect(normalized.snfPercentage).toBe(0);
      expect(normalized.animalType).toBe('COW');
      expect(normalized.shift).toBe('MORNING');
      expect(typeof normalized.quantityLiters.toFixed(1)).toBe('string');
      expect(typeof normalized.totalAmount.toFixed(2)).toBe('string');
    });
  });

  describe('normalizeLedgerEntry', () => {
    test('handles raw backend ledger transaction with direction and balanceAfter', () => {
      const rawTx = {
        id: '2c01e92a-7140-4bc2-8a90-34901f440a02',
        transactionType: 'MILK_COLLECTION',
        direction: 'CREDIT',
        amount: 525.0,
        balanceAfter: 12480.0,
        referenceId: 'TXN-1C01E92A',
        description: 'Milk Intake Credit',
        createdAt: '2026-11-20T06:30:00.000Z',
      };

      const normalized = normalizeLedgerEntry(rawTx);

      expect(normalized.type).toBe('MILK_CREDIT');
      expect(normalized.creditAmount).toBe(525.0);
      expect(normalized.debitAmount).toBe(0);
      expect(normalized.runningBalance).toBe(12480.0);
      expect(typeof normalized.creditAmount.toFixed(2)).toBe('string');
      expect(typeof normalized.runningBalance.toFixed(2)).toBe('string');
    });
  });

  describe('normalizeBillStatement', () => {
    test('handles raw backend monthly bill with periodStart and grossAmount', () => {
      const rawBill = {
        id: '3c01e92a-7140-4bc2-8a90-34901f440a03',
        bill_number: 'DFB-2026-11-C1-042',
        billing_period_start: '2026-11-01',
        billing_period_end: '2026-11-10',
        total_milk_weight: 148.0,
        gross_milk_amount: 6240.0,
        feed_purchases_debit: 1850.0,
        net_payable_amount: 4390.0,
        bill_status: 'PAID',
      };

      const normalized = normalizeBillStatement(rawBill);

      expect(normalized.billNumber).toBe('DFB-2026-11-C1-042');
      expect(normalized.totalLiters).toBe(148.0);
      expect(normalized.grossMilkAmount).toBe(6240.0);
      expect(normalized.feedDeductions).toBe(1850.0);
      expect(normalized.netPayableAmount).toBe(4390.0);
      expect(normalized.status).toBe('DISBURSED');
      expect(typeof normalized.grossMilkAmount.toFixed(2)).toBe('string');
    });
  });
});
