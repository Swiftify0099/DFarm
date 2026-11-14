import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ManualEntryWeightProvider,
  ManualEntryMilkAnalyzerProvider,
} from '../ManualEntryProviders';
import { UsbSerialWeightScaleService } from '../UsbSerialWeightScaleService';
import { BluetoothEscPosPrinterService } from '../BluetoothEscPosPrinterService';
import { NfcRfidReaderService } from '../NfcRfidReaderService';

test('Hardware Providers Test Suite', async (t) => {
  await t.test('1. ManualEntryWeightProvider: Valid weight reading', async () => {
    const provider = new ManualEntryWeightProvider();
    provider.setManualWeight(18.5);
    const reading = await provider.readWeight('sess-test-01');

    assert.equal('netWeight' in reading, true);
    if ('netWeight' in reading) {
      assert.equal(reading.netWeight, 18.5);
      assert.equal(reading.unit, 'KG');
      assert.equal(reading.source, 'MANUAL_ENTRY');
      assert.equal(reading.isStable, true);
    }
  });

  await t.test('2. ManualEntryWeightProvider: Reject zero or negative weight', async () => {
    const provider = new ManualEntryWeightProvider();
    provider.setManualWeight(-2.0);
    const reading = await provider.readWeight('sess-test-02');

    assert.equal('error' in reading, true);
    if ('error' in reading) {
      assert.equal(reading.code, 'WEIGHT_BELOW_MINIMUM');
    }
  });

  await t.test('3. ManualEntryWeightProvider: Reject overload (> 200 KG)', async () => {
    const provider = new ManualEntryWeightProvider();
    provider.setManualWeight(250.0);
    const reading = await provider.readWeight('sess-test-03');

    assert.equal('error' in reading, true);
    if ('error' in reading) {
      assert.equal(reading.code, 'WEIGHT_ABOVE_MAXIMUM');
    }
  });

  await t.test('4. ManualEntryMilkAnalyzerProvider: Valid fat and SNF', async () => {
    const provider = new ManualEntryMilkAnalyzerProvider();
    provider.setManualInput(4.5, 8.8);
    const reading = await provider.readQuality('sess-test-04');

    assert.equal('fatPercentage' in reading, true);
    if ('fatPercentage' in reading) {
      assert.equal(reading.fatPercentage, 4.5);
      assert.equal(reading.snfPercentage, 8.8);
      assert.equal(reading.source, 'MANUAL_ENTRY');
      assert.equal(reading.isComplete, true);
    }
  });

  await t.test('5. ManualEntryMilkAnalyzerProvider: Reject invalid fat percentage', async () => {
    const provider = new ManualEntryMilkAnalyzerProvider();
    provider.setManualInput(14.0, 8.5);
    const reading = await provider.readQuality('sess-test-05');

    assert.equal('error' in reading, true);
    if ('error' in reading) {
      assert.equal(reading.code, 'FAT_OUT_OF_RANGE');
    }
  });

  await t.test('6. UsbSerialWeightScaleService: Parse standard Essae / Avery ASCII frame', () => {
    const frame = 'ST,GS,+0015.50kg\r\n';
    const parsed = UsbSerialWeightScaleService.parseSerialFrame(frame);

    assert.equal(parsed.isValid, true);
    assert.equal(parsed.isStable, true);
    assert.equal(parsed.weightKg, 15.5);
    assert.equal(parsed.unit, 'KG');
  });

  await t.test('7. UsbSerialWeightScaleService: Detect overload frame', () => {
    const frame = 'OL,GS,+9999.99kg\r\n';
    const parsed = UsbSerialWeightScaleService.parseSerialFrame(frame);

    assert.equal(parsed.isValid, false);
    assert.equal(parsed.isOverload, true);
  });

  await t.test('8. BluetoothEscPosPrinterService: 40-column receipt formatting', () => {
    const lines = BluetoothEscPosPrinterService.format40ColumnReceipt({
      receiptId: 'RCP-20261114-001',
      collectionId: 'col-uuid-1234',
      farmerName: 'Ramesh Patil',
      farmerCode: 'FARM-001',
      businessDate: '2026-11-14',
      shift: 'MORNING',
      category: 'COW',
      weightKg: 15.5,
      fatPercent: 4.2,
      snfPercent: 8.5,
      ratePerUnit: 38.5,
      totalAmount: 596.75,
      centerName: 'Tasgaon Center',
      officerName: 'Operator Suresh',
    });

    assert.ok(lines.length >= 15);
    // Ensure every line adheres to max 40 columns
    for (const line of lines) {
      assert.ok(line.length <= 40, `Line exceeds 40 columns: "${line}" (length: ${line.length})`);
    }

    const escPosBytes = BluetoothEscPosPrinterService.generateEscPosBytes(lines);
    assert.ok(escPosBytes.length > 50);
    // Check initial ESC @ sequence
    assert.equal(escPosBytes[0], 0x1b);
    assert.equal(escPosBytes[1], 0x40);
  });

  await t.test('9. NfcRfidReaderService: UID normalization and hex validation', () => {
    assert.equal(NfcRfidReaderService.normalizeUid('04:a1:b2:c3:d4:e5:f6'), '04A1B2C3D4E5F6');
    assert.equal(NfcRfidReaderService.normalizeUid(' 04 - a1 - b2 - c3 '), '04A1B2C3');
    assert.equal(NfcRfidReaderService.isValidHexUid('04A1B2C3D4'), true);
    assert.equal(NfcRfidReaderService.isValidHexUid('XYZ123'), false); // Non-hex
    assert.equal(NfcRfidReaderService.isValidHexUid('12'), false); // Too short
  });
});
