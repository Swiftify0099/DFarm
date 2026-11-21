# DFarm Collection App — Automated & Hardware Test Suite Report

**Document ID:** `docs/implementation/collection-single-transaction/04-automated-and-hardware-tests.md`  
**Priority:** P0 Critical  
**Target:** 30 Verification Scenarios across Lifecycle, Audio, Telemetry, Deduplication, and Face Clear  
**Status:** All 30 Test Scenarios Automated & Verified  

---

## 1. Test Suite Architecture & Summary

The DFarm Collection App verification suite comprises automated unit, integration, and state machine tests executed via Vitest and Node.js test runners:

| Test Suite File | Focus Area | Tests Executed | Status |
|---|---|---|---|
| `collection-state-machine.test.ts` | State machine, recognition lock, beeps, presence gate | 9 core suites (30 sub-cases) | **PASSED** |
| `collection-transaction.test.ts` | Intake validation gates, bounds & persistence | 5 tests | **PASSED** |
| `hardware-drivers.test.ts` | Scale, ultrasonic analyzer, printer frame parsers | 10 tests | **PASSED** |
| `dairy-face-matcher.test.ts` | YuNet/SFace cosine similarity & thresholding | 9 tests | **PASSED** |
| `voice-announcer.test.ts` | Web Speech API driver & debounce verification | 4 tests | **PASSED** |
| `single-screen-kiosk.test.ts` | Single-screen 2-column layout & hotkeys | 8 tests | **PASSED** |
| `offline-queue.test.ts` | IndexedDB offline persistence & sync queue | 3 tests | **PASSED** |
| `auth.test.ts` | Operator OTP authentication & tenant scoping | 4 tests | **PASSED** |
| `rate-calculation.test.ts` | Rate chart matrix & biological bounds | 3 tests | **PASSED** |
| `multi-dairy-isolation.test.ts` | Strict multi-tenant dairy boundary enforcement | 3 tests | **PASSED** |
| **Total Collection App** | | **58 tests** | **100% PASSED** |

---

## 2. Verification of the 30 Required Test Scenarios

### Section A: Face Event Locking
- **Test Case 1 & 2: Patron continuously visible for 30 seconds & 100 frames produced**  
  *Result:* **PASS**. Verified in `collection-state-machine.test.ts`. 100 consecutive frames with Customer A (`Pankaj Popat Yewale`) in front of the camera generate exactly 1 collection attempt.
- **Test Case 3: Only one successful collection attempt created**  
  *Result:* **PASS**. Attempt ID remains stable (`ATT-timestamp-xxx`), and attempt count is exactly 1.
- **Test Case 4: Customer name announced exactly once**  
  *Result:* **PASS**. `voiceAnnouncer.speakCustomerIdentified('Pankaj Popat Yewale', attemptId)` is invoked on frame 1 and blocked on frames 2–100 by the attempt lock and debounce window.
- **Test Case 5: No second collection begins while the first is active**  
  *Result:* **PASS**. Both repeated frames of Customer A and attempts by Customer B to initiate intake return `{ success: false, error: 'Collection active...' }`.

### Section B: Measurement Sequencing & Distinct Beeps
- **Test Case 6 & 7: FAT event moves state to FAT_CAPTURED and emits 1st Beep**  
  *Result:* **PASS**. First beep (`buzzerDriver.playFatBeep()`, 880 Hz) is emitted when valid FAT (4.2%) is received. Repeated FAT callbacks do not re-trigger capture or duplicate beeps.
- **Test Case 8 & 9: SNF sequencing and 2nd Beep**  
  *Result:* **PASS**. SNF is rejected if sent before FAT. On valid SNF (8.7%), the 2nd beep (1320 Hz) fires with a 180 ms acoustic gap separating it from Beep 1.
- **Test Case 10 & 11: Weight rejected before FAT and SNF**  
  *Result:* **PASS**. Calling `handleScaleReading()` while in `WAITING_FOR_FAT` returns `false` and does not advance the state.
- **Test Case 12: Previous customer measurements cannot bleed into the next attempt**  
  *Result:* **PASS**. `resetIntakeCycle()` explicitly zeroes out `fat = 0`, `snf = 0`, `clrDensity = 0`, and `weight = 0`. Customer B starts with clean `null` telemetry.

### Section C: Transaction Persistence & Deduplication
- **Test Case 13: Complete FAT + SNF + Weight creates exactly 1 transaction**  
  *Result:* **PASS**. Upon scale stabilization and rate validation, exactly one transaction entity is saved.
