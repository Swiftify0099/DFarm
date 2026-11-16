# DFarm Collection App — Architectural Specification

## 1. System Overview
**Application:** DFarm Dairy Milk Collection Management Platform (`dfarm-collection-app`)  
**Deployment Form:** Browser-based Desktop Web Application (Chrome & Microsoft Edge)  
**Development Approach:** 100% Greenfield Development  
**Technology Stack:** React 19 + TypeScript (strict mode) + Vite 8 + Tailwind CSS v4 + TanStack Query v5 + React Router v7  
**Design Standard:** Premium Luxury Claymorphism (DFarm Brand Palette)

---

## 2. Core Architecture Components

### A. Dedicated Biometric Face Recognition Pipeline
- **Detector:** OpenCV YuNet ONNX (WASM SIMD runtime)
  - 60 frames per second throughput.
  - Generates 5 facial landmark coordinates (left eye, right eye, nose tip, mouth corners) with bounding box reticle.
- **Recognizer:** OpenCV SFace INT8 ONNX
  - Extracts 128-dimensional dense embedding in 14ms latency.
  - Cosine distance matching against locally enrolled tenant patron templates.
- **Formal State Machine:**
  `IDLE` → `CAMERA_CONNECTING` → `WAITING_FOR_FACE` → `FACE_DETECTED` → `EMBEDDING_GENERATED` → `CUSTOMER_MATCHED` / `UNKNOWN_PERSON`.

### B. Hardware Telemetry & Serial Adapter
- **Camera:** Industrial USB 1080p @ 60fps via Browser MediaStream API.
- **RFID Scanner:** Mifare 13.56MHz Contactless Card Reader on COM3 (`9600 Baud`).
- **Milk Analyzer:** Ultrasonic Master Lactometer on COM4 (`19200 Baud`).
- **Digital Platform Scale:** Heavy-Duty Platform Scale on COM5 (`4800 Baud`) with real-time Tare and Stability Lock flag.
- **Cloud Sync Relay:** HTTPS REST Relay (`https://api.dfarm.in/v1/collection`).

### C. Voice Announcer Driver (Frame-Debounced)
- Interfaces directly with browser `window.speechSynthesis` (Web Speech API).
- Configured for `en-IN` (Indian English/Marathi inflection).
- **8-Second Frame Debounce Lockout:** Since video frames process continuously at 60fps, identical patron detections within 8 seconds are debounced to eliminate repetitive speech chatter.

### D. Offline-First Resilience (IndexedDB Datastore)
- Datastore Name: `dfarm_collection_local_db` (Version 1).
- Object Stores:
  1. `offline_queue`: Monotonic event store with UUIDs and transaction payload.
  2. `active_session`: Shift session aggregates and state.
  3. `customers_cache`: Patron metadata and biometric enrollment scores.
  4. `completed_transactions`: Local shift intake journal.
- When network disconnects, transactions automatically queue with zero data loss and sync idempotently when connectivity restores.

### E. Authoritative Two-Axis Rate Matrix Engine
- **Formula:**
  $$\text{Rate} = \text{BaseRate} + (\text{Fat} - 3.5) \times 4.20 + (\text{SNF} - 8.5) \times 3.50$$
- **Configured Base Rates:**
  - Cow Milk (Chart v2): Base ₹38.50 / Liter.
  - Buffalo Milk (Chart v1): Base ₹58.00 / Liter.
- **Safety Floors:** Minimum enforced rate cannot fall below ₹15.00/L.

### F. Strict Transaction Validation Gates
`SaveTransactionButton` remains disabled and locked unless:
1. Patron identified (via Face YuNet+SFace, RFID, or Manual Search).
2. Weight > 0.00 Liters.
3. Scale reading is marked stable (`scaleStable === true`).
4. Fat % within biological boundaries (2.0% – 15.0%).
5. SNF % within biological boundaries (6.0% – 12.0%).

---

## 3. Keyboard Shortcut Matrix
- **F1:** Milk Collection Workspace (`/collection`)
- **F2:** Patron Directory & Biometric Profiles (`/customers`)
- **F3:** Shift Session Reconciliation (`/sessions`)
- **F4:** Hardware Telemetry & Diagnostics (`/devices`)
- **F5:** Offline Queue & Cloud Relay (`/sync`)
- **F6:** Kiosk Terminal Settings (`/settings`)
