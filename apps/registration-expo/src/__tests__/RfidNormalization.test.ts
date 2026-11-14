/**
 * DFarm Registration App - RFID Normalization & Hardware Adapter Tests
 * Complete parity with Kotlin RfidNormalizationTest.kt
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { SoftwareManualEntryRfidAdapter } from '../hardware/RfidReaderAdapter';

describe('RfidNormalizationTest', () => {
  let adapter: SoftwareManualEntryRfidAdapter;

  beforeEach(() => {
    adapter = new SoftwareManualEntryRfidAdapter();
  });

  it('testNormalizesColonSeparatedHex', () => {
    const input = '04:a1:b2:c3:d4';
    const normalized = adapter.normalizeUid(input);
    assert.strictEqual(normalized, '04A1B2C3D4');
    assert.strictEqual(adapter.isValidHexUid(normalized), true);
  });

  it('testNormalizesHyphenSeparatedHex', () => {
    const input = '04-A1-B2-C3-D4';
    const normalized = adapter.normalizeUid(input);
    assert.strictEqual(normalized, '04A1B2C3D4');
    assert.strictEqual(adapter.isValidHexUid(normalized), true);
  });

  it('testNormalizesSpaceSeparatedHex', () => {
    const input = ' 04 a1 b2 c3 d4 ';
    const normalized = adapter.normalizeUid(input);
    assert.strictEqual(normalized, '04A1B2C3D4');
    assert.strictEqual(adapter.isValidHexUid(normalized), true);
  });

  it('testRejectsInvalidCharacters', () => {
    const input = '04:A1:ZZ:C3:D4';
    const normalized = adapter.normalizeUid(input);
    assert.strictEqual(normalized, '04A1ZZC3D4');
    assert.strictEqual(adapter.isValidHexUid(normalized), false);
  });

  it('testRejectsTooShortHex', () => {
    const input = '0A';
    const normalized = adapter.normalizeUid(input);
    assert.strictEqual(adapter.isValidHexUid(normalized), false);
  });

  it('testHardwareLabelIdentifiesPhysicalReaderDeferred', () => {
    assert.strictEqual(
      adapter.sourceLabel,
      'SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED'
    );
    assert.strictEqual(adapter.isPhysicalReader, false);
  });
});
