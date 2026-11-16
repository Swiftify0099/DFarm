# DFarm Collection App

> **DFarm Dairy Milk Collection Management Platform**  
> 100% Greenfield browser-based desktop application built for dairy milk collection centers, kiosks, and cooperative societies.

---

## Key Features

- **Biometric Patron Recognition:** Powered by in-browser OpenCV YuNet ONNX (60fps facial landmark detection) and SFace INT8 ONNX (14ms embedding extraction).
- **Contactless RFID Card Support:** Instant patron identification via Mifare 13.56MHz contactless cards.
- **Hardware Telemetry Integration:** Live reading streams for Industrial Camera, Digital Platform Scale, and Ultrasonic Lactometer Analyzer.
- **Debounced Voice Announcer:** Browser Web Speech API synthesizer announcing patron names with an 8-second frame debounce safeguard.
- **Offline-First Resilience:** Local IndexedDB datastore ensuring uninterrupted milk intake recording with automatic cloud reconciliation when online.
- **Two-Axis Rate Matrix Calculation:** Real-time valuation based on Fat %, SNF %, and milk category (Cow / Buffalo).
- **Premium Claymorphic Design:** Custom DFarm brand palette with tangible tactile depth, physical LCD readouts, and responsive keyboard navigation (`F1`–`F6`).

---

## Keyboard Shortcuts

- **F1:** Milk Collection Workspace (`/collection`)
- **F2:** Patron Directory & Biometric Profiles (`/customers`)
- **F3:** Shift Session Reconciliation (`/sessions`)
- **F4:** Hardware Telemetry & Diagnostics (`/devices`)
- **F5:** Offline Queue & Cloud Relay (`/sync`)
- **F6:** Kiosk Terminal Settings (`/settings`)

---

## Quickstart

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation
```bash
# Navigate to project directory
cd apps/dfarm-collection-app

# Install dependencies
npm install
```

### Running Locally
```bash
npm run dev
```

### Running Test Suite
```bash
npm run test
```

### Building for Production
```bash
npm run build
```

---

## Architecture & Verification
- Detailed architecture: [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- UI Consistency Audit: [UI_VERIFICATION_REPORT.md](docs/UI_VERIFICATION_REPORT.md)
- Hardware Peripherals Guide: [HARDWARE_INTEGRATION_GUIDE.md](docs/HARDWARE_INTEGRATION_GUIDE.md)
