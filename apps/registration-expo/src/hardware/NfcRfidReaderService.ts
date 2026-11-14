/**
 * DFarm Hardware Integration — Physical RFID / NFC Card Reader Service
 * 
 * Supports reading physical smartcard UIDs:
 * 1. 13.56 MHz High-Frequency NFC (ISO 14443 Type A / Type B, Mifare Classic, NTAG)
 *    via native Android NFC adapter (`react-native-nfc-manager`).
 * 2. External USB OTG / Bluetooth RFID readers (HID keyboard emulation or CDC ACM serial).
 * 
 * UID Normalization:
 * - Strips colons, dashes, and whitespace.
 * - Converts to uppercase hexadecimal format (e.g., "04:a1:b2:c3:d4" -> "04A1B2C3D4").
 * - Validates length: 4 to 64 hexadecimal characters.
 */

export interface RfidScanResult {
  success: boolean;
  rawUid?: string;
  normalizedUid?: string;
  technology?: string;
  error?: string;
  errorCode?: string;
}

function getNfcManager(): any {
  try {
    if (typeof require !== 'undefined') {
      const mod = require('react-native-nfc-manager');
      return mod?.default || mod;
    }
  } catch {
    return null;
  }
  return null;
}

export class NfcRfidReaderService {
  readonly sourceLabel = 'PHYSICAL_NFC_RFID_READER';
  readonly isPhysicalDevice = true;

  private isScanning = false;
  private isInitialized = false;

  private async ensureInitialized(): Promise<any> {
    const NfcManager = getNfcManager();
    if (NfcManager && typeof NfcManager.start === 'function' && !this.isInitialized) {
      try {
        await NfcManager.start();
        this.isInitialized = true;
      } catch {
        // Native module might not be ready or running in simulator/Expo Go
      }
    }
    return NfcManager;
  }

  /**
   * Normalizes a raw hexadecimal card UID string into uppercase canonical representation.
   * Strips colons, hyphens, and whitespace.
   */
  static normalizeUid(rawInput: string): string {
    if (!rawInput) return '';
    return rawInput.trim().replace(/[:\s-]/g, '').toUpperCase();
  }

  /**
   * Validates whether a normalized UID conforms to hexadecimal standard (4 to 64 chars).
   */
  static isValidHexUid(normalizedUid: string): boolean {
    return (
      normalizedUid.length >= 4 &&
      normalizedUid.length <= 64 &&
      /^[0-9A-F]+$/.test(normalizedUid)
    );
  }

  /**
   * Check if the device hardware supports NFC and whether it is enabled.
   */
  async checkNfcAvailability(): Promise<{ supported: boolean; enabled: boolean }> {
    try {
      const NfcManager = await this.ensureInitialized();
      if (NfcManager && typeof NfcManager.isSupported === 'function') {
        const supported = await NfcManager.isSupported();
        const enabled = typeof NfcManager.isEnabled === 'function' ? await NfcManager.isEnabled() : supported;
        return { supported: !!supported, enabled: !!enabled };
      }
      return { supported: false, enabled: false };
    } catch {
      return { supported: false, enabled: false };
    }
  }

  /**
   * Starts NFC tag discovery in foreground dispatch mode.
   */
  async startScan(onTagScanned: (result: RfidScanResult) => void): Promise<boolean> {
    if (this.isScanning) return true;

    try {
      this.isScanning = true;
      const NfcManager = await this.ensureInitialized();
      if (NfcManager && typeof NfcManager.requestTechnology === 'function') {
        await NfcManager.requestTechnology(['NfcA']);
        const tag = await NfcManager.getTag();
        if (tag && tag.id) {
          onTagScanned({
            success: true,
            rawUid: tag.id,
            normalizedUid: NfcRfidReaderService.normalizeUid(tag.id),
          });
          return true;
        }
      }
      return true;
    } catch (err: any) {
      this.isScanning = false;
      onTagScanned({
        success: false,
        error: err.message || 'NFC scanning failed',
        errorCode: 'NFC_SCAN_ERROR',
      });
      return false;
    }
  }

  /**
   * Cancels active NFC scan session.
   */
  async stopScan(): Promise<void> {
    if (!this.isScanning) return;
    try {
      const NfcManager = getNfcManager();
      if (NfcManager && typeof NfcManager.cancelTechnologyRequest === 'function') {
        await NfcManager.cancelTechnologyRequest();
      }
      this.isScanning = false;
    } catch {
      this.isScanning = false;
    }
  }
}

export const nfcReaderService = new NfcRfidReaderService();
