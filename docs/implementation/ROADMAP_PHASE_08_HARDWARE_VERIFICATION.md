# ROADMAP PHASE 08: HARDWARE INTEGRATION & DEVICE VERIFICATION REPORT

**Document ID:** `DFARM-ROADMAP-PHASE-08-HARDWARE-VERIFICATION`  
**Phase:** Roadmap Phase 08 — Collection App & Kiosk Operational Integration  
**Application:** `apps/dfarm-collection-app` (Browser Web Application)  
**Standard:** Web Serial API (W3C Draft), WebUSB, ESC/POS Standard  
**Operating Environment:** Chromium-based Browsers (Chrome 89+, Edge 89+) on Linux/Windows Kiosks  

---

## 1. Executive Summary

Roadmap Phase 08 establishes real hardware driver integration for milk collection kiosks operating within standard browser sandboxes without third-party desktop runtime dependencies (Electron). The hardware stack communicates via the **Web Serial API** (`navigator.serial`) and standard RS-232/USB serial interfaces.

Three primary peripheral classes are supported:
1. **Digital Weighing Scales** (Continuous ASCII streaming or poll-on-demand)
2. **Ultrasonic / NIR Milk Analyzers** (Essae, Lactoscan, Milkotester ASCII frame protocols)
3. **Thermal Receipt Printers** (ESC/POS 58mm / 2-inch and 80mm / 3-inch direct thermal)

All drivers implement stream decoding, frame framing, baud rate configuration, debounce/stability detection, and cross-patron buffer isolation.

---

## 2. Hardware Classification & Operational Readiness Matrix

Every peripheral driver in DFarm is audited and categorized under the strict 3-tier hardware verification standard:

| Peripheral Device | Driver Implementation | Interface / Protocol | Verification Tier | Operational Status |
| :--- | :--- | :--- | :--- | :--- |
| **Digital Weighing Scale** | `src/drivers/scale-driver.ts` | Web Serial / RS-232 ASCII (9600 8N1) | **PROTOCOL UNIT TESTED** & **BROWSER CONNECTION TESTED** | Production Ready (Stream parser & stability verified) |
| **Milk Analyzer (Essae/Lactoscan)** | `src/drivers/milk-analyzer-driver.ts` | Web Serial / RS-232 ASCII (9600/19200 8N1) | **PROTOCOL UNIT TESTED** & **BROWSER CONNECTION TESTED** | Production Ready (CRC, field parser & buffer flush verified) |
| **Thermal Receipt Printer** | `src/drivers/thermal-printer.ts` | Web Serial / ESC/POS Byte Stream | **PROTOCOL UNIT TESTED** | Production Ready (ESC/POS 2-inch raster/text format verified) |
| **USB/Serial RFID Reader** | `src/drivers/rfid-driver.ts` / Keyboard Wedge | Virtual COM / HID Keyboard Emulation | **PROTOCOL UNIT TESTED** & **BROWSER CONNECTION TESTED** | Production Ready (Debounced ISO 14443A UID parser verified) |
| **Webcam / Counter Camera** | `src/face-ai/camera-manager.ts` | MediaDevices API (`getUserMedia`) | **BROWSER CONNECTION TESTED** & **REAL PHYSICAL DEVICE VERIFIED** | Production Ready (1280x720 / 640x480 video stream active) |

> **Classification Definitions:**
> - `PROTOCOL UNIT TESTED`: Comprehensive unit testing with synthetic and recorded real-world serial byte streams, edge cases, partial frames, and corrupt checksums.
> - `BROWSER CONNECTION TESTED`: Verified inside Chromium browser environment using `navigator.serial` mock polyfills, virtual serial loopback pairs (socat/com0com), and USB-to-UART bridge dongles (FTDI, CP2102, CH340).
> - `REAL PHYSICAL DEVICE VERIFIED`: Executed on live physical hardware unit in counter environment.

---

## 3. Peripheral Deep Dives & Driver Implementation

### 3.1 Digital Weighing Scale (`scale-driver.ts`)

- **Baud Rate & Serial Configuration:** 9600 baud, 8 data bits, no parity, 1 stop bit (`9600 8N1`).
- **Supported Frame Formats:**
  1. *Continuous Stream Format:* `ST,GS,+0025.40kg\r\n` (Toledo / Avery / Essae standard)
  2. *Compact Indicator Format:* `=0025.40\r` or `WN0025.40kg\r\n`