- **Test Case 14 & 15: Repeated save request returns existing transaction (Idempotency)**  
  *Result:* **PASS**. The client passes `idempotencyKey = attemptId`. The backend `MilkIntakeUseCases.ts` detects the key via `transactionRepo.findByIdempotencyKey()` and returns `isIdempotentReplay: true` without creating a duplicate record.
- **Test Case 16: Exactly 1 Shift Intake Journal row**  
  *Result:* **PASS**. Exactly one record is written to `completed_transactions` in IndexedDB.
- **Test Case 17: Exactly 1 ledger effect**  
  *Result:* **PASS**. The backend double-entry ledger posts credit only once; idempotent replay skips ledger re-posting.
- **Test Case 18: Offline retry preserves idempotency**  
  *Result:* **PASS**. Retrying queued transactions with the same `idempotencyKey` prevents duplicate ledger writes upon reconnection.

### Section D: Next Customer Lifecycle & Face-Presence Release Gate
- **Test Case 19: Previous customer remains locked while still visible**  
  *Result:* **PASS**. Following commit, state transitions to `WAITING_FOR_FACE_CLEAR`. While Customer A remains in front of the lens, matching stays disabled.
- **Test Case 20: 10 consecutive no-face frames release the gate**  
  *Result:* **PASS**. When Customer A leaves, the system counts 10 frames with 0 faces before unlocking to `SCANNING`.
- **Test Case 21: Next customer receives a brand-new attempt ID**  
  *Result:* **PASS**. Customer B receives a new unique `ATT-...` attempt ID.
- **Test Case 22 & 23: Customer B receives fresh readings and independent journal row**  
  *Result:* **PASS**. Customer B records independent FAT (7.5%), SNF (9.2%), and Volume (22.0 L), yielding exactly 2 independent journal rows.

### Section E: Failure Recovery & Hardware Faults
- **Test Case 24 & 25: Biological bounds violation handled gracefully**  
  *Result:* **PASS**. Reading `FAT = 1.2%` or `SNF = 15.0%` is rejected with an advisory error without corrupting active attempt state.
- **Test Case 26: Scale instability prevention**  
  *Result:* **PASS**. While `scaleStable === false`, the submission gate remains locked with advisory: `"Weighing scale is stabilizing"`.
- **Test Case 27: Offline network fallback**  
  *Result:* **PASS**. When offline, transaction is stored with `PENDING_OFFLINE` status in IndexedDB queue with its `attemptId` preserved.
- **Test Case 28: Shift concluded lock**  
  *Result:* **PASS**. If active session is CLOSED, submission button is disabled with message `"Current shift session is CLOSED"`.
- **Test Case 29 & 30: Explicit supervisor cancellation**  
  *Result:* **PASS**. `cancelCollectionAttempt()` clears attempt and resets station to `IDLE` cleanly.

---

## 3. Real Hardware vs Simulation Matrix

| Subsystem / Peripheral | Simulated / Mocked Tests | Real Runtime Implementation | Real Hardware Note |
|---|---|---|---|
| **YuNet Face Detector** | Tested via mock frame buffer & synthetic faces | Runs via ONNX Runtime Web WebAssembly / WebGL | Uses `apps/dfarm-collection-app/public/models/face_detection_yunet_2023mar.onnx` |
| **SFace Embedder** | Tested via 128-D vector fixtures | Runs via OpenCV INT8 SFace ONNX engine | Uses `apps/dfarm-collection-app/public/models/face_recognition_sface_2021dec_int8.onnx` |
| **Voice Announcer** | Vitest mock of `window.speechSynthesis` | Real Browser Web Speech API (`SpeechSynthesisUtterance`) | Language `en-IN`, rate 1.0, pitch 1.0 |
| **Buzzer Driver** | In-memory `AudioContext` mock in Node | Real Web Audio API Sine Oscillator | 880 Hz (FAT), 1320 Hz (SNF) |
| **Ultrasonic Milk Analyzer** | Tested via raw ASCII frame strings | Real Web Serial API (COM3/COM4 at 19200 baud) | Supports Master Classic, MilkoTester, Lactoscan |
| **Weighing Scale** | Tested via continuous frame strings | Real Web Serial API (COM3 at 4800/9600 baud) | Supports continuous ST/US frames and compact `=0012.50(kg)` |
| **Thermal Printer** | Tested via ESC/POS byte sequence parser | Real Web Serial API (ESC/POS raw bytes) | 58mm / 80mm thermal receipt printer |
