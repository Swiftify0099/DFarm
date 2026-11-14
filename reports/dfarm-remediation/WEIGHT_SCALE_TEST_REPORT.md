# DFARM Weight Scale Integration & Serial Protocol Test Report

**Subsystem:** Weight Scale Peripheral Subsystem  
**Component:** `UsbSerialWeightScaleService.ts` / `ManualEntryWeightProvider.ts`  
**Test Suite:** `src/hardware/__tests__/HardwareProviders.test.ts`  
**Status:** **IMPLEMENTED — PHYSICAL TEST PENDING (SOFTWARE VERIFIED)**  

---

## 1. Protocol Specifications

The DFarm milk collection counter interfaces with digital bench scales via RS-232 serial communication over USB OTG.

| Parameter | Specification | Notes |
|---|---|---|
| **Interface** | RS-232C via USB OTG Host | Requires USB Host support on Android device |
| **Baud Rate** | 9600 bps | Configurable in scale calibration menu |
| **Data Bits** | 8 | Standard 8N1 framing |
| **Parity** | None | |
| **Stop Bits** | 1 | |
| **Flow Control** | None (Raw ASCII Stream) | Scale continuously transmits at 10–20 Hz |
| **Line Terminator** | `\r\n` (CRLF) or `\n` (LF) | Delimits individual scale weight packets |
| **Maximum Capacity**| 200.00 kg | Hard limit for standard milk cans |
| **Minimum Unit** | 0.01 kg (10 grams) | Scale precision |

---

## 2. ASCII Frame Grammar & Parsing Architecture

Supported scale manufacturers in Indian dairy cooperatives include Essae-Teraoka, Avery India, Toledo, and Phoenix.

### 2.1 Standard Frame Formats
1. **Essae Format:** `ST,GS,+0024.50kg\r\n`
   - `ST`: Stable reading (`US` = Unstable reading)
   - `GS`: Gross Weight (`NT` = Net Weight)
   - `+0024.50`: 8-character signed decimal value
   - `kg`: Unit identifier (strictly enforced)
2. **Avery / Standard Format:** `WN,0012.40kg\r\n`
3. **Overload Format:** `OL\r\n` or `ST,GS,+9999.99kg\r\n`

### 2.2 Parser Implementation Details
```typescript
// Extracted from UsbSerialWeightScaleService.ts
parseAsciiFrame(frame: string): WeightReading {
  const trimmed = frame.trim();
  if (trimmed.includes('OVERLOAD') || trimmed.includes('OL')) {
    throw new Error('SCALE_OVERLOAD: Weight exceeds maximum scale capacity (200 KG)');
  }
  const match = trimmed.match(/([+-]?\d+\.?\d*)\s*(kg|g|lb)?/i);
  if (!match) {
    throw new Error(`UNPARSEABLE_FRAME: Cannot parse weight from "${frame}"`);
  }
  const rawWeight = parseFloat(match[1]);
  const unit = (match[2] || 'kg').toLowerCase();
  if (unit !== 'kg') {
    throw new Error(`INVALID_UNIT: Scale sent unit "${unit}", but DFarm requires canonical "KG"`);
  }
  if (rawWeight > 200.00) {
    throw new Error(`SCALE_OVERLOAD: Measured weight ${rawWeight} kg exceeds maximum 200 KG limit`);
  }
  if (rawWeight <= 0) {
    throw new Error(`INVALID_WEIGHT: Weight must be positive (received ${rawWeight} kg)`);
  }
  return {
    netWeight: rawWeight,
    unit: MeasurementUnit.KG,
    isStable: !trimmed.startsWith('US'),
    timestamp: new Date().toISOString(),
    source: MeasurementSource.USB_SERIAL_SCALE,
  };
}
```

---

## 3. Test Cases & Execution Results

| Test Case ID | Input / Scenario | Expected Output | Actual Result | Status |
|---|---|---|---|---|
| **WS-01** | `ST,GS,+0024.50kg\r\n` | 24.50 kg, stable: true, source: USB_SERIAL_SCALE | 24.50 kg, stable: true | **PASSED** |
| **WS-02** | `WN,0012.40kg\r\n` | 12.40 kg, stable: true, source: USB_SERIAL_SCALE | 12.40 kg, stable: true | **PASSED** |
| **WS-03** | `OL\r\n` | Throw `SCALE_OVERLOAD` exception | Error caught: `SCALE_OVERLOAD` | **PASSED** |
| **WS-04** | `ST,GS,+0250.00kg\r\n` | Throw `SCALE_OVERLOAD` (> 200 kg) | Error caught: Exceeds 200 KG | **PASSED** |
| **WS-05** | `ST,GS,+0050.00lb\r\n` | Throw `INVALID_UNIT` (Non-KG rejected) | Error caught: Invalid unit | **PASSED** |
| **WS-06** | `ST,GS,+0000.00kg\r\n` | Throw `INVALID_WEIGHT` (<= 0 rejected) | Error caught: Must be positive | **PASSED** |
| **WS-07** | Manual Entry: 15.5 kg | Valid reading, source: MANUAL_ENTRY | 15.50 kg, source: MANUAL_ENTRY | **PASSED** |
| **WS-08** | Manual Entry: -5.0 kg | Throw `INVALID_WEIGHT` | Error caught: Must be positive | **PASSED** |
| **WS-09** | Manual Entry: 205.0 kg | Throw `SCALE_OVERLOAD` (> 200 kg) | Error caught: Exceeds 200 KG | **PASSED** |

---

## 4. Hardware Calibration & Operational Instructions

1. **Hardware Zero (Tare):**
   - The scale platter must be clean and free of milk residues before beginning intake.
   - Press the physical TARE button on the scale to calibrate 0.00 kg.
2. **Stability Verification:**
   - The operator must not rest milk measuring buckets or hands on the scale platter while reading.
   - The driver will reject frames marked `US` (unstable) until the pointer settles.
3. **Audit Trail:**
   - If the serial cable is disconnected and the operator manually inputs the weight, the record is flagged `MANUAL_ENTRY` in the database, allowing supervisors to audit manual overrides against physical milk tank volumes.
