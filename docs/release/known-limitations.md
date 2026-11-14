# DFarm Smart Dairy Management System — Known Limitations & External Boundaries
**Document Reference:** `docs/release/known-limitations.md`  
**Phase:** 20 of 20 (Production Release Readiness)  
**Standard:** Strict Evidence-Based Assessment (No Fabricated Capabilities)  

---

## 1. Executive Summary

This document transparently specifies the operational boundaries, deferred physical integrations, and external provider dependencies of the DFarm Smart Dairy Management System. The software core (intake state machine, rate calculations, sync, double-entry financial accounting, billing, payroll, notifications, and web console) is fully implemented and verified. Hardware and third-party commercial account activations remain bounded.

---

## 2. Face Recognition Subsystem Boundary

### 2.1 Current Implementation State
- **Status:** **BLOCKED BY EXTERNAL DEPENDENCY**
- **Safe Fallback In Place:** **VERIFIED** (RFID Contactless Card + Supervisor PIN Selection)

### 2.2 Detailed Audit Finding
1. **Model Artifact Availability:** The binary pre-trained neural network weights file (e.g. MobileFaceNet / ArcFace ONNX or TFLite model, ~15MB) is not bundled in the source repository to prevent proprietary license infringement and repository bloat.
2. **SHA-256 Verification:** Without the authoritative vendor model file, cryptographic SHA-256 checksum and production inference thresholds cannot be verified on physical field devices.
3. **Liveness Detection:** Software heuristics exist, but active anti-spoofing (depth camera / IR / blink detection) requires physical hardware sensor qualification.
4. **Safety Enforcement:** The backend and mobile state machines enforce safe fallback: if face identification fails or is uncalibrated, the system immediately routes through RFID intake or Supervisor authorization.
5. **Requirements for Production Face Identification:**
   - Supply verified, licensed ONNX / TFLite facial embedding model weights.
   - Run threshold calibration benchmarking against Indian rural demographic validation sets.
   - Perform false acceptance rate (FAR) and false rejection rate (FRR) qualification on target POS hardware.

---

## 3. Physical Dairy Hardware Boundary

### 3.1 Current Implementation State
- **Status:** **DEFERRED (Software Interfaces & Validation Verified)**

### 3.2 Detailed Audit Finding
Physical dairy hardware devices are NOT connected in the current software testing environment:
1. **Electronic Weighing Scales:** Serial RS-232 / USB communication interfaces are stubbed; software measurement validation engine strictly enforces quantity bounds `[0.5, 100.0] KG` and unit preservation (`KG`).
2. **Ultrasonic Milk Analyzers (Fat / SNF):** Hardware serial protocols are stubbed; software validation strictly enforces Fat `[2.0, 15.0] %` and SNF `[6.0, 12.0] %`.
3. **Physical RFID Card Readers:** Serial / USB card readers are stubbed; keyboard wedge emulation and Android native NFC reader are fully supported in software.
4. **Thermal Receipt Printers:** ESC/POS binary driver commands are prepared; digital receipts in WhatsApp and Customer Mobile app are fully operational.
5. **Claim Verification:** Software interfaces are verified; no physical automation hardware is falsely claimed as deployed.

---

## 4. Farmer Customer Mobile App Boundary

### 4.1 Current Implementation State
- **Status:** **CLIENT CORE VERIFIED / NATIVE APP STORE DISTRIBUTION REQUIRES OWNER APPROVAL**

### 4.2 Detailed Audit Finding
1. **Source Code & Navigation:** The Expo / React Native codebase (`apps/customer-mobile`) contains complete TypeScript screens for milk intake history, ledger statements, feed purchase history, payment tracking, in-app notifications, and profile settings.
2. **Client Utilities & Cache:** Tested and verified 100% passing (`npx tsx --test src/__tests__/customer-mobile-client.test.ts`).
3. **App Store Publishing:** Google Play Console developer account registration, Apple Developer Team provisioning, and production signing credentials require Dairy Union owner sponsorship.

---

## 5. Third-Party Commercial Service Integrations

### 5.1 Meta WhatsApp Business Cloud API
- **Status:** **READY (Adapter Verified) / REQUIRES LIVE CREDENTIAL ACTIVATION**
- **Requirement:** Meta Business Manager verification, approved WhatsApp Business Account (WABA), registered phone number ID, and active System User Token.
- **Safety Handling:** When unconfigured, the provider returns `status: 'BLOCKED'`, logging the event safely without crashing the backend or halting milk intake.

### 5.2 Banking & Payment Disbursement Gateways
- **Status:** **READY (Batch Generation Verified) / REQUIRES OWNER SETTLEMENT APPROVAL**
- **Requirement:** Commercial bank corporate internet banking (CIB) integration (e.g., SBI, HDFC, ICICI, Bank of Maharashtra) for automated NEFT/RTGS/IMPS disbursement.
- **Safety Handling:** Settlement batches remain in `APPROVED` state until executed by the Dairy Union Treasurer.

---

## 6. Summary Matrix of Readiness

| Subsystem | Readiness Status | Action Required for Go-Live |
|:---|:---:|:---|
| **Backend Core & Database** | **VERIFIED** | Configure production PostgreSQL connection and launch containers. |
| **Admin Web Console** | **VERIFIED** | Deploy compiled Vite assets to Nginx/CloudFront. |
| **Android Registration App** | **VERIFIED** | Sign Release AAB with Dairy Union release keystore. |
| **Android Collection POS** | **VERIFIED** | Sign Release AAB and provision on field POS tablets. |
| **Customer Mobile App** | **VERIFIED (Client Core)**| Build native release APK with Expo Application Services (EAS). |
| **Face Recognition Engine** | **BLOCKED BY EXTERNAL DEPENDENCY** | Provide pre-trained model weights; utilize RFID fallback meanwhile. |
| **Physical Hardware** | **DEFERRED** | Connect physical RS-232 / USB devices during site pilot. |
| **Live WhatsApp API** | **REQUIRES OWNER CREDENTIALS** | Enter Meta WABA System User Access Token in `.env`. |
| **Banking Gateways** | **REQUIRES OWNER APPROVAL** | Authorize corporate banking disbursement protocols. |

