# DFarm: Hardware Deferred Boundary & Software Integration Contracts

This document formally defines the architectural boundaries between pure software application logic and external physical dairy hardware. In accordance with strict project rules, **all physical machine driver development and hardware wiring are deferred**.

---

## 1. Scope Boundary Matrix

| Hardware / Machine Domain | Status in Current Scope | Architectural Treatment |
| :--- | :---: | :--- |
| **Android Phone / Tablet Camera** | **IN SCOPE (Software)** | Standard Android CameraX API / Camera2 API for capturing frames for face enrollment and on-device recognition. |
| **Physical Milk Fat/SNF Analyzer** | **DEFERRED (Hardware)** | No RS-232, RS-485, USB, or proprietary serial machine communication drivers are written. Replaced by a clean **Software Input Contract & Validation Interface**. |
| **Physical Weighing Scales / Load Cells** | **DEFERRED (Hardware)** | No serial port baud rate configuration, USB HID drivers, or load cell calibration logic. Replaced by a **Software Weight Intake Contract**. |
| **Physical RFID Reader Drivers** | **DEFERRED (Hardware)** | No raw UART, Wiegand, or low-level controller drivers. The application accepts normalized hexadecimal card UID strings via a standard software input interface. |
| **Microcontrollers & Firmware** | **DEFERRED (Hardware)** | No Arduino, ESP32, STM32, or PLC ladder logic development. |
| **Industrial Buzzers & Indicator LEDs** | **DEFERRED (Hardware)** | Replaced by clean visual and acoustic UI feedback on the collection terminal screen. |

---

## 2. Software Data Input Contracts

To enable immediate development, testing, and UI validation of the entire dairy workflow without blocking on physical laboratory hardware, DFarm establishes strongly typed software contracts:

### 2.1 Composition Input Contract (`MilkCompositionInput`)
```typescript
export interface MilkCompositionInput {
  fatPercentage: number;          // e.g. 4.2 (Percentage w/w)
  snfPercentage: number;          // e.g. 8.6 (Solids-Not-Fat w/w)
  densityCorrected?: number;      // Optional lactometer reading (CLR)
  temperatureCelsius?: number;    // Optional sample temperature
  measurementSource: 'MANUAL_ENTRY' | 'SOFTWARE_SIMULATOR' | 'HARDWARE_ADAPTER';
  deviceId?: string;              // Optional serial / identifier of future analyzer
}
```

### 2.2 Weight Input Contract (`MilkWeightInput`)
```typescript
export interface MilkWeightInput {
  weightKg: number;               // Measured mass in kilograms (e.g. 15.40)
  unit: 'KG' | 'LITERS';          // Standard dairy unit
  tareWeightKg?: number;          // Container tare weight deduction
  measurementSource: 'MANUAL_ENTRY' | 'SOFTWARE_SIMULATOR' | 'HARDWARE_ADAPTER';
  scaleId?: string;               // Optional serial / identifier of future scale
}
```

### 2.3 RFID Card Input Contract (`RFIDScanInput`)
```typescript
export interface RFIDScanInput {
  cardUid: string;                // Normalized uppercase hex string (e.g. "04A1B2C3D4")
  technology: 'MIFARE' | 'EM4100' | 'NFC' | 'MANUAL_KEY';
  readerId?: string;              // Optional scanner identifier
}
```

---

## 3. Future Hardware Adapter Architecture

When physical hardware integration is scheduled in future phases, the software architecture will not require modification. External physical devices will integrate as modular implementations of the `HardwareDeviceAdapter` interface:

```mermaid
graph TD
    subgraph Core_Intake_Software [DFarm Intake Software Engine]
        ValidationService[Validation Service]
        PricingEngine[Pricing Engine]
        TransactionService[Transaction Service]
    end

    subgraph Hardware_Abstraction_Layer [Hardware Abstraction Layer (HAL)]
        AdapterInterface[Hardware Adapter Interface]
    end

    subgraph Input_Implementations [Input Implementations]
        ManualUI[Manual Touchscreen Form<br/>(ACTIVE IN PHASE 02)]
        SimTest[Automated Software Test Simulator<br/>(ACTIVE IN PHASE 02)]
        SerialDriver[Future Serial / RS-232 Adapter<br/>(DEFERRED)]
        USBDriver[Future USB Scale Adapter<br/>(DEFERRED)]
    end

    ManualUI --> AdapterInterface
    SimTest --> AdapterInterface
    SerialDriver -. Future .-> AdapterInterface
    USBDriver -. Future .-> AdapterInterface

    AdapterInterface --> ValidationService
    ValidationService --> PricingEngine
    PricingEngine --> TransactionService
```

By enforcing this abstraction boundary, core business rules, rate calculations, ledger updates, and offline sync engines are developed, verified, and hardened completely independently of physical hardware availability.

