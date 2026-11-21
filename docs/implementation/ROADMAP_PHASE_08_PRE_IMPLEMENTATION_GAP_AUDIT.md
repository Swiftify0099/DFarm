# DFarm Roadmap Phase 08 — Pre-Implementation Gap Audit

**Document Reference:** `DFARM-ROADMAP-PHASE-08-PRE-IMPLEMENTATION-GAP-AUDIT`  
**Phase:** Roadmap Phase 08 — Collection App & Kiosk Operational Integration  
**Date:** November 18, 2026  
**Status:** AUDIT COMPLETE  
**Target Applications:** `apps/dfarm-collection-app`, `services/backend`, and tenant PostgreSQL databases  

---

## 1. Executive Summary

This document establishes the authoritative pre-implementation audit baseline for **DFarm Roadmap Phase 08: Collection App & Kiosk Operational Integration**. It inspects the completed Roadmap Phases 01–07, historical Prompt 04 implementations, the React-based Collection App (`apps/dfarm-collection-app`), and supporting backend APIs in `services/backend`.

Every capability required by Phase 08 is systematically audited and classified into standard operational categories, detailing existing source files, database tables, domain entities, gaps, required modifications, and reuse decisions.

---

## 2. Classification Schema

- **COMPLETE AND VERIFIED**: Implemented, adheres to architecture and security requirements, and verified with passing automated tests.
- **IMPLEMENTED BUT NOT VERIFIED**: Code exists but lacks complete automated testing or edge-case validation.
- **PARTIALLY IMPLEMENTED**: Code exists but has integration gaps or missing security boundaries.
- **MOCK/HARDCODED**: Code contains synthetic fallbacks, mock fixtures in production paths, or hardcoded values.
- **MISSING**: Feature or endpoint has not yet been built.
- **SECURITY DEFECT**: Implementation violates tenant boundaries, exposes PII/biometrics, or allows unauthorized bypass.
- **BLOCKED BY HARDWARE SPECIFICATION**: Physical hardware testing blocked by missing hardware device or documentation.
- **BLOCKED BY PROVIDER/BROWSER CONFIGURATION**: Feature requires browser APIs (e.g. WebSerial, WebUSB) or HTTPS contexts.
- **PENDING OWNER DECISION**: Requires project owner commercial or operational sign-off.

---

## 3. Detailed Module-by-Module Gap Analysis

### 3.1 Module A: Operator Identity, Counter & Session Integration

| Feature / Contract | Status | Existing Files / Tables | Gap / Defect Identified | Action Required |
|---|---|---|---|---|
| Operator Authentication & Role Verification | **COMPLETE AND VERIFIED** | `AuthContext.tsx`, `auth.routes.ts`, `users` table | Operator JWT carries `organizationId`, `userId`, `role: 'COLLECTION_OPERATOR'`. Verified in Phase 02. | Reuse without modification. |
| Active Session Discovery (`GET /api/v1/collections/sessions/active`) | **COMPLETE AND VERIFIED** | `collections.routes.ts`, `kiosk_shift_sessions` table | Returns active shift session code, center ID, device identifier, and shift status. | Reuse existing route. Ensure frontend requests match operator token dairy context. |
| Session Rehydration on Reload | **PARTIALLY IMPLEMENTED** | `HardwareContext.tsx`, `sessionsApi.getActiveSession()` | Stored session token reloads session, but does not re-verify device counter allocation against backend device registry. | Add device/counter allocation check on rehydration. |
| Shift Open / Close Authorization | **COMPLETE AND VERIFIED** | `collections.routes.ts`, `ShiftSessionUseCases.ts` | Allows opening/closing sessions by authorized operator. Traps closed session conflicts. | Reuse existing contracts. |

### 3.2 Module B: Real Camera & YuNet/SFace Biometric Identification

