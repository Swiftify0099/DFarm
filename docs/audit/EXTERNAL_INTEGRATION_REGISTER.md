# EXTERNAL INTEGRATION REGISTER

**Audit Document Reference:** `DFARM-AUDIT-009`  
**Version:** `1.0.0-PROMPT0-AUDIT`  
**Status:** `READ-ONLY TECHNICAL BASELINE`  
**Classification:** `External Systems, Hardware Protocols & Third-Party Services Register`  
**Evaluator:** DFarm Principal Solution Architect & Systems Integration Auditor  

---

## 1. External Integration Baseline Status

| Integration System | Protocol / Adapter | Configuration Status | Operational State | Audit Findings & Evidence |
| :--- | :--- | :---: | :---: | :--- |
| **Dove SMS Gateway** | HTTP GET / Mobicomm | Partially Configured | **Operational** | Configured in `DoveSmsService.ts`. DLT template approved. Dispatches live OTPs. Default auth key has placeholder chars (`ba9dcdcdfcXX`). |
| **Nodemailer SMTP** | SMTP / TLS (Port 587/465) | Unconfigured in `.env` | **Standby Mode** | Implemented in `EmailService.ts`. Renders Claymorphic HTML. Falls back to `STANDBY_LOCAL_PREVIEW` and logs link to console. |
| **Google Maps Platform**| JavaScript API Loader | Configured | **Operational** | `@googlemaps/js-api-loader` installed in Super Admin. Interactive map picker and draggable pin working in `DairyLocationPicker.tsx`. |
| **OpenCV YuNet Detector**| ONNX Runtime / Graph | Models Present on Disk | **Partial Execution**| `face_detection_yunet_2023mar.onnx` (232.6 KB) present in Collection & Customer apps. Mobile execution shims to calibrated box. |
| **OpenCV SFace INT8** | ONNX Runtime / 128-D | Models Present on Disk | **Partial Execution**| `face_recognition_sface_2021dec_int8.onnx` (9.9 MB) present. Mobile execution falls back to canonical fixture with micro-variations. |
| **Browser Camera** | HTML5 MediaDevices API | Native Web API | **Operational** | Used in Collection App. Captures live video stream into canvas for biometric inference. |
| **Mobile Camera** | `expo-camera` (~58.0.14) | Native Mobile API | **Operational** | Used in Customer App. Captures live selfie frames for face enrollment. |
| **RFID Card Reader** | USB HID Keyboard Wedge | Native OS Input | **Operational (HID)**| Captures 8/10-digit card UIDs emitted as keystrokes. Native Web Serial / WebUSB direct polling is not implemented. |
| **Milk Analyzer** | RS-232 / Serial Protocol | Not Integrated | **Simulated / Manual**| Kiosk accepts manual numerical FAT/SNF/CLR input. Hardware telemetry displays simulated values via `Math.random()`. |
| **Digital Weight Scale** | RS-232 Serial Weighbridge | Not Integrated | **Simulated / Manual**| Kiosk accepts manual weight input or virtual weight injection buttons. Continuous Web Serial scale driver not implemented. |
| **Lactometer** | Manual CLR Entry | Manual Input Only | **Manual Input** | Supported as manual density input field (e.g. CLR 28.5) during collection intake. |
| **WhatsApp Cloud API** | Meta Graph API v21.0 | Unconfigured | **Standby Mode** | Configured in `env.ts` (`WHATSAPP_ENABLED: false`). Webhook verification router exists in `whatsapp-webhook.routes.ts`. |
| **Firebase Cloud Messaging**| Google FCM REST API | Unconfigured | **Standby Mode** | FCM private key and client email variables defined in `env.ts`, but disabled by default. |
| **Global Milk Rate API** | Central Rate Engine | Unconfigured | **Missing / Gap** | No external third-party milk rate feed is configured. Rates rely strictly on tenant-defined `rate_charts`. |
| **Razorpay (AMC Only)** | Razorpay Orders API | Unconfigured | **Missing / Gap** | Reserved strictly for Super Admin Dairy AMC renewals. No Razorpay SDK or webhook handler currently implemented. |
| **Bank Bulk NEFT** | SBI Corporate Format | Specification Exists | **Planned Specification** | File format specifications defined in `customer-payouts.md`. Automated SFTP / Host-to-Host bank upload not implemented. |

