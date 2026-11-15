# RFID & Contactless Card Hardware Integration Report
## 13.56 MHz NFC/Mifare Reader, UID Normalization, Hex Validation & Cache Lookup

**Document Version**: 1.0.0  
**Verification Date**: 2026-11-15  
**Target Module**: `apps/collection-expo/src/hardware/NfcRfidReaderService.ts`  
**Reference Kotlin Module**: Android `NfcAdapter` / Foreground Dispatch in `MainActivity.kt`  
**Verification Status**: **IMPLEMENTED — HARDWARE TEST PENDING** (Physical reader verification pending device bench testing; software logic **FIXED AND VERIFIED**)

---

### 1. Hardware Architecture & Protocol Support

| Specification | Implementation Details |
| :--- | :--- |
| **RF Frequency** | 13.56 MHz (ISO/IEC 14443 Type A & Type B, ISO/IEC 15693) |
| **Card Types Supported** | Mifare Classic 1K/4K, Mifare Ultralight, NTAG213/215/216, Mifare DESFire |
| **Mobile Integration** | Android `NfcAdapter` via `react-native-nfc-manager` |
| **UID Lengths** | 4-byte (8 hex chars, single size) and 7-byte (14 hex chars, double size) |
| **Normalization Rules** | Strips delimiters (`:`, `-`, spaces), uppercases all characters |
| **Hex Validation** | Regex `^[0-9A-F]{8,20}$` (strictly blocks non-hex tokens and short strings) |

---

### 2. Signal Processing & Identification Flow

```
  [ Farmer Taps 13.56 MHz RFID Card ]
                   │
                   ▼
     [ NFC Antenna Hardware Event ]
                   │
                   ▼ (Raw Byte Array: [0x04, 0xA1, 0xB2, 0xC3, ...])
                   │
  [ NfcRfidReaderService.normalizeUid ] ──▶ "04A1B2C3D4E5F6"
                   │
                   ▼
  [ Hex Validation: /^[0-9A-F]{8,20}$/ ]
       ├── Invalid ──▶ (Error: INVALID_RFID_HEX)
       └── Valid
             │
             ▼
      Is Network Online?
       ├── Yes ──▶ Call API: POST /api/v1/identification/rfid
       │             ├── Found ──▶ Return Canonical Customer UUID
       │             └── Network Failure ──▼ (Fallback to local SQLite)
       └── No ───▶ Query SQLite: `SELECT * FROM cached_customers WHERE rfid_card_id = ?`
                     ├── Found ──▶ Return Cached Customer Profile & UUID
                     └── Not Found ──▶ Return RFID_NOT_FOUND (Prompt manual search)
```

---

### 3. Connection State & Software Boundary

The hardware status reflects physical reality:
- `CONNECTED`: Physical NFC antenna initialized and listening for tags.
- `DISCONNECTED`: NFC disabled in Android system settings or device lacks NFC antenna.
- `DEFERRED_HARDWARE_BOUNDARY`: When executing in unit test runners or developer emulators without physical RF hardware, signals are explicitly labeled to avoid fake hardware claims.

---

### 4. UI & Operator Experience

In `IdentificationScreen.tsx`:
- **Card Reader HUD**: A dedicated Clay card displays an animated contactless icon with live connection badge (`NFC ACTIVE` in soft green or `NFC DISABLED` in soft red).
- **Manual UID Fallback**: In cases of card scratching or antenna failure, the operator can tap `Enter UID Manually` into a tactile inset text field.
- **Immediate Feedback**: Tapping a card gives instant haptic vibration and acoustic confirmation before advancing to customer confirmation.

---

### 5. Automated Verification Evidence

- `HardwareProviders.test.ts`:
  - `Test 9`: UID normalization correctly transforms colon-delimited (`04:a1:b2:c3:d4:e5:f6` -> `04A1B2C3D4E5F6`) and hyphenated strings (`04 - a1 - b2 - c3` -> `04A1B2C3`).
  - `Test 9`: Hex validation accepts `04A1B2C3D4` and rejects `XYZ123` (non-hex) and `12` (too short).
- `customer-identification.test.ts`:
  - `Test 5`: RFID card identification resolves correctly to canonical customer UUID.
  - `Test 6`: Unassigned / unknown card UID returns controlled error `RFID_NOT_FOUND`.
- `collection-repository.test.ts`:
  - `Test 3`: Online RFID identification via API client verified.
  - `Test 4`: Offline RFID identification fallback to local SQLite cache verified.

**Conclusion**: RFID reader driver and UID resolution logic are fully verified. Physical Android NFC bench test remains scheduled for final field release.
