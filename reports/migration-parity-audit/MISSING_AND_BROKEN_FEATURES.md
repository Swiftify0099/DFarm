# MISSING AND BROKEN FEATURES REGISTER
## DFARM Migration Parity Audit: Prioritized Defect & Gap Inventory
**Inspection Date:** November 14, 2026  
**Auditor:** Independent Principal Architecture & Migration Verification Agent  
**Status:** Verification Completed (Zero Code Modifications)

---

## 1. Defect Classification & Severity Standards

Every identified issue, missing feature, hardware stub, and architectural discrepancy is categorized according to operational severity:
- **P0 — Critical Blocker:** Prevents end-to-end production operations; compliance violation; physical hardware inability; data loss risk.
- **P1 — High Severity:** Major operational degradation; missing native stream or persistent offline database; manual workaround required.
- **P2 — Medium Severity:** Tooling failures, background daemon absence, build configuration warning, or non-blocking discrepancy.
- **P3 — Low Severity:** Minor UI cosmetic differences, lint warnings, or non-functional placeholder elements.

---

## 2. Prioritized Defect Register

### Defect 1: Biometric Neural Network Model Artifact Missing (P0 — Critical)
- **Defect ID:** `DEF-BIO-001`
- **Application:** Both Applications (Registration & Collection)
- **Affected Files:**
  - Kotlin Registration: `com.dfarm.registration.biometrics.FaceRecognitionEngine`
  - Kotlin Collection: `com.dfarm.collection.biometrics.FaceRecognitionEngine`
  - Expo Registration: [FaceRecognitionEngine.ts](file:///c:/Users/panka/OneDrive/Desktop/DFarm/apps/registration-expo/src/biometrics/FaceRecognitionEngine.ts)
  - Expo Collection: [FaceRecognitionEngine.ts](file:///c:/Users/panka/OneDrive/Desktop/DFarm/apps/collection-expo/src/biometrics/FaceRecognitionEngine.ts)
  - Documentation Reference: [docs/remediation/face-model-artifact-verification.md](file:///c:/Users/panka/OneDrive/Desktop/DFarm/docs/remediation/face-model-artifact-verification.md)
- **Root Cause Analysis:** 
  The project specifies `MobileFaceNet-ArcFace v1.0.0` for 512-dimensional facial embedding generation. However, no physical neural network binary (`.tflite`, `.onnx`, or `.bin`) exists in the repository. Both Kotlin and React Native fall back to a synthetic deterministic projection hash returning `INVALID_EMPTY_HASH`. The collection app intentionally aborts face matching with error code `CALIBRATION_NOT_APPROVED`.
- **Observed Behavior:** Facial enrollment registers simulated mathematical vectors; facial identification in collection app immediately fails with `CALIBRATION_NOT_APPROVED`.
- **Expected Behavior:** Real camera frames must be fed to an on-device TFLite/ONNX inference model generating genuine 512D biometric feature vectors with cosine distance matching.
- **Operational Impact:** Biometric farmer identification cannot be deployed in the field.
- **Remediation Plan:**
  1. Procure and commit the verified, quantised `mobilefacenet_arcface_v1.0.0.tflite` model (approx. 4.2 MB) to `assets/models/`.
  2. Implement an integrity check validating the model's SHA-256 hash upon application startup.
  3. Integrate `react-native-fast-tflite` or `onnxruntime-react-native` for high-performance mobile neural inference.

---

### Defect 2: Peripheral Hardware Drivers Deferred (P0 — Critical)
- **Defect ID:** `DEF-HW-001`
- **Application:** Milk Collection App
- **Affected Files:**
  - [MeasurementScreen.tsx](file:///c:/Users/panka/OneDrive/Desktop/DFarm/apps/collection-expo/src/screens/MeasurementScreen.tsx)
  - [ReceiptScreen.tsx](file:///c:/Users/panka/OneDrive/Desktop/DFarm/apps/collection-expo/src/screens/ReceiptScreen.tsx)
- **Root Cause Analysis:**
  Milk collection centers in India utilize RS-232/USB serial weigh scales (e.g., Essae, Avery) and ultrasonic milk analyzers (e.g., Ekomilk, Lactoscan) to automatically stream weight, fat, and SNF into the software. Thermal receipts must be printed via Bluetooth SPP ESC/POS printers. The Expo codebase flags these integrations as `DEFERRED_HARDWARE_BOUNDARY` and provides manual text inputs and a monospace receipt preview screen only.
- **Observed Behavior:** Operators must manually read digits from the scale and analyzer and type them into text inputs; pressing "Print Receipt" logs an event but does not communicate with a physical printer.
- **Expected Behavior:** The application should pair via Bluetooth or USB OTG, listen to continuous scale/analyzer serial data streams, automatically populate fields, and dispatch raw ESC/POS byte streams to Bluetooth thermal printers.
- **Operational Impact:** High risk of human transcription error, operator fraud, and inability to issue physical paper receipts to farmers.
- **Remediation Plan:**
  1. Add `react-native-bluetooth-escpos-printer` for 58mm/80mm Bluetooth printing.
  2. Implement a custom React Native TurboModule for Android USB Serial / OTG communication with weigh scales and milk analyzers.

---

### Defect 3: Registration App Lacks Persistent SQLite Database (P1 — High)
- **Defect ID:** `DEF-DB-001`
- **Application:** Customer Registration App (`apps/registration-expo`)
- **Affected Files:**
  - [InMemoryRegistrationDraftStore.ts](file:///c:/Users/panka/OneDrive/Desktop/DFarm/apps/registration-expo/src/data/store/InMemoryRegistrationDraftStore.ts)
  - [RegistrationDatabase.ts](file:///c:/Users/panka/OneDrive/Desktop/DFarm/apps/registration-expo/src/data/db/RegistrationDatabase.ts)
- **Root Cause Analysis:**
  The original Kotlin application persists unsubmitted farmer registrations and sync queues in `dfarm_registration.db` via `SQLiteOpenHelper`. In contrast, `apps/registration-expo` implements an in-memory draft store with an asynchronous storage shim. Unlike `apps/collection-expo`, which uses `expo-sqlite`, `registration-expo` lacks genuine relational SQLite tables.
- **Observed Behavior:** If an officer fills out multiple offline farmer registration drafts in rural villages and the Android OS terminates the background app due to memory pressure, all un-synced drafts are permanently lost.
- **Expected Behavior:** Drafts and sync events must be atomically written to an on-disk SQLite database (`registration_drafts` and `registration_sync_events`).
- **Operational Impact:** Critical data loss vulnerability during offline village registration drives.
- **Remediation Plan:**
  1. Port `expo-sqlite` implementation from `apps/collection-expo` to `apps/registration-expo`.
  2. Create persistent `registration_drafts` and `sync_journal` tables with transactional commits.

---

### Defect 4: Face Enrollment Screen Lacks Live Camera Stream (P1 — High)
- **Defect ID:** `DEF-CAM-001`
- **Application:** Customer Registration App (`apps/registration-expo`)
- **Affected Files:**
  - [FaceEnrollmentScreen.tsx](file:///c:/Users/panka/OneDrive/Desktop/DFarm/apps/registration-expo/src/screens/FaceEnrollmentScreen.tsx)
- **Root Cause Analysis:**
  The Kotlin application uses Android `CameraX` to render a 30 FPS preview stream with real-time face detection bounding boxes. In `FaceEnrollmentScreen.tsx`, the camera viewport is a static UI placeholder (`👤`) with a "Process Verified Frame Sample" button that generates a mock frame.
- **Observed Behavior:** No camera feed opens; user cannot see the farmer's face.
- **Expected Behavior:** Real-time camera preview using front/rear camera, displaying face orientation guides, lighting alerts, and automatic face snapshot triggers.
- **Operational Impact:** Registration officers cannot capture real photographs or verify farmer identity visually.
- **Remediation Plan:**
  1. Install and configure `expo-camera`.
  2. Implement dynamic permission requests for `CAMERA`.
  3. Overlay face alignment guides and capture high-resolution face crops.

---

### Defect 5: Physical RFID NFC Reading Deferred to Manual Input (P1 — High)
- **Defect ID:** `DEF-RFID-001`
- **Application:** Both Applications (Registration & Collection)
- **Affected Files:**
  - [RfidAssignmentScreen.tsx](file:///c:/Users/panka/OneDrive/Desktop/DFarm/apps/registration-expo/src/screens/RfidAssignmentScreen.tsx)
  - [IdentificationScreen.tsx](file:///c:/Users/panka/OneDrive/Desktop/DFarm/apps/collection-expo/src/screens/IdentificationScreen.tsx)
- **Root Cause Analysis:**
  NFC smartcard reading logic is documented as `SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED`. Operators must manually type 8-character or 14-character hex strings.
- **Observed Behavior:** No NFC intent listener or hardware card tap capability.
- **Expected Behavior:** Tapping an RFID smartcard on the back of the Android device or external USB reader instantly reads and populates the card UID.
- **Operational Impact:** Manual typing of hex strings (e.g., `04A1B2C3D4E5F6`) is slow and error-prone during rapid morning milk collection.
- **Remediation Plan:**
  1. Integrate `react-native-nfc-manager` into both Expo applications.
  2. Add NFC foreground dispatch and NDEF/Mifare tag reading listeners.

---

### Defect 6: Monorepo Root ESLint Parser Configuration Broken (P2 — Medium)
- **Defect ID:** `DEF-LINT-001`
- **Application:** Root Developer Tooling / Monorepo
- **Affected Files:**
  - `eslint.config.mjs` / `.eslintrc.json`
- **Root Cause Analysis:**
  Running `npm run lint` at the monorepo root triggers ESLint parsing errors across TypeScript files in `packages/shared-types` and `packages/shared-validation` because the configuration does not properly integrate `@typescript-eslint/parser`. Furthermore, neither Expo application defines a `"lint"` script in `package.json`.
- **Observed Behavior:** Linting commands fail with syntax errors on TS `enum` and `interface` declarations.
- **Expected Behavior:** `npm run lint` should execute cleanly across all packages and apps without syntax errors.
- **Operational Impact:** Disrupts CI/CD automated lint pipelines; prevents enforcement of codebase quality standards.
- **Remediation Plan:**
  1. Configure `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` in root ESLint config.
  2. Add `"lint": "eslint ."` scripts to both Expo apps.

---

### Defect 7: Native Android Build Folders Unbuilt (P2 — Medium)
- **Defect ID:** `DEF-BLD-001`
- **Application:** Both Applications (Registration & Collection)
- **Affected Files:**
  - `apps/registration-expo/android/` (Missing)
  - `apps/collection-expo/android/` (Missing)
- **Root Cause Analysis:**
  The Expo applications currently run strictly in managed workflow mode. The command `npx expo prebuild --platform android` has not been run, meaning no native `android/` directories, `build.gradle`, or `AndroidManifest.xml` files exist on disk.
- **Observed Behavior:** Applications can only run via Expo Go or local Expo development client; cannot generate standalone production APKs/AABs directly via Gradle.
- **Expected Behavior:** Generated `android/` directory configured with proper package names, permissions, and native signing keys.
- **Operational Impact:** Release builds cannot be generated without prebuild execution.
- **Remediation Plan:**
  1. Configure `app.json` with Android package IDs (`com.dfarm.registration`, `com.dfarm.collection`).
  2. Execute `npx expo prebuild --platform android`.

---

### Defect 8: Background Sync Daemon (WorkManager) Missing (P2 — Medium)
- **Defect ID:** `DEF-SYNC-001`
- **Application:** Milk Collection App (`apps/collection-expo`)
- **Affected Files:**
  - `apps/collection-expo/src/data/sync/`
- **Root Cause Analysis:**
  The original Kotlin application uses Android Jetpack `WorkManager` to run periodic background sync tasks every 15 minutes, retrying uncommitted transactions even when the application is closed. The Expo application implements a sync engine that runs only when triggered manually or while the UI is active.
- **Observed Behavior:** Sync does not trigger automatically if the app is backgrounded or terminated.
- **Expected Behavior:** Background sync should periodically flush the `sync_journal` when network connectivity is detected.
- **Operational Impact:** Records collected offline may experience delayed synchronization if operators close the app immediately after shifts.
- **Remediation Plan:**
  1. Integrate `expo-background-fetch` and `expo-task-manager`.
  2. Register a periodic background task to invoke `CollectionSyncEngine.flushSyncJournal()`.

---

## 3. Defect Summary Table

| Defect ID | Severity | Area | Title | Effort Estimate |
|---|---|---|---|---|
| `DEF-BIO-001` | **P0** | Biometrics | Missing Neural Model Weights Artifact | 3-5 days |
| `DEF-HW-001` | **P0** | Hardware | Missing Scale, Analyzer & Printer Drivers | 5-7 days |
| `DEF-DB-001` | **P1** | Database | Registration App Uses InMemory Draft Store | 2-3 days |
| `DEF-CAM-001` | **P1** | Camera | Face Enrollment Lacks Live Camera Preview | 2 days |
| `DEF-RFID-001` | **P1** | Hardware | Physical RFID NFC Scanning Deferred | 2 days |
| `DEF-LINT-001` | **P2** | Tooling | Monorepo ESLint Parser Misconfiguration | 0.5 days |
| `DEF-BLD-001` | **P2** | Build | Expo Android Native Folders Not Generated | 1 day |
| `DEF-SYNC-001` | **P2** | Sync | Background Sync Daemon Not Ported | 2 days |
