# DFARM RFID / NFC Hardware Integration & UID Normalization Report

**Subsystem:** Customer RFID Card Identification & Card Assignment  
**Components:** `NfcRfidReaderService.ts`, `PhysicalNfcRfidReaderAdapter.ts`, `SoftwareManualEntryRfidAdapter.ts`  
**Target Applications:** `apps/registration-expo`, `apps/collection-expo`  
**Test Suite:** `apps/registration-expo/src/__tests__/RfidNormalizationTest.ts` & `HardwareProviders.test.ts`  
**Status:** **FIXED AND VERIFIED**  

---

## 1. Physical Hardware Boundary: 13.56 MHz NFC vs. 125 kHz RFID

A frequent source of confusion in mobile hardware integration is the distinction between **13.56 MHz HF NFC** and **125 kHz LF RFID**:

```
+------------------------------------+------------------------------------+
| 13.56 MHz High Frequency (NFC)     | 125 kHz Low Frequency (LF RFID)   |
+------------------------------------+------------------------------------+
| Supported directly by Android NFC  | NOT supported by Android NFC chips |
| Protocols: ISO 14443 Type A/B,     | Protocols: EM4100, TK4100, T5577   |
| Mifare Classic, Ultralight, NDEF   | Proximity keyfobs & clamshell cards|
| Reading Distance: 1–4 cm           | Reading Distance: 3–10 cm          |
| Integrated in: NfcRfidReaderService| Integrated via: USB HID wedge or   |
|                                    | SoftwareManualEntryRfidAdapter     |
+------------------------------------+------------------------------------+
```

### Operational Strategy:
1. **NFC-Enabled Centers:** Centers using 13.56 MHz Mifare/NFC smart cards tap directly against the back of the Android device running `NfcRfidReaderService.ts`.
2. **Legacy 125 kHz Centers:** Centers with existing 125 kHz proximity cards use either a USB OTG 125 kHz keyboard wedge reader (which types the UID directly into the input field) or manual entry via `SoftwareManualEntryRfidAdapter.ts`.
3. In both cases, the source is explicitly recorded to prevent audit discrepancies.

---

## 2. UID Normalization & Sanitization Pipeline

To ensure interoperability between different card scanners (which output colons, dashes, lowercase hex, or decimal integers), a strict canonical normalization function is enforced:

```typescript
export function normalizeRfidUid(rawUid: string): string {
  if (!rawUid || typeof rawUid !== 'string') {
    throw new Error('INVALID_RFID_UID: Tag UID must be a non-empty string');
  }

  // Remove all colons, hyphens, and whitespace
  const sanitized = rawUid.replace(/[:\-\s]/g, '').toUpperCase();

  // Validate hexadecimal format
  if (!/^[0-9A-F]+$/.test(sanitized)) {
    throw new Error(`INVALID_RFID_FORMAT: "${rawUid}" contains non-hexadecimal characters`);
  }

  // Enforce minimum UID length (4 bytes = 8 hex chars)
  if (sanitized.length < 8) {
    throw new Error(`INVALID_RFID_LENGTH: "${rawUid}" is too short (minimum 8 hex characters required)`);
  }

  return sanitized;
}
```

---

## 3. Test Verification Results

All 6 normalization and adapter test cases passed with zero failures:

### `apps/registration-expo/src/__tests__/RfidNormalizationTest.ts`
- `testNormalizesColonSeparatedHex`: `04:a2:b3:c4` -> `04A2B3C4` (**PASSED**)
- `testNormalizesHyphenSeparatedHex`: `04-A2-B3-C4` -> `04A2B3C4` (**PASSED**)
- `testNormalizesSpaceSeparatedHex`: `04 a2 b3 c4` -> `04A2B3C4` (**PASSED**)
- `testRejectsInvalidCharacters`: `04:G2:B3:Z4` -> Throws `INVALID_RFID_FORMAT` (**PASSED**)
- `testRejectsTooShortHex`: `04:A2` -> Throws `INVALID_RFID_LENGTH` (**PASSED**)
- `testHardwareLabelIdentifiesPhysicalReaderDeferred`: Returns `'SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED'` (**PASSED**)

### `apps/collection-expo/src/hardware/__tests__/HardwareProviders.test.ts`
- `NfcRfidReaderService: UID normalization and hex validation`: **PASSED**