| Feature / Contract | Status | Existing Files / Tables | Gap / Defect Identified | Action Required |
|---|---|---|---|---|
| Camera Stream Lifecycle (getUserMedia) | **COMPLETE AND VERIFIED** | `useCamera.ts`, `CustomerIdentityPanel.tsx` | Handles start/stop, camera permission denial (`NotAllowedError`), canvas landmark overlay rendering, and component unmount cleanup. | Reuse without modification. |
| ONNX Web YuNet Face Detection | **MOCK/HARDCODED** | `yunet-detector.ts`, `face_detection_yunet_2023mar.onnx` | When ONNX session fails or is uninitialized in browser, `detect()` fell back to synthetic bounding boxes when frame has luminance. | Remove synthetic bounding box fallback in production path; return empty array or throw error. |
| ONNX Web SFace INT8 Feature Embedding | **MOCK/HARDCODED** | `sface-embedder.ts`, `face_recognition_sface_2021dec_int8.onnx` | On inference exception, fell back to `CANONICAL_SFACE_128D_FIXTURE` with landmark micro-variations. | Remove synthetic fixture vector fallback in production path; fail with `MODEL_UNAVAILABLE`. |
| Dairy-Scoped Biometric Candidate Matching | **COMPLETE AND VERIFIED** | `matcher.ts` (`DairyFaceMatcher.match`), `farmer_biometrics` | Strictly filters templates by `dairyId === activeDairyId` and `status === 'ACTIVE'`. Evaluates cosine similarity with threshold 0.363. | Reuse existing matcher; isolate test fixtures strictly to unit tests. |
| Biometric Template Synchronization | **COMPLETE AND VERIFIED** | `identity.routes.ts` (`GET /identity/face/templates`) | Returns decrypted 128-dim vectors strictly scoped to caller's dairy tenant. Zero plain-text biometric vectors in ordinary customer lists. | Reuse existing endpoint. |

### 3.3 Module C: Real RFID Identification

| Feature / Contract | Status | Existing Files / Tables | Gap / Defect Identified | Action Required |
|---|---|---|---|---|
| Keyboard-Wedge HID Reader Driver | **COMPLETE AND VERIFIED** | `RfidReaderDriver.ts` | Inter-character timing heuristic (<60ms) filters out manual keyboard typing; uppercase hex validation. | Reuse without modification. |
| Web Serial RFID Reader Support | **PROTOCOL UNIT TESTED** | `RfidReaderDriver.ts` (`connectSerial`) | Implemented via Web Serial API (9600 baud, 8N1). Verified via protocol unit tests; real USB hardware connection requires physical scanner. | Classify as PROTOCOL UNIT TESTED / BROWSER CONNECTION TESTED. |
| Authenticated RFID Lookup | **SECURITY DEFECT** in Frontend | `apps/dfarm-collection-app/src/api/client.ts` (`customersApi.getByRfid`) | Frontend was calling `customersApi.list()` and filtering client-side instead of calling backend `GET /api/v1/rfid/lookup/:uid`. | Update `getByRfid` to call authoritative, authenticated backend route `GET /api/v1/rfid/lookup/:uid`. |
| Backend Tenant Authority on RFID Lookup | **COMPLETE AND VERIFIED** | `rfid.routes.ts` (`handleRfidLookup`) | Authenticated via JWT `req.user.organizationId`; rejects cross-tenant requests with HTTP 403; rate-limited; returns minimal projection without biometrics or bank accounts. | Reuse existing backend route. |
| Face/RFID Contradictory Identity Conflict | **PARTIALLY IMPLEMENTED** | `CollectionWorkspace.tsx`, `HardwareContext.tsx` | App selects active customer via `manualCustomer || faceState.matchedCustomer || rfidState.matchedCustomer` without explicitly detecting if Face matches Farmer A while RFID matches Farmer B. | Add explicit conflict detection state (`FACE_RFID_CONFLICT`), block submission, and require supervisor review. |

### 3.4 Module D: Operator / Supervisor Manual Fallback

| Feature / Contract | Status | Existing Files / Tables | Gap / Defect Identified | Action Required |
|---|---|---|---|---|
| Customer Directory Manual Search | **COMPLETE AND VERIFIED** | `CustomerLookupModal.tsx`, `customers.routes.ts` | Allows operator to search by farmer code or phone within tenant dairy. | Reuse existing modal. |
| Supervisor Privilege & Audit Logging | **PARTIALLY IMPLEMENTED** | `audit.routes.ts`, `CollectionWorkspace.tsx` | Manual selection sets `identificationMethod: 'MANUAL_SEARCH'`, but does not log a supervisor authorization audit record when automated match fails. | Wire supervisor authentication check and audit event emission (`MANUAL_IDENTIFICATION_FALLBACK`). |

### 3.5 Module E: Central Device Allocation & Counter Mapping

