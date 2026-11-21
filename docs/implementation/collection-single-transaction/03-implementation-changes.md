# DFarm Collection App — Implementation Changes

**Document ID:** `docs/implementation/collection-single-transaction/03-implementation-changes.md`  
**Priority:** P0 Critical  
**Scope:** Single Active Collection State Machine, Face Detection Lock & Deduplication Gate  
**Status:** Implemented & Verified  

---

## 1. Overview of Changes

To resolve the duplicate transaction creation and continuous face matching bug in the Collection App, the following components were introduced and updated:

```
apps/dfarm-collection-app/
├── src/
│   ├── drivers/
│   │   ├── BuzzerDriver.ts               <-- NEW: Web Audio tone synthesizer (880 Hz FAT / 1320 Hz SNF)
│   │   ├── VoiceAnnouncerDriver.ts        <-- UPDATED: Idempotent speech attempt locking ("Customer X. Milk collection starting.")
│   │   └── index.ts                      <-- UPDATED: Export BuzzerDriver
│   ├── services/
│   │   └── CollectionStateMachine.ts     <-- NEW: 14-state authoritative collection lifecycle state machine
│   ├── hooks/
│   │   └── useCamera.ts                  <-- UPDATED: Recognition lock & face-presence release gate integration
│   ├── context/
│   │   └── HardwareContext.tsx           <-- UPDATED: Full state machine orchestration & measurement hygiene (FAT/SNF cleared)
│   ├── api/
│   │   └── client.ts                     <-- UPDATED: Stable idempotencyKey forwarding from collection attempt
│   ├── components/workspace/
│   │   ├── CustomerIdentityPanel.tsx     <-- UPDATED: Camera callback linked to startCollectionAttempt & speech restored
│   │   ├── MeasurementPanel.tsx          <-- UPDATED: Real-time collection stage indicator
│   │   └── TransactionSummaryPanel.tsx   <-- UPDATED: Deduplication gate with attemptId idempotency & commit binding
│   ├── pages/collection/
│   │   └── CollectionWorkspace.tsx       <-- UPDATED: Active customer resolved from state machine attempt
│   ├── types/
│   │   └── index.ts                      <-- UPDATED: CollectionWorkflowState & CollectionAttemptSession types
│   └── test/
│       └── collection-state-machine.test.ts <-- NEW: Comprehensive 30-case validation suite
```

---

## 2. Detailed Component Changes

### A. Sound & Beeper System (`BuzzerDriver.ts`)
- **Location:** `apps/dfarm-collection-app/src/drivers/BuzzerDriver.ts`
- **Capabilities:**
  - `playFatBeep()`: Emits an `880 Hz` (A5) pure sine wave tone with 10ms attack and 30ms release envelope (duration 140ms).
  - `playSnfBeep()`: Emits a `1320 Hz` (E6) tone (duration 140ms), distinctly audible above dairy machinery noise.
  - `playCombinedQualityBeeps(delayMs = 180)`: For combined frames from ultrasonic milk analyzers, inserts a 180ms acoustic gap between Beep 1 and Beep 2.
  - Works across modern browsers via `AudioContext` and handles autoplay restriction gracefully.

### B. Voice Announcer Restoration (`VoiceAnnouncerDriver.ts`)
- **Location:** `apps/dfarm-collection-app/src/drivers/VoiceAnnouncerDriver.ts`
- **Enhancements:**
  - Customer announcement restored with official phrase:  
    `"Customer ${customerName}. Milk collection starting."`
  - Added `announcedAttemptIds: Set<string>` to guarantee that for any active `attemptId`, the patron's name is announced **exactly once**.
  - Automatically cancels previous utterances to prevent speech overlap.

### C. Collection State Machine (`CollectionStateMachine.ts`)
- **Location:** `apps/dfarm-collection-app/src/services/CollectionStateMachine.ts`
- **States:**
  - `IDLE` → `SCANNING` → `CUSTOMER_MATCHED` → `ANNOUNCING` → `WAITING_FOR_FAT` → `FAT_CAPTURED` → `WAITING_FOR_SNF` → `SNF_CAPTURED` → `WAITING_FOR_WEIGHT` → `WEIGHT_CAPTURED` → `VALIDATING` → `SAVING` → `COMMITTED` → `WAITING_FOR_FACE_CLEAR` → `SCANNING`
- **Invariants:**
  - Single active attempt lock: While an attempt is active, any further face detections or matching calls are rejected.
  - Recognition Lock (`isRecognitionLocked()`): Returns `true` during states `CUSTOMER_MATCHED` through `WAITING_FOR_FACE_CLEAR`.
  - Sequential Enforcement: Rejects weight readings before FAT and SNF are both captured.

### D. Camera Recognition Lock & Face-Presence Gate (`useCamera.ts`)
- **Location:** `apps/dfarm-collection-app/src/hooks/useCamera.ts`
- **Enhancements:**
  - Added `isRecognitionLocked` and `onFacePresence` callback props.
  - When `isRecognitionLocked === true`:
    - The HTML5 camera stream and video element keep running seamlessly (no black screen or stream recreation).
    - YuNet detection runs to update the visual bounding box and count faces.
    - SFace embedding and customer gallery matching are **bypassed completely**.
  - `onFacePresence(faces.length)` notifies the state machine to track consecutive zero-face frames when in `WAITING_FOR_FACE_CLEAR`.

### E. Hardware Context Hygiene (`HardwareContext.tsx`)
- **Location:** `apps/dfarm-collection-app/src/context/HardwareContext.tsx`
- **Enhancements:**
  - `resetIntakeCycle()` now zeroes out `fat = 0`, `snf = 0`, `clrDensity = 0`, and `weightLiters = 0`. Stale measurements can never spill over into the next intake.
  - Routed analyzer and scale drivers through the state machine.
  - Exposes `collectionWorkflowState`, `activeAttempt`, `isRecognitionLocked`, `startCollectionAttempt`, and `commitCollectionAttempt`.

### F. Client Idempotency (`client.ts`)
- **Location:** `apps/dfarm-collection-app/src/api/client.ts`
- **Enhancements:**
  - `transactionsApi.submit` now accepts `idempotencyKey?: string`.
  - Sends the state machine's `attemptId` as the stable idempotency key to the backend, enabling server-side deduplication.

### G. UI Panels (`CustomerIdentityPanel.tsx`, `MeasurementPanel.tsx`, `TransactionSummaryPanel.tsx`)
- **CustomerIdentityPanel:**
  - Camera match triggers `startCollectionAttempt(customer, 'FACE_YUNET_SFACE')`.
  - Shows active state machine stage badge.
- **MeasurementPanel:**
  - Displays real-time state machine badge (`WAITING FOR FAT`, `WAITING FOR SNF`, etc.).
- **TransactionSummaryPanel:**
  - Binds active `attemptId` to `transactionsApi.submit` and calls `commitCollectionAttempt` on completion.
