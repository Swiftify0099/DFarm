/**
 * DFarm Registration App — RFID / NFC Card Reader Adapter
 * Parity with Kotlin RfidReaderAdapter.kt & PhysicalNfcRfidReaderAdapter
 * 
 * Supports both:
 * 1. PhysicalNfcRfidReaderAdapter: Reads 13.56MHz Mifare / NDEF NFC cards
 * 2. SoftwareManualEntryRfidAdapter: Manual UID hexadecimal fallback
 */

import { NfcRfidReaderService } from './NfcRfidReaderService';

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

export class PhysicalNfcRfidReaderAdapter implements RfidReaderAdapter {
  readonly sourceLabel = 'PHYSICAL_NFC_RFID_READER (13.56 MHz Mifare / ISO 14443)';
  readonly isPhysicalReader = true;

  normalizeUid(rawInput: string): string {
    return NfcRfidReaderService.normalizeUid(rawInput);
  }

  isValidHexUid(normalizedUid: string): boolean {
    return NfcRfidReaderService.isValidHexUid(normalizedUid);
  }
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

export const physicalRfidAdapter = new PhysicalNfcRfidReaderAdapter();
export const manualRfidAdapter = new SoftwareManualEntryRfidAdapter();
export const rfidAdapter: RfidReaderAdapter = manualRfidAdapter;
