/**
 * Architectural boundary interface for RFID card reader input.
 * Parity with Kotlin RfidReaderAdapter.kt & SoftwareManualEntryRfidAdapter.
 *
 * NOTE: Physical RFID hardware reader integration is DEFERRED.
 * All entries use the SoftwareManualEntryRfidAdapter with explicit labeling.
 */

export interface RfidReaderAdapter {
  readonly sourceLabel: string;
  readonly isPhysicalReader: boolean;

  /**
   * Normalizes a raw hexadecimal card UID string into uppercase canonical representation.
   * Strips colons, hyphens, and whitespace.
   * e.g. "04:a1:b2:c3:d4" -> "04A1B2C3D4"
   */
  normalizeUid(rawInput: string): string;

  /**
   * Validates whether a normalized UID conforms to hexadecimal standard (4 to 64 chars).
   */
  isValidHexUid(normalizedUid: string): boolean;
}

export class SoftwareManualEntryRfidAdapter implements RfidReaderAdapter {
  readonly sourceLabel = 'SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED';
  readonly isPhysicalReader = false;

  normalizeUid(rawInput: string): string {
    return rawInput.trim().replace(/[:\s-]/g, '').toUpperCase();
  }

  isValidHexUid(normalizedUid: string): boolean {
    return (
      normalizedUid.length >= 4 &&
      normalizedUid.length <= 64 &&
      /^[0-9A-F]+$/.test(normalizedUid)
    );
  }
}

export const rfidAdapter: RfidReaderAdapter = new SoftwareManualEntryRfidAdapter();
