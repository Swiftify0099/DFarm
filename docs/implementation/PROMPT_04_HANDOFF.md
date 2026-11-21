# DFARM — PROMPT 04 HANDOFF
## OPERATIONAL HANDOFF FOR PROMPT 04: COLLECTION APP & KIOSK PRODUCTION READINESS

**Handoff Reference:** `DFARM-HANDOFF-PROMPT-04`  
**From:** Prompt 03 — Dairy Admin Production Readiness  
**To:** Prompt 04 — Collection App (Milk Collection Kiosk Counter) Production Readiness  
**Target Repository:** `c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init`  
**Primary App Surface:** `apps/dfarm-collection-app` + `services/backend`  

---

## 1. BASELINE ARCHITECTURAL STATE AFTER PROMPT 03

The DFarm platform has achieved full production readiness for:
1. **Control Plane & Tenant Database Provisioning (Prompt 01)**:
   - Central database `dfarm_central` manages dairy organizations, database mappings, and operator identities.
   - Separate physical PostgreSQL databases (`dfarm_tenant_<code_hash>`) operate independently per dairy.
   - `TenantDatabaseManager` routes queries reliably and safely.
2. **Super Admin Platform Operations (Prompt 02)**:
   - Geolocation polygon bounds, hardware inventory allocation, 2FA admin activation, and AMC subscription management with Razorpay are operational.
3. **Dairy Admin Operational Platform (Prompt 03)**:
   - Farmer applicant registration approval and structured rejection workflows are live.
   - Shift session opening, active querying, and closing are connected to isolated tenant databases.
   - Milk intake transaction endpoint `/api/v1/collections/intake` enforces customer approval, category authorization, and session open status.
   - Dynamic rate charts with matrix and formula pricing are live.
   - Double-entry subledger recording (`customer_ledger_entries`) is verified.
   - Farmer payouts are strictly decoupled from Razorpay and operate on clean accounting.
   - Monorepo test suite passes **198/198 tests (100%)**.

---

## 2. PREREQUISITES & SCOPE FOR PROMPT 04

Prompt 04 focuses on making `apps/dfarm-collection-app` (the browser-based React web milk collection kiosk counter) production-ready.

### 2.1 Prompt 04 Primary Objectives
1. **Kiosk Shift Session UI Integration**:
   - Connect the collection counter UI to `POST /api/v1/collections/sessions/open`, `GET /api/v1/collections/sessions/active`, and `POST /api/v1/collections/sessions/:sessionId/close`.
   - Support auto-recovery when a browser tab refreshes or kiosk loses connection.
2. **Customer Rapid Identification**:
   - Integrate 1:N local OpenCV SFace 128-dim biometric matching using cached active customer embeddings.
   - Support RFID card tap identification (`cards.uid`).
   - Support manual search fallback by farmer code or phone number.
3. **Hardware Weighing Scale & Milk Analyzer Protocols**:
   - RS232 / WebSerial / USB hardware communication for weighing scales (Tare, Gross, Net weight).
   - Milk Analyzer serial communication (FAT %, SNF %, Density/CLR, Added Water %).
   - Maintain strict separation: zero simulated sensor values in production mode, clean mock adapter in test/development mode.
4. **Offline Collection Queue & Sync Engine**:
   - Cache pending collection transactions in IndexedDB when internet connectivity drops.
   - Sync queued transactions via `POST /api/v1/sync/transactions` with idempotency keys upon network reconnection.
   - Zero duplicate milk collections on network jitter.
5. **Thermal Receipt Printing & Multilingual Audio Announcement**:
   - ESC/POS thermal receipt formatting for 58mm/80mm counter printers.
   - Audio announcement in local languages (Marathi, Hindi, English) announcing weighment and total amount.

---

## 3. COMPLETED REPOSITORIES & ENDPOINTS READY FOR PROMPT 04 CONSUMPTION

| Endpoint | Method | Expected Consumer in Prompt 04 | Contract Status |
|---|---|---|---|
| `/api/v1/collections/sessions/active` | `GET` | Kiosk startup & shift check | Ready & Verified |
| `/api/v1/collections/sessions/open` | `POST` | Operator opening morning/evening shift | Ready & Verified |
| `/api/v1/collections/sessions/:sessionId/close` | `POST` | Operator shift reconciliation & closing | Ready & Verified |
| `/api/v1/collections/intake` | `POST` | Milk collection weighment submission | Ready & Verified |
| `/api/v1/rate-charts` | `GET` | Kiosk offline rate chart pre-caching | Ready & Verified |
| `/api/v1/customers` | `GET` | Local kiosk customer biometric cache sync | Ready & Verified |
| `/api/v1/sync/transactions` | `POST` | Batch sync for offline-recorded weighments | Ready & Verified |

---

## 4. INVARIANTS TO MAINTAIN IN PROMPT 04

1. **Claymorphism UI Consistency**: Preserve existing visual styling, layout geometry, color variables (`#FF6A00`, `#211B18`, `#FFF5EE`), and responsive kiosk elements.
2. **Multi-Dairy Boundary**: The kiosk must pass its authenticated operator token and center/dairy headers; cross-dairy collection is strictly prohibited.
3. **Session Open Requirement**: No milk collection transaction can be recorded against a closed session (`SessionClosedError` -> 409).
4. **Farmer Authorization Guard**: Farmers with `PENDING_APPROVAL`, `SUSPENDED`, or mismatched `milkCategory` must be rejected before weighment submission.
5. **Idempotency Protection**: Every offline and online collection transaction must generate and send a unique `idempotencyKey` (UUIDv4) to prevent double counting.

---

## 5. DIRECTORY REFERENCES

- Backend collection routes: [`services/backend/src/presentation/routes/collections.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/collections.routes.ts)
- Backend sync routes: [`services/backend/src/presentation/routes/sync.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/sync.routes.ts)
- Milk Intake Use Cases: [`services/backend/src/application/use-cases/collections/MilkIntakeUseCases.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/collections/MilkIntakeUseCases.ts)
- Shift Session Use Cases: [`services/backend/src/application/use-cases/sessions/ShiftSessionUseCases.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/sessions/ShiftSessionUseCases.ts)
- Collection App source: [`apps/dfarm-collection-app/src/`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-collection-app/src/)
- Comprehensive Dairy Admin test suite: [`services/backend/tests/dairy-admin-production.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/dairy-admin-production.test.js)