---

## 2. In-Depth Technical Inspection of Major Integrations

### 2.1 SMS & OTP Delivery Gateway (Dove SMS / Mobicomm)
- **Service Implementation:** `services/backend/src/infrastructure/sms/DoveSmsService.ts`
- **Gateway Endpoint:** `https://mobicomm.dove-sms.com/submitsms.jsp`
- **DLT Approved Template:**
  ```text
  Your Verification Code for login is {OTP}. - Expertskill Technology.
  ```
- **Execution Mechanism:** Dispatches an HTTP GET request with query parameters: `user`, `key`, `mobile`, `message`, `senderid` (`EXTSKL`), `accusage` (`1`).
- **Resilience:** Implements automatic 12-second timeout and 1-time retry on network timeout.
- **Audit Findings:** The SMS integration is functionally genuine. However, `config.DOVE_SMS_AUTHKEY` in `env.ts` defaults to a masked placeholder `ba9dcdcdfcXX`. In production, the valid commercial auth key must be injected via environment variables.

---

### 2.2 Email & Activation Delivery Service (Nodemailer)
- **Service Implementation:** `services/backend/src/infrastructure/email/EmailService.ts`
- **Transport Mechanism:** Nodemailer SMTP transport targeting `config.SMTP_HOST` on port 587 (TLS) or 465 (SSL).
- **Claymorphic Activation Template:** Renders an HTML email styled with DFarm branding, specifying Dairy Business Name, Tenant Code, Primary Admin details, and a 48-hour expiration notice.
- **Standby Mode Behavior:**
  - If `SMTP_HOST`, `SMTP_USER`, or `SMTP_PASS` is empty, `EmailService` initializes in standby mode.
  - When `sendActivationInvitation()` is called, it generates a single-use token (`crypto.randomBytes(32).toString('hex')`), hashes it with SHA-256 for database storage, logs the full activation link to the console, and returns `{ success: true, provider: 'STANDBY_LOCAL_PREVIEW', status: 'PENDING' }`.
- **Audit Findings:** The fallback ensures developer velocity and end-to-end testing without crashing when external SMTP relays are unconfigured.

---

### 2.3 Biometric Model Assets & In-Browser Inference
- **Detector:** `face_detection_yunet_2023mar.onnx` (OpenCV Zoo YuNet)
  - Input: `[1, 3, 640, 640]` float32 image tensor
  - Outputs: 12 tensors representing multi-scale classification scores, bounding boxes, and 5 facial landmarks (right eye, left eye, nose tip, right mouth corner, left mouth corner).
- **Recognizer:** `face_recognition_sface_2021dec_int8.onnx` (OpenCV Zoo SFace INT8)
  - Input: `[1, 3, 112, 112]` float32 aligned face crop
  - Output: `[1, 128]` float32 embedding vector
  - Distance Metric: Cosine Similarity ($L_2$ normalized)
  - Threshold: $0.363$ (OpenCV benchmark recommendation)
- **Asset Verification:**
  - Both `.onnx` model files exist physically on disk in `apps/dfarm-collection-app/public/models/` and `apps/dfarm-customer-app/assets/models/`.
  - In Collection App (browser), `onnxruntime-web` loads the models via WebAssembly.
  - In Customer App (React Native), native ONNX bindings are missing, leading to the canonical fixture fallback documented in Finding `DF-CUST-001`.

---

### 2.4 Hardware Communication Adapters (Analyzers, Scales, RFID)
- **Current Architecture:** Software simulation drivers located in `apps/dfarm-collection-app/src/drivers/`.
- **Missing Protocols:**
  - *Milk Analyzers:* No RS-232 serial parser for standard continuous ASCII data strings (e.g. `F:04.20 S:08.50 C:28.00`).
  - *Weighing Scales:* No Web Serial API driver to stream continuous tare and gross weight strings.
  - *RFID:* Relies strictly on standard keyboard wedge HID scanners. No WebUSB / Serial protocol for dedicated Mifare read/write stations.
- **Audit Directives:** Do not mark hardware as connected based on UI green indicators. In Prompt 8, implement genuine Web Serial drivers (`navigator.serial`) with connection negotiation and parity checks.