| Feature / Contract | Status | Existing Files / Tables | Gap / Defect Identified | Action Required |
|---|---|---|---|---|
| Scoped Device Discovery (`GET /api/v1/devices`) | **COMPLETE AND VERIFIED** | `devices.routes.ts`, `central_hardware_inventory` | Filters central hardware registry by tenant `dairy_id`. | Connect Collection App to genuine backend device endpoint instead of hardcoded list in `HardwareContext.tsx`. |
| Counter & Center Mapping (`PUT /api/v1/devices/:id/mapping`) | **COMPLETE AND VERIFIED** | `devices.routes.ts` | Updates center and counter mapping in tenant database. | Reuse existing endpoint. |
| Device Calibration Status Check | **COMPLETE AND VERIFIED** | `devices.routes.ts` (`POST /api/v1/devices/:id/calibration`) | Stores and checks calibration certificate number and next due date. | Check calibration status during device initialization; alert operator if calibration is overdue. |

### 3.6 Module F: Real Weighing Scale Integration

| Feature / Contract | Status | Existing Files / Tables | Gap / Defect Identified | Action Required |
|---|---|---|---|---|
| Web Serial Scale Communication | **PROTOCOL UNIT TESTED** | `ScaleDriver.ts` | Web Serial driver with 4800 baud default, buffer management, and connection lifecycle. | Maintain clean driver decoupling; classify hardware readiness honestly. |
| Scale Protocol Parsing (Essae, Phoenix, Avery) | **COMPLETE AND VERIFIED** | `ScaleDriver.ts` (`parseFrame`) | Parses standard ASCII continuous streams (`ST,GS,+0012.50,KG`), compact format (`=0012.50(kg)`), and numeric formats. | Unit tests pass across all formats. Reuse without modification. |
| Stability Lock & Zero Weight Rejection | **COMPLETE AND VERIFIED** | `TransactionSummaryPanel.tsx`, `ScaleDriver.ts` | Blocks submission when `!measurements.scaleStable` or `weightLiters <= 0`. | Enforce in UI and backend validation. |

### 3.7 Module G: Real FAT/SNF Milk Analyzer Integration

| Feature / Contract | Status | Existing Files / Tables | Gap / Defect Identified | Action Required |
|---|---|---|---|---|
| Web Serial Analyzer Communication | **PROTOCOL UNIT TESTED** | `MilkAnalyzerDriver.ts` | Web Serial driver with 19200 baud default, reading stream, and auto-disconnection. | Maintain driver separation; classify as PROTOCOL UNIT TESTED. |
| Analyzer Frame Parsing (MilkoTester, Lactoscan) | **COMPLETE AND VERIFIED** | `MilkAnalyzerDriver.ts` (`parseFrame`) | Parses key-value ASCII (`FAT=04.20 SNF=08.70 CLR=29.50`) and compact letter frames (`F04.20 S08.70 C29.50`). | Unit tests pass across all protocols. Reuse without modification. |
| Biological Boundary Validation | **COMPLETE AND VERIFIED** | `MilkAnalyzerDriver.ts`, `FatPercentage.ts`, `SnfPercentage.ts` | Validates FAT [2.0% - 15.0%] and SNF [6.0% - 12.0%]. | Revalidated in frontend and backend domain entities. |
| Stale Sample Isolation Across Farmers | **PARTIALLY IMPLEMENTED** | `HardwareContext.tsx` (`resetIntakeCycle`) | Analyzer reading was retained if operator switched farmers before new sample was aspirated. | Add explicit `clearLastReading()` on customer identity change. |

### 3.8 Module H: Authoritative Milk Intake & Ledger Atomicity

| Feature / Contract | Status | Existing Files / Tables | Gap / Defect Identified | Action Required |
|---|---|---|---|---|
| Authoritative Intake Endpoint (`POST /collections/intake`) | **COMPLETE AND VERIFIED** | `collections.routes.ts`, `MilkIntakeUseCases.ts` | Validates customer eligibility (`canDeliver`), active shift session, calculates rate from rate chart, persists transaction to `milk_collections`. | Reuse existing endpoint. |
| Authoritative Ledger Credit Posting | **COMPLETE AND VERIFIED** | `PostgresLedgerRepository.ts`, `customer_ledger_accounts`, `ledger_transactions` | Posts atomic `MILK_COLLECTION_CREDIT` to `customer_ledger_accounts` and `ledger_transactions` with running balance update. | Reuse existing repository. |
| Frontend Rate Preview vs Backend Authoritative Rate | **PARTIALLY IMPLEMENTED** | `client.ts` (`ratesApi`), `TransactionSummaryPanel.tsx` | Frontend uses static formula for live calculation preview. | Maintain formula as local preview, but ensure transaction receipt and local DB store authoritative values returned by server response. |
| Customer Delivery Invariant Validation | **COMPLETE AND VERIFIED** | `Customer.ts` (`validateCanDeliver`), `customers.routes.ts` | Soft-deleted (`deleted_at IS NOT NULL`) and non-approved customers are blocked from delivering milk. | Re-enforced at submission time. |

