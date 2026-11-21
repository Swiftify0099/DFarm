# 08 — Collection App Regression Report

**Date:** 2026-11-19

---

## Scope of Changes

The camera fix is **strictly limited** to:

1. `src/hooks/useCamera.ts` — full replacement with lifecycle-safe implementation
2. `src/components/workspace/CustomerIdentityPanel.tsx` — two targeted changes:
   - Added `useCallback` to import
   - `onCustomerMatched` and `onFaceStateChange` wrapped in stable `useCallback` refs
   - "Retry Camera" button now calls `retryCamera` instead of `startCamera`

---

## Unchanged Files

| File | Function | Modified? |
|------|----------|-----------|
| `src/context/HardwareContext.tsx` | Sessions, RFID, Scale, Analyzer, Print | ❌ NOT CHANGED |
| `src/pages/collection/CollectionWorkspace.tsx` | Main workspace grid | ❌ NOT CHANGED |
| `src/components/workspace/CustomerDossierCard.tsx` | Farmer profile display | ❌ NOT CHANGED |
| `src/components/workspace/MeasurementPanel.tsx` | FAT/SNF/CLR readings | ❌ NOT CHANGED |
| `src/components/workspace/TransactionSummaryPanel.tsx` | Rate calculation, Save Intake | ❌ NOT CHANGED |
| `src/components/workspace/RecentIntakeTable.tsx` | Shift journal | ❌ NOT CHANGED |
| `src/components/workspace/SaveTransactionButton.tsx` | Save/submit | ❌ NOT CHANGED |
| `src/face-ai/yunet-detector.ts` | YuNet ONNX detection | ❌ NOT CHANGED |
| `src/face-ai/sface-embedder.ts` | SFace INT8 embedding | ❌ NOT CHANGED |
| `src/face-ai/matcher.ts` | Cosine similarity matching | ❌ NOT CHANGED |
| `src/face-ai/preprocessor.ts` | Frame tensor / face crop | ❌ NOT CHANGED |
| `src/face-ai/manifest.ts` | Model file paths | ❌ NOT CHANGED |
| `src/drivers/RfidReaderDriver.ts` | RFID hardware | ❌ NOT CHANGED |
| `src/drivers/ScaleDriver.ts` | Weighing scale | ❌ NOT CHANGED |
| `src/drivers/MilkAnalyzerDriver.ts` | FAT/SNF analyzer | ❌ NOT CHANGED |
| `src/drivers/ThermalPrinterDriver.ts` | Receipt printer | ❌ NOT CHANGED |
| `src/drivers/VoiceAnnouncerDriver.ts` | Audio announcements | ❌ NOT CHANGED |
| `src/api/client.ts` | Backend API client | ❌ NOT CHANGED |
| `src/services/local-storage.ts` | Offline queue | ❌ NOT CHANGED |
| `src/types/index.ts` | Type definitions | ❌ NOT CHANGED |
| `src/main.tsx` | App entry | ❌ NOT CHANGED |
| `src/App.tsx` | Router/providers | ❌ NOT CHANGED |

---

## Public API Compatibility

### `useCamera` Return Type (Pre-Fix vs Post-Fix)

| Property | Pre-Fix | Post-Fix | Breaking? |
|----------|---------|----------|-----------|
| `videoRef` | ✅ | ✅ | No |
| `isCameraActive` | ✅ | ✅ | No |
| `status` | ✅ | ✅ | No |
| `errorMessage` | ✅ | ✅ | No |
| `boundingBox` | ✅ | ✅ | No |
| `matchedCustomer` | ✅ | ✅ | No |
| `confidenceScore` | ✅ | ✅ | No |
| `latencyMs` | ✅ | ✅ | No |
| `modelsReady` | ✅ | ✅ | No |
| `startCamera` | ✅ | ✅ | No |
| `stopCamera` | ✅ | ✅ | No |
| `retryCamera` | ❌ | ✅ **NEW** | No (additive) |
| `resetMatch` | ✅ | ✅ | No |

The only change is the addition of `retryCamera` — a new, additive export. No existing consumers are broken.

---

## Feature Regression Matrix

| Feature | Pre-Fix Working? | Affected by Fix? | Post-Fix Status |
|---------|-----------------|------------------|-----------------|
| Customer face identification | ⚠️ BLOCKED (camera broken) | Camera fix enables it | ✅ RESTORED |
| RFID card identification | ✅ | No | ✅ UNCHANGED |
| Manual farmer code lookup | ✅ | No | ✅ UNCHANGED |
| Manual directory search (F2) | ✅ | No | ✅ UNCHANGED |
| Voice announcements | ✅ | No | ✅ UNCHANGED |
| Cow/Buffalo milk category | ✅ | No | ✅ UNCHANGED |
| Scale connection | ✅ | No | ✅ UNCHANGED |
| Milk analyzer (FAT/SNF/CLR) | ✅ | No | ✅ UNCHANGED |
| Rate calculation | ✅ | No | ✅ UNCHANGED |
| Save Intake / Record Transaction | ✅ | No | ✅ UNCHANGED |
| Active shift session | ✅ | No | ✅ UNCHANGED |
| Shift journal (RecentIntakeTable) | ✅ | No | ✅ UNCHANGED |
| Thermal printer | ✅ | No | ✅ UNCHANGED |
| Offline queue | ✅ | No | ✅ UNCHANGED |
| Sync functionality | ✅ | No | ✅ UNCHANGED |
| Supervisor fallback (F2) | ✅ | No | ✅ UNCHANGED |
| Identity conflict detection | ✅ | No | ✅ UNCHANGED |

---

## Conclusion

The camera fix is a **targeted, non-breaking correction** to the camera lifecycle only. All other collection features remain fully operational. No production threshold, biometric model, financial logic, session management, or hardware driver was modified.
