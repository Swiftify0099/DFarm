# STAGE 1 — HTTP 409 CONFLICT ERROR REPRODUCTION REPORT

**Reference:** DFARM-COLLECTION-MANUAL-ENTRY-409-FIX  
**Target:** `POST http://localhost:5175/api/v1/collections/transactions`  
**Execution Timestamp:** 2026-11-19T20:12:00+05:30  
**Environment:** Windows 11, Node.js v22.20.0, Vite Dev Server (port 5175), Express API Server (port 4000)

---

## 1. Executive Summary

When an operator in `apps/dfarm-collection-app` attempts to complete and save a manual milk collection transaction, the request `POST /api/v1/collections/transactions` fails with `HTTP 409 Conflict`. 

Through direct wire inspection, route tracing, and backend repository analysis, the failure was accurately reproduced and its exact response body captured:

```json
{
  "success": false,
  "error": {
    "code": "SESSION_CLOSED",
    "message": "Shift session 'session-current-001' is concluded. New transactions are rejected."
  }
}
```

Or when an auto-generated shift session code was submitted before database persistence:
```json
{
  "success": false,
  "error": {
    "code": "SESSION_CLOSED",
    "message": "Shift session 'SH-20261119-E-KIOS' is concluded. New transactions are rejected."
  }
}
```

---

## 2. Exact Network Request & Response Telemetry

### Request Details
- **Method:** `POST`
- **Request URL:** `http://localhost:5175/api/v1/collections/transactions`
- **Proxy Destination:** `http://localhost:4000/api/v1/collections/transactions`
- **Headers:**
  - `Content-Type`: `application/json`
  - `Authorization`: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
  - `X-Dairy-Id`: `00000000-0000-0000-0000-000000000001`
  - `X-Dairy-Tenant-Id`: `00000000-0000-0000-0000-000000000001`
  - `X-Request-Id`: `c908d61a-0075-4abf-82b9-e1083b582d8a`

### Request Payload
```json
{
  "sessionId": "session-current-001",
  "customerId": "923bd12d-a953-429c-b317-ea58ad79563c",
  "milkCategory": "COW",
  "weightLiters": 12.5,
  "fatPercentage": 4.2,
  "snfPercentage": 8.6,
  "clrDensity": 28.5,
  "identificationMethod": "FACE_YUNET_SFACE",
  "deviceId": "KIOSK_MAIN",
  "idempotencyKey": "TXN-1795099344158"
}
```

### Response Details
- **HTTP Status Code:** `409 Conflict`
- **Status Text:** `Conflict`
- **Response Headers:** `Content-Type: application/json; charset=utf-8`
- **Response Body:**
```json
{
  "success": false,
  "error": {
    "code": "SESSION_CLOSED",
    "message": "Shift session 'session-current-001' is concluded. New transactions are rejected."
  }
}
```

---

## 3. Operational Entity Context & Lineage

| Entity | Reference ID / Value | Verification Status |
| :--- | :--- | :--- |
| **Operator** | `00000000-0000-0000-0000-000000000011` (Sachin Patil Kiosk) | Authenticated via Mobile `+919822114477` |
| **Organization (Dairy)** | `00000000-0000-0000-0000-000000000001` (DFarm Platform Federation) | Resolved & Matches Header `X-Dairy-Id` |
| **Center** | `00000000-0000-0000-0000-000000000002` (Test Center, Kolhapur) | Primary Center |
| **Customer (Farmer)** | `923bd12d-a953-429c-b317-ea58ad79563c` (`F-101`, Balasaheb Patil) | Registered & Approved in Tenant DB |
| **Shift Session** | `session-current-001` (Fallback) / `fd3cbff1-acba-4e68-a867-c8294d66142c` | Failed persistence due to FK constraint |
| **Idempotency Key** | `TXN-1795099344158` | Generated per submit action |

---

## 4. Root Cause Summary for Reproduction

1. **Unsaved Shift Session in Tenant Database:** When the kiosk opens a shift session via `GetActiveShiftSessionUseCase`, `PostgresShiftSessionRepository.save` failed with foreign key violations (`organizations`, `dairy_centers`, and `users` missing in tenant operational DB). The failure was swallowed in non-production, leaving the tenant database table `kiosk_shift_sessions` empty.
2. **Frontend Validation Gap:** In `TransactionSummaryPanel.tsx`, `canSubmit` evaluated to `true` when `activeSession` was `null`, allowing submission with dummy fallback `'session-current-001'`.
3. **Session Verification Failure:** `ProcessMilkIntakeUseCase.execute` checked the database for `'session-current-001'`, found no open session in `kiosk_shift_sessions`, and threw `SessionClosedError`, returning `409 Conflict`.
