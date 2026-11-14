import test from 'node:test';
import assert from 'node:assert/strict';
import { ReceiptFormatter } from '../domain/receipt/ReceiptFormatter';
import { CollectionReceipt } from '../types';

test('Receipt Formatter & 40-Column Thermal Slip Test Suite', async (t) => {
  await t.test('1. Thermal receipt slip formatting within 40 columns', () => {
    const receipt: CollectionReceipt = {
      receiptNumber: 'RCP-001234',
      sessionUuid: 'sess_f8b1c4e2-1234-5678-90ab-cdef12345678',
      businessDate: '2026-11-13',
      shift: 'MORNING',
      centerName: 'Tasgaon Milk Collection Center 01',
      operatorName: 'Suresh Patil',
      customerCode: 'FARMER-042',
      customerName: 'Pandurang Balasaheb Patil',
      identificationMethod: 'FACE',
      milkCategory: 'COW',
      weightKg: 18.5,
      fatPercentage: 4.2,
      snfPercentage: 8.6,
      ratePerUnit: 37.8,
      totalAmount: 699.3,
      timestamp: 1794567890000,
      verificationHash: '8f4a123bca9876543210fedcba098765',
    };

    const text = ReceiptFormatter.generateReceiptText(receipt);
    assert.ok(text);

    // Verify each line is within 40 characters width
    const lines = text.split('\n').filter((l) => l.length > 0);
    for (const line of lines) {
      assert.ok(
        line.length <= 40,
        `Line exceeds 40 characters (${line.length}): '${line}'`
      );
    }

    // Verify key fields are present
    assert.ok(text.includes('DFARM DAIRY COLLECTION'));
    assert.ok(text.includes('RCP-001234'));
    assert.ok(text.includes('FARMER-042'));
    assert.ok(text.includes('COW'));
    assert.ok(text.includes('18.50 kg'));
    assert.ok(text.includes('INR 699.30'));
    assert.ok(text.includes('FACE'));
  });

  await t.test('2. Cryptographic verification hash (SHA-256 64-character hex string)', () => {
    const receipt: CollectionReceipt = {
      receiptNumber: 'RCP-001',
      sessionUuid: 'sess_01',
      businessDate: '2026-11-13',
      shift: 'EVENING',
      centerName: 'Center A',
      operatorName: 'Op 1',
      customerCode: 'F-001',
      customerName: 'Ramesh Kumar',
      identificationMethod: 'RFID',
      milkCategory: 'BUFFALO',
      weightKg: 10.0,
      fatPercentage: 6.5,
      snfPercentage: 9.0,
      ratePerUnit: 58.0,
      totalAmount: 580.0,
      timestamp: 1794567890000,
      verificationHash: '',
    };

    const hash = ReceiptFormatter.computeVerificationHash(receipt);
    assert.ok(hash);
    assert.equal(hash.length, 64);
  });
});
