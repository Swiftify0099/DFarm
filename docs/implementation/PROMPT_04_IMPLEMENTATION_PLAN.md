# DFARM — PROMPT 04 IMPLEMENTATION PLAN
## COLLECTION APP / KIOSK COUNTER PRODUCTION READINESS, REAL FACE + RFID IDENTIFICATION, OFFLINE INTAKE SYNC, HARDWARE DRIVERS & THERMAL RECEIPT PRINTING

**Document Reference:** `DFARM-PLAN-PROMPT-04`  
**Execution Phase:** Prompt 04  
**Status:** APPROVED FOR EXECUTION  
**Application Target:** `apps/dfarm-collection-app`, `services/backend`  

---

## 1. ARCHITECTURE BLUEPRINT & MODULE OVERVIEW

```text
┌────────────────────────────────────────────────────────────────────────┐
│             apps/dfarm-collection-app (React 19 + TypeScript)          │
├────────────────────────────────────────────────────────────────────────┤
│ 1. REAL COLLECTION SESSION INTEGRATION (Module A)                      │
│    - Bind to backend: GET /collections/sessions/active                 │
│    - Open session: POST /collections/sessions/open                     │
│    - Close session: POST /collections/sessions/:sessionId/close        │
├────────────────────────────────────────────────────────────────────────┤
│ 2. REAL FARMER IDENTIFICATION (Module B)                               │
│    - Face AI: HTML5 Camera -> YuNet ONNX (Detect) -> SFace INT8 (Embed)│
│    - RFID: Keyboard-Wedge Listener (<50ms buffer) + Web Serial         │
│    - Dairy-Scoped Isolation: Only active Dairy's enrolled templates   │
│    - Unknown Handling: UNKNOWN_PERSON flag + Supervisor Manual Fallback│
├────────────────────────────────────────────────────────────────────────┤
│ 3. HARDWARE INSTRUMENT INTEGRATION (Modules C, D, F)                   │
│    - Digital Scale Driver: Web Serial 4800 8N1 ('ST,GS,+0012.50,KG')   │
│    - Milk Analyzer Driver: Web Serial 19200 8N1 ('FAT=4.2 SNF=8.7')    │
│    - Thermal Printer Driver: ESC/POS byte generator + 58/80mm ticket  │
├────────────────────────────────────────────────────────────────────────┤
│ 4. OFFLINE QUEUE & IDEMPOTENT SYNC (Module E)                          │
│    - IndexedDB Datastore: dfarm_collection_local_db                    │
│    - Sync Engine: POST /api/v1/sync/push (or /sync/transactions)       │
│    - Idempotency Key: Unique UUIDv4 created once at capture            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. DETAILED MODULE EXECUTION PHASES

### Phase 1: Real Collection Session Integration (Module A)
1. Update `apps/dfarm-collection-app/src/api/client.ts` session methods to ensure strict alignment with Prompt 03 backend endpoints:
   - `sessionsApi.getActiveSession(deviceId)` -> `GET /api/v1/collections/sessions/active?deviceId=...`
   - `sessionsApi.openSession(params)` -> `POST /api/v1/collections/sessions/open`
   - `sessionsApi.closeSession(sessionCode)` -> `POST /api/v1/collections/sessions/:sessionCode/close`
2. Update `HardwareContext.tsx` and `SessionManagement.tsx` to handle backend session state:
   - `OPEN`: Intake active and permitted.
   - `CLOSED` / `NONE`: Lock weighment submission button; display banner requiring shift opening.

### Phase 2: Real Farmer Identification (Face + RFID + Authorized Fallback) (Module B)
1. Verify `useCamera.ts` frame processing loop:
   - Load YuNet & SFace INT8 ONNX models from `/models/`.
   - Calculate 128-dim Float32 embedding on detected face.
   - Match against `enrolledTemplates` filtered strictly to `t.dairyId === activeDairyId`.
   - Announce matched farmer's name via `voiceAnnouncer`.
2. Implement `RfidReaderDriver.ts`:
   - Global keyboard-wedge listener: buffers rapid keydown events (<50ms between characters ending in `Enter`), preventing human keystrokes from misidentifying as RFID.
   - Web Serial RFID reader fallback (9600 baud, 8N1) for dedicated serial RFID readers.
   - Lookup farmer by card UID via `customersApi.getByRfid(cardUid)`.
3. Authorized Fallback:
   - Manual search by farmer code / mobile number is tagged as `identificationMethod: 'MANUAL_SEARCH'` and logged for audit.

### Phase 3: Hardware Peripheral Drivers (Scale & Analyzer) (Modules C & D)
1. Implement `ScaleDriver.ts`:
   - Connect via Web Serial API (`COM5` / `/dev/ttyUSB2`, 4800 baud, 8N1).
   - Frame Parser: Regex matching `^(?:ST|US),GS,([+-]?\d+\.?\d*),(?:KG|kg)`.
   - Extract `weightLiters`, `scaleStable: ST === true`, `scaleConnected: true`.
   - Manual scale input toggle if hardware is disconnected, tagged with source `MANUAL`.
2. Implement `MilkAnalyzerDriver.ts`:
   - Connect via Web Serial API (`COM4` / `/dev/ttyUSB1`, 19200 baud, 8N1).
   - Frame Parser: Regex extracting `FAT`, `SNF`, `CLR`, `TEMP`.
   - Biological bounds validation: FAT 2.0% – 15.0%, SNF 6.0% – 12.0%.
   - Auto-population into `HardwareContext` measurements.

### Phase 4: Online Milk Intake & Double-Entry Financial Integration
1. Update `TransactionSummaryPanel.tsx` and `SaveTransactionButton.tsx`:
   - Lock submission unless customer identified, weight > 0, scale stable, and session OPEN.
   - Send `idempotencyKey: UUIDv4` to `POST /api/v1/collections/intake`.
   - Server returns authoritative applied rate per liter, gross total, and balanced ledger balance.
   - Trigger thermal receipt printing on success.

### Phase 5: Offline Intake Queue & Idempotent Synchronization (Module E)
1. Enhance `apps/dfarm-collection-app/src/services/local-storage.ts`:
   - Implement deterministic sync state: `QUEUED` -> `SYNCING` -> `SYNCED` | `FAILED`.
   - Store capture timestamp, client UUID, and operator ID.
2. Update `OfflineQueueView.tsx`:
   - Connect `handleSyncNow` to `POST /api/v1/sync/push`.
   - Send batch with `clientIntakeUuid` and `idempotencyKey`.
   - On server acceptance, mark item as `SYNCED` and remove from queue.
   - If session closed during offline window, mark for supervisor reconciliation.

### Phase 6: Thermal Receipt Printing (Module F)
1. Implement `ThermalPrinterDriver.ts`:
   - ESC/POS byte sequence builder:
     - `ESC @` (Initialize)
     - `ESC a 1` (Center align: Dairy Name, Center Name)
     - `ESC ! 0x08` (Emphasized text: Receipt Number, Date, Time)
     - Itemized table: Category, Weight (L), Fat %, SNF %, Rate/L, Amount (₹)
     - `ESC a 1` + `GS V 0` (Cut paper)
   - Browser print thermal ticket layout (formatted for 58mm / 80mm thermal roll widths).
   - Clean reprint support using identical transaction ID.

### Phase 7: Backend Route Aliases & Enhancements
1. Ensure `services/backend/src/presentation/routes/sync.routes.ts`:
   - Exposes both `POST /api/v1/sync/push` and `POST /api/v1/sync/transactions`.
2. Ensure `services/backend/src/presentation/routes/collections.routes.ts`:
   - Supports `/recent` transactions query.

### Phase 8: Verification & Documentation Deliverables
1. Run full test suite across monorepo (`@dfarm/backend`, `dfarm-collection-app`, `dfarm-dairy-admin`, `dfarm-super-admin`, `dfarm-customer-app`, `@dfarm/database`).
2. Write comprehensive Prompt 04 verification reports in `docs/implementation/`.

---

## 3. UI PRESERVATION COMMITMENT

- **Colors**: Saffron (`#FF6A00`), Cocoa Slate (`#211B18`), Cream (`#FFF5EE`).
- **Styling**: Claymorphism convex cards, pill badges, and inset inputs.
- **Layouts**: Preserve 12-column workspace grid (`CustomerIdentityPanel`, `CustomerDossierCard`, `TransactionSummaryPanel`, `MeasurementPanel`, `RecentIntakeTable`).
- **Zero Redesign**: Only functional wiring and driver integration.
