# DFARM Thermal Receipt Printer & ESC/POS Formatting Report

**Subsystem:** Receipt Generation & Bluetooth ESC/POS Thermal Printing  
**Component:** `BluetoothEscPosPrinterService.ts` / `ReceiptFormatter.ts`  
**Test Suite:** `src/__tests__/receipt-formatter.test.ts` & `src/hardware/__tests__/HardwareProviders.test.ts`  
**Status:** **IMPLEMENTED — PHYSICAL TEST PENDING (SOFTWARE VERIFIED)**  

---

## 1. Executive Summary & Thermal Printer Standards

The standard receipt printer deployed in Indian milk collection centers is a 2-inch or 3-inch Bluetooth thermal printer running ESC/POS commands with a line width constraint of **40 monospace columns**.

Previous code failed on line-length overflow (42 columns) and lacked protection against duplicate ticket printing.

### Remediation Achievements:
1. Implemented `BluetoothEscPosPrinterService.ts` generating standard ESC/POS binary buffers.
2. Implemented dynamic centering and column truncation (`centerLine(text, 40)`), strictly guaranteeing that every printed line is $\le 40$ characters.
3. Implemented cryptographic slip validation with a SHA-256 verification hash.
4. Implemented duplicate reprint protection: If a ticket is reprinted, it prominently prints `*** DUPLICATE REPRINT #{N} ***` with an incremented counter to prevent farmers from submitting multiple slips for a single milk deposit.

---

## 2. Receipt Layout & 40-Column Slip Format

```
1234567890123456789012345678901234567890 (Column Ruler)
========================================
         DFARM DAIRY COOPERATIVE        
        NORTH DISTRICT CENTER #01       
========================================
Receipt No: REC-20261115-0042
Date/Time : 2026-11-15 06:45:12
Shift     : MORNING
----------------------------------------
Customer  : CUST-0104 - Ramesh Patel
Category  : COW MILK
Quantity  : 24.50 KG
Fat       : 4.20 %
SNF       : 8.60 %
Rate / KG : INR 42.50
----------------------------------------
TOTAL AMT : INR 1,041.25
========================================
Hash: a8f9c1b2e3...5d7a (SHA-256)
Operator  : OP-042 (Verified)
========================================
  Thank you for supplying to DFarm!
```

When reprinted:
```
****************************************
       *** DUPLICATE REPRINT #1 ***     
****************************************
```

---

## 3. ESC/POS Command Protocol Architecture

The binary buffer contains standard control sequences:
- `\x1B\x40` (ESC @): Hardware initialization / reset.
- `\x1B\x61\x01` (ESC a 1): Align center.
- `\x1B\x61\x00` (ESC a 0): Align left.
- `\x1B\x45\x01` (ESC E 1): Emphasized / bold mode on.
- `\x1B\x45\x00` (ESC E 0): Emphasized / bold mode off.
- `\x1D\x56\x41\x00` (GS V A 0): Execute full paper cut.

---

## 4. Test Verification Results

All receipt tests execute cleanly and pass:

### `apps/collection-expo/src/__tests__/receipt-formatter.test.ts`
- `Thermal receipt slip formatting within 40 columns`: **PASSED**
  - Confirmed all lines $\le 40$ characters.
  - Confirmed header, items, totals, and operator details present.
- `Cryptographic verification hash (SHA-256 64-character hex string)`: **PASSED**
  - Confirmed deterministic hash calculation over ticket contents.

### `apps/collection-expo/src/hardware/__tests__/HardwareProviders.test.ts`
- `BluetoothEscPosPrinterService: 40-column receipt formatting`: **PASSED**
  - Confirmed duplicate watermark inclusion on reprints.
  - Confirmed ESC/POS byte buffer non-empty and correctly terminated with cut command.
