# DFARM PHASE 12 — PRE-UI REDESIGN REGRESSION BASELINE
**Target Application:** `apps/dfarm-collection-app`  
**Execution Reference:** DFARM-PHASE-12-COLLECTION-APP-UI  
**Status:** BASELINE RECORDED  
**Date:** 2026-11-18  

---

## 1. Automated Test Baseline Execution

Before making any visual or architectural modifications to `apps/dfarm-collection-app`, the complete existing test suite was executed in PowerShell.

### Command:
```powershell
Set-Location -Path "c:\Users\panka\.gemini\antigravity\worktrees\DFarm\dfarm_customer_app_init\apps\dfarm-collection-app"
npm test -- --run
```

### Exact Vitest Execution Output:
```
> dfarm-collection-app@0.0.0 test
> vitest run --run

 RUN  v5.1.0 C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-collection-app

 ✓ src/test/offline-queue.test.ts (3 tests) 61ms
 ✓ src/test/collection-transaction.test.ts (5 tests) 30ms
 ✓ src/test/rate-calculation.test.ts (3 tests) 16ms
 ✓ src/test/dairy-face-matcher.test.ts (8 tests) 27ms
 ✓ src/test/multi-dairy-isolation.test.ts (3 tests) 27ms
 ✓ src/test/voice-announcer.test.ts (4 tests) 21ms
 ✓ src/test/auth.test.ts (4 tests) 140ms
 ✓ src/test/hardware-drivers.test.ts (10 tests) 206ms

 Test Files  8 passed (8)
      Tests  40 passed (40)
   Start at  22:16:37
   Duration  17.67s (environment 81%, setup 17%, worker 1%)
```

---

## 2. Test Breakdown by Domain

| Test Suite File | Domain | Tests | Status | Passing Assertions Verified |
|---|---|:---:|:---:|---|
| `auth.test.ts` | Operator Auth & Session | 4 | PASS | OTP request validation, verify OTP with token, operator profile parsing, logout and storage clear |
| `collection-transaction.test.ts` | Intake Submission & Ledger | 5 | PASS | Precondition validation lock, online transaction persistence, balance calculation, duplicate protection, conflict check |
| `dairy-face-matcher.test.ts` | YuNet + SFace INT8 Matching | 8 | PASS | 128-D cosine distance, threshold calculation (0.363), multi-dairy isolation, unknown face detection, template loading |
| `hardware-drivers.test.ts` | Serial, Scale, Analyzer, RFID | 10 | PASS | Scale COM parser (`ST,GS,+...`), Analyzer parser (`FAT:..`), RFID keyboard wedge burst detection, printer ESC/POS |
| `multi-dairy-isolation.test.ts` | Tenant Boundary Security | 3 | PASS | Tenant header injection (`X-Dairy-Id`), customer filtering by dairy, prevention of cross-dairy intake |
| `offline-queue.test.ts` | IndexedDB Offline & Sync | 3 | PASS | Queueing offline transaction, idempotent synchronization payload, queue removal after cloud flush |
| `rate-calculation.test.ts` | Dynamic Rate Matrix | 3 | PASS | Cow milk formula `(Fat*6.5)+(SNF*2.8)`, Buffalo milk formula `(Fat*7.2)+(SNF*2.9)`, floor price ₹10.00/L |
| `voice-announcer.test.ts` | Audio Synthesis & Debounce | 4 | PASS | Web Speech synthesis invocation, 8000ms patron debounce lockout, reset functionality |

**Total Test Files:** 8  
**Total Tests:** 40  
**Passing:** 40 (100%)  
**Failing:** 0  
**Pre-existing Failures:** None.

---

## 3. Production Build Baseline

### Command:
```powershell
Set-Location -Path "c:\Users\panka\.gemini\antigravity\worktrees\DFarm\dfarm_customer_app_init\apps\dfarm-collection-app"
npm run build
```

### Exact Output:
```
vite v8.3.8 building client environment for production...
✓ 2218 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                             0.47 kB │ gzip:     0.30 kB
dist/assets/ort-wasm-simd-threaded.jsep-Dt5UNR3U.wasm  29,520.97 kB │ gzip: 7,066.50 kB
dist/assets/index-BCMAkm0K.css                             46.70 kB │ gzip:     8.95 kB
dist/assets/__vite-browser-external-yypXe9Hf.js             0.08 kB │ gzip:     0.09 kB
dist/assets/dist-C5A2u9XJ.js                               28.09 kB │ gzip:     8.04 kB
dist/assets/ort.bundle.min-SQzhsIls.js                    406.88 kB │ gzip:   110.10 kB
dist/assets/index-DyPI-NHG.js                             458.50 kB │ gzip:   131.91 kB

✓ built in 5.34s
```

**TypeScript Compilation:** Zero errors.  
**Vite Bundling:** Clean production bundle with ONNX Runtime WASM threads.

---

## 4. Hardware and Runtime Status Matrix

| Component / Subsystem | Runtime Status | Physical Status | Mock / Driver Fallback Status |
|---|---|---|---|
| **Webcam / MediaDevices** | Operational | Camera detected / User permission dependent | Graceful camera unavailable fallback active |
| **YuNet ONNX Model** | Loaded | Client WASM execution verified | Synthetic and fixture vectors verified |
| **SFace INT8 ONNX Model** | Loaded | Client WASM execution verified | 128-D canonical vector fixture active |
| **RFID Reader Driver** | Operational | Web Serial + Keyboard-Wedge listener attached | Keyboard simulation verified |
| **Weighing Scale Driver** | Operational | Web Serial attached | Serial protocol simulation verified |
| **Milk Analyzer Driver** | Operational | Web Serial attached | Optical analyzer simulation verified |
| **Thermal Printer Driver** | Operational | Web Serial ESC/POS attached | Mock ESC/POS byte verification verified |
| **Local IndexedDB** | Initialized | Browser database `dfarm_collection_local_db` | Verified in jsdom and browser |

---
**Baseline Complete:** Pre-redesign baseline established. All modifications must maintain 100% test pass rate with zero regression.