### 3.9 Module I: Offline Intake Queue & Automatic Cloud Sync

| Feature / Contract | Status | Existing Files / Tables | Gap / Defect Identified | Action Required |
|---|---|---|---|---|
| IndexedDB Queue Durability | **COMPLETE AND VERIFIED** | `local-storage.ts`, `IndexedDB` (`dfarm_collection_local_db`) | Offline transactions stored in `offline_queue` object store with unique event IDs and stable idempotency keys. Survives tab close and reload. | Reuse existing local DB engine. |
| Batch Synchronization Endpoint (`POST /api/v1/sync/push`) | **COMPLETE AND VERIFIED** | `sync.routes.ts`, `TelemetryAndSyncUseCases.ts` | Processes array of queued weighments; calls `ProcessMilkIntakeUseCase` for each; returns individual item statuses. | Reuse existing endpoint. |
| Queue Cleanup Only After Confirmed Sync | **COMPLETE AND VERIFIED** | `OfflineQueueView.tsx` | Iterates `syncResult.items`; calls `removeQueueItem(eventId)` strictly for items where `resItem.success === true`. | Reuse without modification. |
| Closed Session Conflict Handling | **COMPLETE AND VERIFIED** | `MilkIntakeUseCases.ts` (`SessionClosedError`) | If session was closed during offline period, backend returns `SESSION_CLOSED` (409 Conflict); item remains in queue for reconciliation. | Reuse existing conflict handling. |

### 3.10 Module J: Device Connection & Browser Compatibility

| Feature / Contract | Status | Existing Files / Tables | Gap / Defect Identified | Action Required |
|---|---|---|---|---|
| Web Serial Browser Compatibility Check | **COMPLETE AND VERIFIED** | `ScaleDriver.ts`, `MilkAnalyzerDriver.ts`, `RfidReaderDriver.ts` | Checks `'serial' in navigator`; emits descriptive error on unsupported browsers (e.g. Firefox, Safari). | Reuse without modification. |
| Real Telemetry Status Indicators | **PARTIALLY IMPLEMENTED** | `HardwareContext.tsx` (`refreshDevices`) | Returns hardcoded dummy devices instead of reading actual driver connection status and tenant device allocation. | Update `refreshDevices` to derive status from live drivers (`scaleDriver`, `milkAnalyzerDriver`, `rfidReaderDriver`). |

### 3.11 Module K: Thermal Receipt Printing (Prompt 04 Preservation)

| Feature / Contract | Status | Existing Files / Tables | Gap / Defect Identified | Action Required |
|---|---|---|---|---|
| ESC/POS 2-inch Thermal Voucher Generation | **COMPLETE AND VERIFIED** | `ThermalPrinterDriver.ts` | Generates ESC/POS byte buffer with dairy header, farmer name/code, date/time, volume, FAT, SNF, rate, and total amount. | Preserve completely. Zero UI or driver redesign. |
| Web Serial / Browser Print Fallback | **COMPLETE AND VERIFIED** | `ThermalPrinterDriver.ts` (`printReceipt`) | Attempts Web Serial ESC/POS print; falls back gracefully to `window.print()` if serial printer not attached. | Preserve without modification. |

---

## 4. Summary of Gaps to Close

1. **Remove Synthetic Biometric Fallbacks**:
   - `yunet-detector.ts`: Remove synthetic bounding box fallback when ONNX fails.
   - `sface-embedder.ts`: Remove synthetic fixture vector fallback when ONNX fails.
2. **Direct Authenticated RFID Lookup**:
   - `apps/dfarm-collection-app/src/api/client.ts`: Update `customersApi.getByRfid` to call `GET /api/v1/rfid/lookup/:uid` instead of downloading the entire customer directory.
3. **Face/RFID Contradictory Conflict State**:
   - `CollectionWorkspace.tsx` & `HardwareContext.tsx`: Detect mismatch when Face identifies Customer A while RFID identifies Customer B; set `FACE_RFID_CONFLICT` and block submission until supervisor resolution.
4. **Stale Measurement Cleanup**:
   - `HardwareContext.tsx`: Clear last analyzer reading when active customer changes.
5. **Real Device Telemetry Integration**:
   - `HardwareContext.tsx`: Query backend device registry and combine with live driver states.
6. **Authoritative Ledger & Sync Integration**:
   - Verify `collection-kiosk-production.test.js` passes 24/24 tests and monorepo regression remains 100% clean.
