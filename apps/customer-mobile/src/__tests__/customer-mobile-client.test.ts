import test from 'node:test';
import assert from 'node:assert/strict';

// Setup mock storage for Node.js test environment
const inMemoryStore: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => inMemoryStore[key] || null,
    setItem: (key: string, value: string) => { inMemoryStore[key] = value; },
    removeItem: (key: string) => { delete inMemoryStore[key]; },
    clear: () => { Object.keys(inMemoryStore).forEach(k => delete inMemoryStore[k]); },
    key: (index: number) => Object.keys(inMemoryStore)[index] || null,
    get length() { return Object.keys(inMemoryStore).length; },
  },
};

import { formatINR, formatCurrency, getBalanceStatus, getBalanceStatusLabel } from '../utils/currency';
import { formatWeight, formatWeightKg, formatPercentage } from '../utils/units';
import { formatDate, formatDateTime, formatShift } from '../utils/date';
import { setCachedData, getCachedData, clearOfflineCache } from '../storage/cache';

test('Customer Mobile Client Utilities & Offline Storage Suite', async (t) => {
  await t.test('1. formatINR & formatCurrency: Indian number system, decimals, negatives', () => {
    assert.equal(formatINR(0), '₹ 0.00');
    assert.equal(formatINR(1250), '₹ 1,250.00');
    assert.equal(formatINR(125000), '₹ 1,25,000.00');
    assert.equal(formatINR(10500000.5), '₹ 1,05,00,000.50');
    assert.equal(formatCurrency(-450.75), '-₹ 450.75');
    assert.equal(formatINR(null), '₹ 0.00');
    assert.equal(formatINR(undefined), '₹ 0.00');
    assert.equal(formatINR('invalid' as any), '₹ 0.00');
  });

  await t.test('2. getBalanceStatus & getBalanceStatusLabel: Server-authoritative balance categories', () => {
    const positive = getBalanceStatus(1450.50);
    assert.equal(positive.status, 'DAIRY_OWES_CUSTOMER');
    assert.equal(positive.label, 'Dairy Owes You');
    assert.equal(positive.type, 'credit');

    const negative = getBalanceStatus(-820.00);
    assert.equal(negative.status, 'CUSTOMER_OWES_DAIRY');
    assert.equal(negative.label, 'You Owe Dairy');
    assert.equal(negative.type, 'debit');

    const zero = getBalanceStatusLabel(0.00);
    assert.equal(zero.status, 'SETTLED');
    assert.equal(zero.label, 'Account Settled');
    assert.equal(zero.type, 'settled');
  });

  await t.test('3. formatWeight & formatWeightKg: Strict unit preservation (Never convert KG to Liters)', () => {
    assert.equal(formatWeight(15.4), '15.40 KG');
    assert.equal(formatWeightKg(28.75), '28.75 KG');
    assert.equal(formatWeightKg(0), '0.00 KG');
    assert.equal(formatWeightKg(null), '0.00 KG');
    assert.equal(formatPercentage(4.5), '4.50 %');
  });

  await t.test('4. formatDate, formatDateTime, formatShift', () => {
    const isoDate = '2026-11-14T06:30:00.000Z';
    const formatted = formatDate(isoDate);
    assert.ok(formatted.includes('2026'), 'Date must contain year 2026');
    assert.ok(formatted.includes('Nov') || formatted.includes('11'), 'Date must contain month');

    assert.equal(formatShift('MORNING'), 'Morning (AM)');
    assert.equal(formatShift('EVENING'), 'Evening (PM)');
    assert.equal(formatShift(null), '-');
  });

  await t.test('5. Offline Cache: set, get, stale flag, and clearOfflineCache', async () => {
    const testKey = 'test_farmer_101';
    const testData = { farmerCode: 'MH-SAN-001', balance: 4500.50 };

    await setCachedData(testKey, testData);
    const retrieved = await getCachedData<typeof testData>(testKey);

    assert.ok(retrieved !== null, 'Retrieved cache entry must exist');
    assert.equal(retrieved.data.farmerCode, 'MH-SAN-001');
    assert.equal(retrieved.data.balance, 4500.50);
    assert.equal(retrieved.isStale, false);
    assert.ok(retrieved.syncedAt.length > 0);

    // Clear cache
    await clearOfflineCache();
    const afterClear = await getCachedData(testKey);
    assert.equal(afterClear, null, 'Cache must be null after clearing on logout');
  });
});
