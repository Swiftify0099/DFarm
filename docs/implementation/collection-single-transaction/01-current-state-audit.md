# DFarm Collection App — Single Person Single Transaction Audit

**Document ID:** `docs/implementation/collection-single-transaction/01-current-state-audit.md`  
**Priority:** P0 Critical  
**Target:** Single Active Collection State Machine, Face Detection Lock & Deduplication Gate  
**Status:** Audit Complete — Root Causes Verified  

---

## 1. Executive Summary

A critical issue in the DFarm Collection App caused patrons (such as `Pankaj Popat Yewale`, Customer Code `C-101`) to generate multiple duplicate transactions in the active Shift Intake Journal. Although the YuNet face detector and SFace INT8 embedder correctly recognized the patron, the collection lifecycle lacked:
1. An authoritative single-active-collection state machine.
2. A lock mechanism to suspend face matching once an intake session begins.
3. A face-presence release gate requiring the patron to step away from the camera before scanning resumes.
4. Proper measurement hygiene (FAT and SNF values were retained across cycles in `resetIntakeCycle`).
5. Voice announcement invocation for face matches (present for RFID/manual entry but completely missing in the camera matching callback).
6. Deterministic client-side idempotency keys (each call generated a random UUID via `crypto.randomUUID()`, defeating backend deduplication).

This audit documents the runtime trigger paths, hardware event coupling, and exact source file locations responsible for these anomalies.

---

## 2. Face Detection & Recognition Trigger Path

### A. Frame Inference Loop (`apps/dfarm-collection-app/src/hooks/useCamera.ts`)
- In `useCamera.ts`, when `isCameraActive` and `modelsReady` are true, `processFrame()` runs on every browser animation frame via `requestAnimationFrame(processFrame)`.
- When a face is detected by `yuNetDetector.detect(video)`, the hook throttles matching with a 600 ms window:
  ```typescript
  // useCamera.ts: lines 467-488
  if (now - lastMatchTimeRef.current > 600 && activeDairyId) {
    const { embedding } = await sFaceEmbedder.generateEmbedding(video, topFace)
    let matchRes = DairyFaceMatcher.match(embedding, activeDairyId, enrolledTemplates, customersMap)
  ```
- Upon matching, lines 518-526 invoke:
  ```typescript
  onFaceStateChangeRef.current?.({
    status: 'CUSTOMER_MATCHED',
    boundingBox: currentBox,
    confidenceScore: matchRes.confidenceScore,
    matchedCustomer: matchRes.matchedCustomer,
    ...
  })
  ```
- **Flaw 1: Continuous Inference During Active Collection:** The camera loop does not check whether a collection transaction is currently in progress. It continues to embed and match the face in front of the lens every 600 ms.
- **Flaw 2: Re-matching After Submission:** When a transaction completes and `resetIntakeCycle()` resets `faceState.matchedCustomer` to `null`, within 600 ms the camera loop detects the same patron (who is still standing at the milk weighing platform) and immediately sets `faceState.matchedCustomer` back to that patron.
- **Flaw 3: Absence of Face Clear Gate:** There is no requirement for the patron to exit the frame (consecutive no-face frames) before a new match is registered.

### B. Missing Voice Announcement (`apps/dfarm-collection-app/src/components/workspace/CustomerIdentityPanel.tsx`)
- In `CustomerIdentityPanel.tsx`:
  - Direct code entry calls: `voiceAnnouncer.speakCustomerIdentified(directMatch.fullName)` (line 168).
  - Search query calls: `voiceAnnouncer.speakCustomerIdentified(list[0].fullName)` (line 184).
  - Search modal selection calls: `voiceAnnouncer.speakCustomerIdentified(cust.fullName)` (line 201).
  - RFID scan calls: `voiceAnnouncer.speakCustomerIdentified(target.fullName)` (`HardwareContext.tsx` line 275).
- **Flaw 4:** In `CustomerIdentityPanel.tsx` (lines 63-68):
  ```typescript
  const handleCustomerMatchedCamera = useCallback(
    (customer: CustomerIdentity) => {
      onCustomerSelected(customer, 'FACE_RECOGNITION')
    },
    [onCustomerSelected]
  )
  ```
  `voiceAnnouncer.speakCustomerIdentified` was **never called** for camera face matches. As a result, customer name announcements were completely silent during face recognition.

---

## 3. Hardware Measurement Coupling & Stale Value Retention

### A. Measurement Listeners (`apps/dfarm-collection-app/src/context/HardwareContext.tsx`)
- `scaleDriver.onReading` (lines 289-306) and `milkAnalyzerDriver.onReading` (lines 308-327) write directly to the single `measurements` state.
- Hardware readings are not tagged with a collection attempt ID or session attempt token.

### B. Incomplete Measurement Reset (`HardwareContext.tsx`, lines 420-433)
- When `resetIntakeCycle()` is executed after a transaction save:
  ```typescript
  const resetIntakeCycle = () => {
    setManualCustomer(null)
    resetFaceState()
    resetRfidState()
    milkAnalyzerDriver.clearLastReading()
    voiceAnnouncer.resetAnnouncer()
    setMeasurements((prev) => ({
      ...prev,
      weightLiters: 0.0,
      scaleStable: true,
      readingsValid: false,
      validationErrors: ['Awaiting weight reading'],
    }))
  }
  ```
