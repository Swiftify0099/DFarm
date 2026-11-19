# DFARM — PROMPT 04 PRE-IMPLEMENTATION INSPECTION
## COLLECTION APP / KIOSK COUNTER PRODUCTION READINESS, REAL FACE + RFID IDENTIFICATION, OFFLINE INTAKE SYNC, HARDWARE DRIVERS & THERMAL RECEIPT PRINTING

**Document Reference:** `DFARM-INSPECT-PROMPT-04`  
**Execution Phase:** Prompt 04  
**Status:** COMPLETE  
**Primary Application:** `apps/dfarm-collection-app`  
**Application Type:** Browser-based Desktop Web Application (Chrome & Microsoft Edge)  
**Target Backend:** `services/backend`  
**Target Topology:** Central DB (`dfarm_central`) + Tenant DBs (`dfarm_tenant_<code_hash>`)

---

## 1. EXECUTIVE INSPECTION SUMMARY

This inspection provides a technical audit of `apps/dfarm-collection-app` and its backend dependencies prior to executing Prompt 04.

### Key Inspection Findings:
1. **Application Surface**: `apps/dfarm-collection-app` is a browser-based React 19 + TypeScript + Vite 8 web application styled with Claymorphism. It is NOT and must NOT be packaged as an Electron application.
2. **Biometric Face AI Pipeline**: YuNet detector (`face_detection_yunet_2023mar.onnx`, 232 KB) and SFace INT8 recognizer (`face_recognition_sface_2021dec_int8.onnx`, 9.89 MB) ONNX models are present in `public/models/` and `dist/models/`. `onnxruntime-web` is installed (`^1.31.1`). Live camera frames are acquired via HTML5 `MediaDevices.getUserMedia()`, and landmarks/bounding boxes are tracked.
3. **Session Management**: Session APIs were enhanced in Prompt 03 (`/api/v1/collections/sessions`, `/sessions/active`, `/sessions/open`, `/sessions/:id/close`). The collection counter must bind to these authoritative backend sessions without creating an independent session model.
4. **Hardware Driver Status**:
   - Camera: Working via Web MediaStream API.
   - Voice Announcer: Working via browser Web Speech API (`SpeechSynthesisUtterance`).
   - RFID Reader: Currently simulated in context; keyboard-wedge HID listener and Web Serial driver need standard implementation.
   - Weighing Scale: Continuous serial stream (`ST,GS,+0012.50,KG` @ 4800 baud) documented in `HARDWARE_INTEGRATION_GUIDE.md`; Web Serial driver with stable flag validation needed.
   - Milk Analyzer: Ultrasonic Master Lactometer continuous/polled ASCII protocol (`FAT=04.20 SNF=08.70` @ 19200 baud); Web Serial driver needed.
   - Thermal Printer: Currently uses `window.print()` in summary modal; direct ESC/POS byte sequence builder and thermal voucher print styling needed.
5. **Offline Queue & Synchronization**: IndexedDB (`dfarm_collection_local_db`) has object stores for `offline_queue`, `completed_transactions`, `active_session`, and `customers_cache`. In `OfflineQueueView.tsx`, `handleSyncNow` was wiping items locally without calling the backend sync endpoint. This must be connected to `POST /api/v1/sync/push` (and `/sync/transactions`) using `ProcessOfflineSyncBatchUseCase`.

---

## 2. AUDIT OF PROMPT 03 REPORT OBSERVATIONS

### Observation A: Session API Ambiguity
- **Finding**: In `services/backend/src/presentation/routes/collections.routes.ts`:
  - `GET /collections/sessions`: Lists sessions for the dairy tenant.
  - `GET /collections/sessions/active`: Retrieves the active open shift session for a center/device.
  - `POST /collections/sessions/open` and `POST /collections/sessions`: Both route to `handleOpenSession`, accepting `{ centerId, organizationId, shift, businessDate, deviceId }`.
  - `POST /collections/sessions/:sessionId/close` and `POST /collections/sessions/close`: Both route to `handleCloseSession`.
- **Authoritative Contract for Collection App**:
  - Session Discovery: `GET /api/v1/collections/sessions/active?deviceId=KIOSK_MAIN`
  - Session Opening: `POST /api/v1/collections/sessions/open`
  - Session Closing: `POST /api/v1/collections/sessions/:sessionId/close`

### Observation B: Test Count Discrepancy
- **Finding**: The Node.js native test runner (`node:test`) for `services/backend/tests/dairy-admin-production.test.js` reports:
  - 8 top-level test groups (Groups A through H).
  - 27 numbered business subtests.
  - TAP version 13 reporter counts each suite node and subtest, outputting `# tests 36, # pass 36`.
  - The real count is 27 distinct business assertion cases, executing inside 8 group runners, totaling 36 test execution nodes. Both numbers represent the same passing suite.

### Observation C: Out-of-Scope Backend Modifications
- **Finding**: Prompt 03 modified backend files for payments, feed, bills, and ledger to enforce tenant database routing. In Prompt 04, these are strictly treated as existing dependencies. No modifications to billing or payments will occur in Prompt 04.

