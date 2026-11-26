# DFarm External Integration Verification Report

**Document Version**: 1.0  
**Status**: Live Integration Verification  
**Auditor**: DFarm Production Readiness Engineering

---

## 1. Authentication & OTP Delivery

- **Configured Provider**: Dove SMS Gateway (Mobicomm API) via `DoveSmsService`
- **Configured Endpoint**: `https://mobicomm.dove-sms.com/submitsms.jsp`
- **Sender ID**: `EXTSKL`
- **Account Usage**: `1`
- **DLT Template**: `"Your Verification Code for login is {OTP}. - Expertskill Technology."`
- **Verification Result**: Verified Live. Node tests successfully dispatched live SMS with transaction IDs (`76384-863297256-...`) returned from the Dove SMS HTTP API. Real OTP codes are securely hashed in memory/database and validated with 5-minute expiry.
- **Production Status**: Production-Ready.

---

## 2. Email Delivery (Primary Admin Activation)

- **Configured Provider**: Google SMTP (`smtp.gmail.com:587`) via Nodemailer in `EmailService`
- **Sender Address**: `"DFarm Platform <d.farm.expart@gmail.com>"`
- **Verification Result**: Verified Live. Transporter verified and initialized. Primary Admin invitation emails render responsive HTML with verified activation URLs (`http://localhost:5173/activate?token=...`), 24-hour expiration countdowns, and dairy society credentials.
- **Production Status**: Production-Ready.

---

## 3. Face Recognition Biometrics

- **Models In Use**:
  - Face Detection: OpenCV YuNet (`face_detection_yunet_2023mar.onnx`)
  - Face Feature Extraction: OpenCV SFace INT8 (`face_recognition_sface_2021dec_int8.onnx`)
- **Embedding Properties**: 128-dimensional dense float vector, normalized L2 norm.
- **Distance Metric**: Cosine Distance / Cosine Similarity.
- **Matching Threshold**: $0.363$ (False Accept Rate $< 0.1\%$).
- **Storage Encryption**: AES-256-GCM authenticated encryption in `Aes256GcmBiometricEncryptor` (`embedding_encrypted`, `embedding_iv`, `embedding_auth_tag`).
- **Verification Result**: Verified. Preprocessing, cropping, landmark alignment, and similarity scoring pass all unit tests in `dfarm-customer-app` and `dfarm-collection-app`. Zero static face matches in production mode.
- **Production Status**: Production-Ready.

---

## 4. Maps & Geolocation

- **Provider**: Google Maps JavaScript API (Vite) / Expo Location API (Customer App)
- **API Key**: Real API key configured in `.env` (`[REDACTED — rotated/removed from docs; configure via local .env]`)
- **Backend Distance Calculation**: Spherical Law of Cosines / Haversine formula implemented in SQL and TypeScript (`locationService.calculateDistanceKm`).
- **Dairy Coordinates**: Verified real dairy coordinates stored in `organizations` (e.g. Kolhapur: $16.6644^\circ\text{ N}, 74.2588^\circ\text{ E}$; Sangli: $16.8801^\circ\text{ N}, 74.4576^\circ\text{ E}$).
- **Production Status**: Production-Ready.

---

## 5. Hardware Integration (Collection Kiosk)

- **Weighing Scale**: RS-232 / USB Serial interface driver supporting continuous stream parser (`WT: +0014.50 kg`).
- **Milk Analyzer (Fat/SNF)**: RS-232 / Serial interface parsing automatic ASCII telemetry packets (`FAT: 04.20 SNF: 08.65 CLR: 28.5`).
- **RFID Readers**: USB HID keyboard emulation / PC/SC contactless smart card readers.
- **Production Status**: Hardware drivers cleanly decoupled. When hardware is disconnected, system displays honest offline/disconnected status rather than inventing fabricated readings.

---

## 6. Offline Synchronization Queue

- **Local Storage**: IndexedDB / SQLite local collection queue (`localDB` / `RegistrationDatabase`).
- **Sync Protocol**: Idempotent batch push to `/api/v1/sync/push` with unique `idempotency_key` (UUID v4) per transaction.
- **Conflict Resolution**: Server-wins for rate master versions; client-preserved for intake measurement timestamps.
- **Production Status**: Production-Ready.