- **Flaw 5:** Notice that `prev.fat`, `prev.snf`, and `prev.clrDensity` are **NOT** cleared! They remain set to the previous patron's values (`fat: 4.2`, `snf: 8.7`).
- When the scale transmits any positive weight reading (`weightLiters > 0`) for the container on the platform, `readingsValid` checks:
  ```typescript
  if (merged.fat < 2.0 || merged.fat > 15.0) errors.push(...)
  if (merged.snf < 6.0 || merged.snf > 12.0) errors.push(...)
  if (merged.weightLiters <= 0) errors.push(...)
  ```
  Because `merged.fat` and `merged.snf` were retained from the previous reading, `errors.length === 0` immediately becomes true! The application believes it already has valid FAT and SNF for the new customer without waiting for an analyzer reading.

---

## 4. Transaction Creation & Shift Journal Entries

### A. When is a Transaction Created?
- Transactions are created when `handleSubmit()` in `TransactionSummaryPanel.tsx` (lines 107-194) is invoked.
- It is triggered by clicking `SaveTransactionButton` or by the `Ctrl+Enter` shortcut.
- However, because:
  1. The camera re-matches `Pankaj Popat Yewale` within 600 ms of the previous transaction save.
  2. `fat` and `snf` were preserved from the previous reading.
  3. The scale still has milk in the bucket (e.g., 15.0 L),
- The `canSubmit` gate evaluates to `true` almost instantly. Any operator click or automated re-evaluation permits a second, third, or fourth transaction for the same patron with the same or slightly jittered weight.

### B. Shift Intake Journal Updates
- `RecentIntakeTable.tsx` (lines 16-28) queries `localDB.getRecentTransactions()` whenever `refreshTrigger` updates.
- In `TransactionSummaryPanel.tsx`:
  - `transactionsApi.submit()` saves the transaction to `localDB.saveTransaction(txn)` (line 585 in `client.ts`).
  - `onTransactionSaved()` increments `refreshTxnTrigger` in `CollectionWorkspace.tsx` (line 42).
  - Consequently, each duplicate submission writes another record into `completed_transactions` and appears as a separate row in the Shift Intake Journal.

---

## 5. Backend Idempotency Bypass

### A. Backend Idempotency Implementation
In `services/backend/src/application/use-cases/collections/MilkIntakeUseCases.ts`:
```typescript
// lines 51-65
const idempotencyKey =
  dto.idempotencyKey ||
  `IDEM-${dto.customerId}-${dto.sessionId || dto.sessionCode}-${dto.weightLiters}-${dto.fatPercentage}`;

const existingTxn = await this.transactionRepo.findByIdempotencyKey(idempotencyKey);
if (existingTxn) {
  const ledger = await this.ledgerRepo.findByCustomer(existingTxn.customerId);
  return {
    transaction: existingTxn,
    receiptNumber: `RCP-${existingTxn.id.substring(0, 8).toUpperCase()}`,
    customerBalanceAfter: ledger?.currentBalance || 0.0,
    isIdempotentReplay: true,
  };
}
```
The backend correctly implements deduplication using `idempotencyKey`.

### B. Client Random UUID Flaw
In `apps/dfarm-collection-app/src/api/client.ts` (lines 553-555):
```typescript
deviceId: 'KIOSK_MAIN',
idempotencyKey: `TXN-${crypto.randomUUID()}`,
```
- **Flaw 6:** The client generated a completely random UUID on every single call to `/collections/transactions`.
- Even if a network retry or rapid double-submit occurred, the backend received a different `idempotencyKey` each time, completely bypassing database-level and use-case-level deduplication.

---

## 6. Root Cause Matrix

| Issue | Source File & Line | Mechanism / Defect | Remediation Required |
|---|---|---|---|
| **Continuous Face Matching** | `useCamera.ts`: lines 467-531 | Frame loop runs every 600 ms regardless of whether collection is active | Pause face recognition inference while collection session is locked |
| **No Face-Presence Release Gate** | `useCamera.ts`: lines 440-447 | Immediately resets to `WAITING_FOR_FACE` and re-matches same face | Require consecutive no-face frames (`WAITING_FOR_FACE_CLEAR`) before scanning next customer |
| **Voice Announcement Missing on Face Match** | `CustomerIdentityPanel.tsx`: lines 63-68 | Camera callback did not invoke `voiceAnnouncer.speakCustomerIdentified` | Announce verified customer name exactly once on match |
| **Stale FAT/SNF Reused** | `HardwareContext.tsx`: lines 420-433 | `resetIntakeCycle` did not reset `fat`, `snf`, `clrDensity` | Reset `fat: 0`, `snf: 0`, `clrDensity: 0` on every cycle reset |
| **Random Client Idempotency Key** | `client.ts`: line 554 | `idempotencyKey: 'TXN-' + crypto.randomUUID()` | Use active collection `attemptId` as stable idempotency key |
| **No Sequential Workflow Enforcement** | `CollectionWorkspace.tsx`, `HardwareContext.tsx` | No state machine enforcing Face -> FAT -> SNF -> Weight -> Save -> Release | Implement authoritative 14-state collection state machine with audio beeps |

---

## 7. Next Steps
Proceed immediately to:
1. `docs/implementation/collection-single-transaction/02-root-cause-and-state-machine.md`
2. Create dedicated `CollectionStateMachine` service with exact state transition rules.
3. Integrate camera recognition lock, Web Audio distinct beeps, and face-presence release gate.