### Observation D: Production Claims vs Physical Hardware
- **Finding**: While automated test suites pass 100% in CI/test environments, browser Web Serial and WebUSB access depends on user permission grants and physical USB-to-UART bridge chips (CH340, CP2102, FTDI). This report strictly distinguishes automated unit/browser test evidence from real physical device verification.

---

## 3. CODEBASE REUSABILITY & COMPONENT INVENTORY

| Component / Module | Path | Existing State | Reusability in Prompt 04 |
|---|---|---|---|
| **YuNet Face Detector** | `src/face-ai/yunet-detector.ts` | Complete ONNX wrapper | **100% Reusable**. Runs WASM SIMD inference for 5-point landmark face tracking. |
| **SFace INT8 Embedder** | `src/face-ai/sface-embedder.ts` | Complete ONNX wrapper | **100% Reusable**. Generates 128-dim Float32 normalized embeddings. |
| **Dairy Face Matcher** | `src/face-ai/matcher.ts` | Implements cosine distance | **100% Reusable**. Enforces `dairyId` filtering and threshold (0.363). |
| **Voice Announcer** | `src/drivers/VoiceAnnouncerDriver.ts` | Web Speech API wrapper | **100% Reusable**. Has 8-second debounce window. |
| **Local IndexedDB Engine** | `src/services/local-storage.ts` | Has 4 object stores | **Reusable with Enhancements**. Needs explicit sync state tracking. |
| **Camera Hook** | `src/hooks/useCamera.ts` | Captures MediaStream | **100% Reusable**. Connects camera video element to YuNet/SFace inference loop. |
| **Collection Workspace** | `src/pages/collection/CollectionWorkspace.tsx` | Layout and sub-panels | **Preserve 100% UI**. Wire real hardware and session states. |
| **Measurement Panel** | `src/components/workspace/MeasurementPanel.tsx` | Telemetry display | **Preserve 100% UI**. Wire real scale and analyzer feeds. |
| **Transaction Summary** | `src/components/workspace/TransactionSummaryPanel.tsx` | Rate & Save panel | **Preserve 100% UI**. Wire backend intake and thermal receipt print trigger. |
| **Recent Intake Table** | `src/components/workspace/RecentIntakeTable.tsx` | Shift intake journal | **Preserve 100% UI**. Reads recent transactions from backend/local journal. |

---

## 4. HARDWARE SPECIFICATION & INTERFACE AUDIT

| Device Type | Documented Specs / Protocol | Physical Verification Status | Planned Implementation in Prompt 04 |
|---|---|---|---|
| **Webcam / Camera** | Standard UVC USB Camera, 1080p / 720p @ 30-60fps | Verified via standard HTML5 `navigator.mediaDevices.getUserMedia` | `useCamera.ts` handles permissions, frame loop, and YuNet detection. |
| **RFID Reader** | Mifare Classic 13.56 MHz (ISO 14443A). Protocol: USB Keyboard-Wedge (HID) or Serial 9600 8N1 | Standard USB HID Keyboard-Wedge is universally supported; Web Serial optional | Implement unified `RfidReaderDriver` with high-speed keystroke buffering (<50ms inter-char) + Web Serial reader. |
| **Platform Scale** | Essae-Teraoka / Equal / Phoenix / Avery. Protocol: Continuous ASCII stream `ST,GS,+0012.50,KG\r\n` (4800 / 9600 baud, 8N1) | Documented in `HARDWARE_INTEGRATION_GUIDE.md` | Implement `ScaleDriver` parsing `ST` (stable) vs `US` (unstable) flag and net weight. |
| **Milk Analyzer** | Ultrasonic Lactometer (Master Classic / MilkoTester / Lactoscan). Protocol: ASCII `FAT=xx.xx SNF=xx.xx CLR=xx.xx` (19200 baud, 8N1) | Documented in `HARDWARE_INTEGRATION_GUIDE.md` | Implement `MilkAnalyzerDriver` parsing FAT, SNF, CLR, Temperature. |
| **Thermal Printer** | 58mm / 80mm ESC/POS thermal receipt printer (Epson, TVS, Citizen, Xprinter). USB / Serial / System Spooler | Standard ESC/POS command set (`ESC @`, `ESC a`, `GS !`, `GS V`) | Implement `ThermalPrinterDriver` supporting ESC/POS byte builder + thermal voucher print layout. |

---

## 5. SECURITY & BIOMETRIC PRIVACY AUDIT

1. **Dairy-Scoped Biometric Isolation**:
   - Biometric matching in `DairyFaceMatcher.match` strictly filters candidate templates by `t.dairyId === activeDairyId`.
   - `GET /api/v1/identity/face/templates` checks `req.user.organizationId` and blocks cross-dairy queries.
2. **Template Protection**:
   - Biometric embeddings stored in database are encrypted with AES-256-GCM.
   - In the browser, raw vectors are kept only in transient memory during an active session; they are not saved in unencrypted local storage.
3. **No Unknown-Farmer Auto-Enrollment**:
   - A person whose similarity is `< 0.363` is flagged as `UNKNOWN_PERSON`. The kiosk never silently registers or attributes milk deliveries to unverified persons.
4. **Idempotency Protection**:
   - Every collection transaction generates an immutable `idempotencyKey` (`UUIDv4`). Duplicate sync calls or network retries return the cached transaction without duplicate ledger posting.
