# DFarm Roadmap Phase 08 — Session & Device Verification Report

**Document Reference:** `DFARM-ROADMAP-PHASE-08-SESSION-DEVICE-VERIFICATION`  
**Phase:** Roadmap Phase 08 — Collection App & Kiosk Operational Integration  
**Date:** November 18, 2026  
**Status:** VERIFIED & CERTIFIED  

---

## 1. Executive Summary

This verification report confirms the operational integration between the Collection App (`apps/dfarm-collection-app`), the active shift session lifecycle, and central hardware device allocation.

In DFarm architecture:
- **Super Admin** allocates hardware inventory from `central_hardware_inventory` to registered Dairies (`dairy_id`).
- **Dairy Admin** manages operational center configurations, kiosk counters, and shift session lifecycle (opening, closing, audit).
- **Collection App** authenticates the operator, discovers the active session, validates center and counter mapping, and operates within authorized session boundaries.

---

## 2. Operator Authentication & Dairy Scoping

### 2.1 Identity Authority
The Collection App uses verified JWT tokens issued by `/api/v1/auth/operator/otp/verify`.
- The token payload strictly includes `userId`, `organizationId` (dairy tenant UUID), `centerId`, `role: 'COLLECTION_OPERATOR'`, and `actorType: 'STAFF'`.
- All network operations inject `Authorization: Bearer <token>` and `X-Dairy-Id: <organizationId>`.
- The backend independently validates tenant authority from `req.user.organizationId`, ensuring operators cannot access or submit data to another Dairy's database.

---

## 3. Shift Session Lifecycle & Discovery

### 3.1 Active Session Discovery Contract
- **Endpoint**: `GET /api/v1/collections/sessions/active?centerId=...&deviceId=...`
- **Behavior**:
  - Validates that the active session belongs to the caller's authorized Dairy (`organizationId`).
  - If no open session exists, returns 404 with `Active session not found for caller organization`.
  - When an active session is returned, the Collection App locks its state to `{ id, sessionCode, shift, businessDate, status: 'OPEN' }`.

### 3.2 Session Rehydration
- On page reload or network recovery, `HardwareContext.tsx` invokes `refreshSession()`.
- The frontend re-queries `GET /api/v1/collections/sessions/active` and updates `activeSession`.
- If the session was closed remotely by Dairy Admin, the status reflects `'CLOSED'`, which immediately locks the intake submission button (`TransactionSummaryPanel.tsx`).

### 3.3 Session Closure & Conflict Protection
- Once a session is closed (`POST /api/v1/collections/sessions/:id/close`), any subsequent intake requests return HTTP 409 Conflict (`SESSION_CLOSED`).
- Kiosks cannot submit transactions against closed shifts, protecting financial closing integrity.

---

## 4. Hardware Allocation & Device Mapping

### 4.1 Central Inventory Scoping
- Collection App queries `GET /api/v1/devices`.
- The backend filters hardware allocated to the caller's Dairy from `central_hardware_inventory`.
- Hardware belonging to other Dairies or unallocated hardware is excluded.

### 4.2 Counter Mapping & Calibration Tracking
- Kiosks are assigned to centers and counters via `PUT /api/v1/devices/:id/mapping`.
- Device calibration records (`POST /api/v1/devices/:id/calibration`) preserve calibration certificate numbers and due dates.
- In `HardwareContext.tsx`, devices telemetry reflects live driver connections:
  - Digital Scale (`ScaleDriver` via Web Serial API).
  - Ultrasonic Milk Analyzer (`MilkAnalyzerDriver` via Web Serial API).
  - RFID Reader (`RfidReaderDriver` via HID Keyboard-Wedge / Web Serial).

---

## 5. Automated Verification Evidence

The session and device contracts are verified in `services/backend/tests/collection-kiosk-production.test.js`:
- **Test 1**: Kiosk opens new shift session via `POST /api/v1/collections/sessions/open` (HTTP 201).
- **Test 2**: Kiosk retrieves active shift session via `GET /api/v1/collections/sessions/active` (HTTP 200).
- **Test 3**: Cross-dairy session query blocked with HTTP 404/403.
- **Test 14**: Kiosk reconciles and closes session via `POST /api/v1/collections/sessions/:id/close` (HTTP 200).
- **Test 15**: Intake against closed session is rejected with HTTP 409 (`SESSION_CLOSED`).
- **Test 18**: Cross-tenant device allocation isolation enforced.
- **Test 19**: Hardware calibration certificate verification.
