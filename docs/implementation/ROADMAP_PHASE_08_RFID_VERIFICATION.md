# DFarm Roadmap Phase 08 — RFID Identification Verification Report

**Document Reference:** `DFARM-ROADMAP-PHASE-08-RFID-VERIFICATION`  
**Phase:** Roadmap Phase 08 — Collection App & Kiosk Operational Integration  
**Date:** November 18, 2026  
**Status:** VERIFIED & CERTIFIED  

---

## 1. Executive Summary

This document verifies the hardware driver, security controls, and tenant boundaries for RFID identification in `apps/dfarm-collection-app` and supporting backend routes in `services/backend`.

RFID identification in DFarm serves as a high-speed contact identification mechanism at collection kiosks, operating alongside facial recognition and manual search fallback.

---

## 2. Hardware Driver & Keyboard-Wedge Protocol

### 2.1 Supported Physical Interfaces
- **HID Keyboard-Wedge:** Standard USB RFID card readers (e.g., Syris, Pegasus, ACS ACR122U wedge mode) that emulate high-speed keyboard input terminated by an `Enter` keystroke.
- **Web Serial Interface:** Direct COM port communication via Web Serial API (`RfidReaderDriver.connectSerial` @ 9600 baud, 8N1).

### 2.2 Human Typing vs. Hardware Scan Discrimination
In `RfidReaderDriver.ts`:
- The driver measures the inter-character delay `delta = now - lastKeyTimestamp`.
- If `delta > 60ms`, the key buffer is immediately discarded as manual human typing.
- Only rapid bursts (<60ms per character) of 4 to 32 alphanumeric characters ending in `Enter` trigger `emitScan()`.
- Prevents accidental keystrokes from being processed as card scans.

---

## 3. Authenticated RFID Lookup Contract

### 3.1 Direct Backend Lookup Endpoint
- In Phase 08, the client-side `.find()` over `customersApi.list()` was eliminated.
- The Collection App now calls `GET /api/v1/rfid/lookup/:uid` directly via `customersApi.getByRfid(cardUid)`.

### 3.2 Security & Tenant Controls
- **Authentication Required:** Protected by `authenticate` middleware. Unauthenticated requests return HTTP 401 Unauthorized.
- **Tenant Scope Enforcement:** Resolves tenant database strictly from `req.user.organizationId` (JWT). Cross-tenant queries return HTTP 403 Forbidden.
- **Rate Limiting:** Enforces `rfidLookupLimiter` (120 req/minute per IP) to prevent card enumeration attacks.
- **Minimal Projection:** Returns strictly non-biometric, non-banking data:
  ```json
  {
    "id": "customer-uuid",
    "farmerCode": "F-101",
    "fullName": "Pandurang Patil",
    "status": "ACTIVE",
    "defaultMilkType": "COW",
    "organizationId": "dairy-uuid",
    "centerId": "center-uuid",
    "canDeliver": true
  }
  ```

---

## 4. Face/RFID Contradictory Conflict Handling

When a farmer approaches the counter:
1. If the Camera matches Farmer A while an RFID scan matches Farmer B:
2. `HardwareContext.tsx` detects the mismatch (`hasIdentityConflict: true`).
3. `CollectionWorkspace.tsx` displays an alert:
   > **IDENTIFICATION CONFLICT:** Camera matched Farmer A (C-101) but RFID card belongs to Farmer B (C-205). Automated intake blocked.
4. The active customer state is cleared (`activeCustomer = null`), preventing submission.
5. The operator must invoke the supervisor manual fallback modal (`CustomerLookupModal.tsx`) to confirm identity.

---

## 5. Automated Verification Evidence

Verified in automated test suites:
- `apps/dfarm-collection-app/src/test/hardware-drivers.test.ts`:
  - Rapid keydown burst emits valid `RfidScanEvent`.
  - Slow human typing (>60ms) is discarded.
  - Alphanumeric UID normalization (uppercase hex).
- `services/backend/tests/collection-kiosk-production.test.js`:
  - **Test 9**: Authenticated RFID lookup returns minimal non-biometric projection.
  - **Test 10**: RFID card assigned to another dairy returns HTTP 404/403.
  - **Test 11**: Duplicate RFID assignment caught by PostgreSQL unique constraint error 23505.
- `services/backend/tests/roadmap-phase-07-dairy-admin.test.js`:
  - **Test 1**: RFID lookup without auth returns HTTP 401 Unauthorized.
  - **Test 2**: Cross-tenant RFID lookup returns HTTP 403 Forbidden.
  - **Test 3**: RFID minimal projection verified.
  - **Test 4**: Duplicate assignment conflict caught with HTTP 409 Conflict.