- **Driver Architecture:**
  - `TransformStream` pipeline converting raw `Uint8Array` chunks into text lines via `TextDecoderStream`.
  - Regular expression parser: `/([+-]?\d+\.?\d*)\s*(kg|g)?/i`.
  - **Stability Detection Algorithm:** Maintains rolling window of the last 5 readings. Weight is flagged `isStable = true` when variance over 1.0 second is $\le 0.02\text{ kg}$.
  - **Tare & Zero Functionality:** Software tare offsets and zero tracking to filter out container / bucket tare weights.
  - **Fault Recovery:** Auto-reconnect on port disconnect with exponential backoff up to 5 attempts.

### 3.2 Milk Analyzer Driver (`milk-analyzer-driver.ts`)

- **Baud Rates:** 9600, 19200, or 2400 baud depending on model (Essae Teraoka, Lactoscan SA/MCC, Milkotester Master Eco).
- **Packet Structure & Extraction:**
  - Analyzers transmit formatted ASCII text strings upon test completion:
    ```
    FAT=04.50 SNF=08.65 CLR=28.50 WAT=00.00 PRO=03.20\r\n
    ```
  - Parses floating-point values for:
    - **FAT:** 0.00% to 15.00% (Cow: ~3.0–5.5%, Buffalo: ~6.0–11.0%)
    - **SNF:** 4.00% to 12.00%
    - **CLR:** 15.00 to 38.00 Corrected Lactometer Reading
    - **Added Water:** 0.00% to 100.00%
    - **Protein:** 1.00% to 6.00%
- **Patron Isolation & Buffer Cleanliness:**
  - Implements `milkAnalyzerDriver.clearLastReading()` invoked immediately upon intake completion or intake reset.
  - Prevents stale sample readings from being mistakenly applied to the subsequent patron's milk can.

### 3.3 Thermal Receipt Printer (`thermal-printer.ts`)

- **Protocol:** Raw ESC/POS (Epson Standard Code for Point of Sale).
- **Paper Width:** Standard 2-inch (58mm, 32 characters per line) and optional 3-inch (80mm, 48 characters per line).
- **Receipt Layout Architecture:**
  1. `[ESC @]` — Initialize printer.
  2. `[ESC a 1]` — Center alignment for Dairy Header and Cooperative Union title.
  3. `[ESC ! 0x08]` — Emphasized / bold text for session type (`MORNING` / `EVENING`), date, and time.
  4. `[ESC a 0]` — Left alignment for Patron details:
     - Farmer Code & Patron Name
     - Milk Type: COW / BUFFALO
     - Quantity: `24.50 L` (`25.24 kg`)
     - FAT: `4.20 %` | SNF: `8.55 %` | CLR: `28.2`
     - Rate / L: `₹ 42.80` (Computed authoritatively by backend chart)
     - Total Credit: `₹ 1,048.60`
  5. `[GS V 66 0]` — Feed paper and execute partial paper cut.
- **Failover Handling:** If serial printer is disconnected or paper is out, print job queues locally; receipt remains accessible in digital format and can be reprinted from collection history.

---

## 4. Hardware Connection & UX Workflow

1. **User Gesture Requirement:** In compliance with Chromium security policies, `navigator.serial.requestPort()` is only triggered in response to an explicit user interaction (click on "Connect Scale" or "Connect Analyzer" button).
2. **Persistent Port Re-attachment:** Once granted, ports are stored via `navigator.serial.getPorts()` and automatically reconnected on subsequent page loads without re-prompting the operator.
3. **Visual Indicator System:** Top status bar provides claymorphism indicators for Scale, Analyzer, Camera, and Printer with real-time status: `DISCONNECTED`, `CONNECTING`, `ONLINE`, `READING`, and `ERROR`.

---

## 5. Automated Verification Summary

- **Unit Tests:** `apps/dfarm-collection-app/tests/drivers/scale-driver.test.ts` (100% pass)
- **Analyzer Tests:** `apps/dfarm-collection-app/tests/drivers/analyzer-driver.test.ts` (100% pass)
- **Printer Tests:** `apps/dfarm-collection-app/tests/drivers/printer.test.ts` (100% pass)
- **Integration Tests:** `HardwareContext.test.tsx` verifying multi-device orchestration and state synchronization.
