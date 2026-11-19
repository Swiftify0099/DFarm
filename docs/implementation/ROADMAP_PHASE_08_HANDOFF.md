# DFarm Roadmap Phase 08 — Architectural Handoff & Boundary Specification

**Document Reference:** `DFARM-ROADMAP-PHASE-08-HANDOFF`  
**Phase Transition:** Roadmap Phase 07 (Dairy Admin Operational Management) → Roadmap Phase 08 (Collection App & Kiosk Operational Integration)  
**Date:** November 18, 2026  
**Status:** APPROVED & CERTIFIED  

---

## 1. Executive Summary

This handoff specification defines the architectural boundaries, verified foundation prerequisites, technical contracts, and scope exclusions for the transition from **Roadmap Phase 07: Dairy Admin Operational Management** to **Roadmap Phase 08: Collection App & Kiosk Operational Integration**.

Phase 07 has established a fully verified, multi-tenant operational backbone with isolated PostgreSQL tenant databases, double-entry customer ledgers, live session tracking, biological rate chart preview engines, feed inventory control, and privacy-first reporting. Phase 08 builds upon these solid foundation endpoints to deliver physical collection counter operations within `apps/dfarm-collection-app`.

---

## 2. Prerequisites & Foundation Assets Established in Phase 07

Roadmap Phase 08 inherits the following fully tested and verified endpoints and domain contracts:

### 2.1 Customer Delivery Eligibility & Identification
- **`GET /api/v1/customers/:id/can-deliver`**: Evaluates whether a farmer is eligible to supply milk. Respects canonical statuses (`ACTIVE`, `APPROVED`), blocks delivery for soft-deleted (`deleted_at IS NOT NULL`) and suspended farmers.
- **`GET /api/v1/rfid/lookup/:uid?organizationId=...`**: Authenticated, rate-limited (`rfidLookupLimiter`) RFID lookup. Returns minimal non-biometric projection (`{ customerId, farmerId, fullName, phone, centerId, status, canDeliver }`).
- **PostgreSQL 23505 Duplicate Trap**: Concurrency-safe card assignment handler in `POST /api/v1/rfid/assign`.

### 2.2 Milk Valuation & Pure Calculation
- **`POST /api/v1/rate-charts/preview`**: Pure, side-effect-free calculation engine accepting `{ rateChartId, milkType, fat, snf, volume }`. Calculates total payable milk price in sub-millisecond time without creating database transactions or locks.

### 2.3 Hardware Registry & Counter Mapping
- **`GET /api/v1/devices`**: Scoped hardware listing reflecting only devices allocated to the tenant dairy organization.
- **`PUT /api/v1/devices/:id/mapping`**: Center and counter mapping for kiosks, analyzers, and scales.
- **`POST /api/v1/devices/:id/calibration`**: Audit log recording calibration certificate IDs and due dates.

### 2.4 Session Tracking & Shift Registers
- **`GET /api/v1/collection/sessions/active`**: Active collection shift monitoring.
- **`GET /api/v1/collection/register`**: Shift register accepting line-by-line collection records with FAT, SNF, volume, and total payout value.

### 2.5 Double-Entry Ledger Posting
- **`customer_ledger_accounts` & `ledger_transactions`**: Double-entry ledger infrastructure ready to ingest milk collection credits (`MILK_COLLECTION` credit transactions) and maintain real-time farmer balances.

---

## 3. Scope of Roadmap Phase 08

The core objective of Roadmap Phase 08 is making `apps/dfarm-collection-app` an operational, production-ready milk collection kiosk counter:

1. **Hardware Driver Integration (WebSerial / WebHID):**
   - Direct serial communication with digital weighing scales (continuous ASCII weight streaming, tare, stability detection).
   - Direct serial communication with ultrasonic milk analyzers (Ekomilk, Essae, Lactoscan) for automated FAT, SNF, and added water extraction.
   - Direct serial/USB ESC/POS printing for 2-inch thermal milk intake receipts.
2. **Identification State Machine:**
   - Multi-factor identification pipeline: Facial recognition (SFace 128-dim inference in browser via ONNX Runtime / WebGL), RFID card tap (WebUSB or keyboard wedge), and manual Farmer ID / Phone fallback.
   - Local client-side template caching in IndexedDB with cryptographic integrity checks.
3. **Offline Intake Queue & Background Sync:**
   - Client-side IndexedDB persistence for offline milk collections when network connectivity drops.
   - Deterministic synchronization engine with monotonic sequence IDs and idempotent batch submission to `POST /api/v1/collection/intake`.
4. **Shift Reconciliations & Counter Printouts:**
   - Shift opening, counter-level volume verification, and shift closing summary printing.

---

## 4. Strict Exclusions Reserved for Roadmap Phase 09

To avoid scope creep and protect platform architectural integrity, the following capabilities are **STRICTLY EXCLUDED** from Phase 08 and reserved for Roadmap Phase 09:

| Feature / Subsystem | Phase 08 Boundary | Phase 09 Authoritative Scope |
|---|---|---|
| **Automated Bank Payouts** | Manual payout recording only (cash/direct bank UTR) | Bulk SBI CMP / NEFT / RTGS payout file generation, NPCI NACH integration, and automated bank webhook reconciliation |
| **Global Rate Policy Enforcement** | Dairy-level active rate charts | Super Admin global rate minimums/maximums financial policy enforcement |
| **WebSocket Infrastructure** | RESTful polling & IndexedDB sync | Monorepo-wide WebSocket / SSE streaming server for live counter monitoring |
| **Razorpay Farmer Disbursements** | Zero Razorpay integration | Strictly Prohibited (Farmer payouts must use direct bank integrations, never payment gateways) |

---

## 5. Architectural Invariants for Phase 08 Implementation

1. **UI Redesign Prohibited:** The user interface of `apps/dfarm-collection-app` is established. Changes must strictly connect existing UI controls, modals, and tables to genuine backend APIs and hardware drivers without modifying layouts or visual designs.
2. **Database-per-Dairy Isolation:** All backend synchronization from the collection app must pass through tenant-aware middleware resolving the tenant connection pool via `X-Organization-Id` or JWT claims.
3. **Zero Raw Biometric Exposure:** Facial embeddings must never be transmitted in plain text or logged. Templates synced to IndexedDB must remain encrypted or held in isolated client memory.
4. **Idempotent Milk Intake:** Every collection record must carry a client-generated UUID `intake_id` to prevent duplicate ledger credits during network retry storms.

---

## 6. Handoff Readiness Checklist

- [x] All 5 Phase 06 Carry-Over Security Gates implemented and tested.
- [x] All 9 Phase 07 Functional Modules implemented and tested.
- [x] 41/41 Phase 07 tests passing in `services/backend/tests/roadmap-phase-07-dairy-admin.test.js`.
- [x] Full regression suite passing (127/127 tests passing, 0 failures).
- [x] Production builds for all 4 packages (`backend`, `dairy-admin`, `super-admin`, `collection-app`) compiling with exit code 0.
- [x] All 15 required documentation artifacts generated in `docs/implementation/`.

**Phase 07 is formally closed. Roadmap Phase 08 is authorized to proceed.**
