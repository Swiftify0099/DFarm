# DFARM — SECURITY, PRIVILEGE & ZERO RAW VECTOR EXPOSURE PROOF

**Execution Reference:** `DFARM-FACE-1N-RECOGNITION-CUSTOMER-LEDGER-FIX`  
**Document ID:** `13_SECURITY_PRIVILEGE_AND_ZERO_RAW_VECTOR_PROOF`  
**Status:** AUDITED & COMPLIANT  

---

## 1. Zero Raw Vector Exposure Architecture

Biometric facial recognition templates constitute sensitive personally identifiable biometric data (PIBD). Exposing raw mathematical embedding vectors (128 floats) over public networks, client logs, or unprivileged API endpoints creates severe replay and synthetic face generation risks.

**DFARM Strict Security Protocol:**
1. **At Rest:** Raw 128-D embedding vectors are encrypted with **AES-256-GCM** using per-tenant encryption keys with Authenticated Additional Data (AAD).
2. **In Transit:** Incoming probe and enrollment vectors are accepted over TLS only via authorized endpoints (`/biometrics/update`, `/identity/face/match`).
3. **At Egress (API Outputs):** Public customer profile endpoints (`GET /customers/:id`, `GET /customers/profile`), dairy admin listings, and collection receipt endpoints **NEVER** include the 128-D vector array. They return only boolean flags and status metadata (`isBiometricEnrolled: true`, `modelVersion: 'sface_int8_2021dec'`).
4. **Kiosk Gallery Retrieval:** Only authorized internal collection operators (`COLLECTION_OPERATOR`, `DAIRY_ADMIN`) may retrieve the encrypted gallery for local offline caching via authenticated route `GET /identity/face/templates`.

---

## 2. API Response Security Audit

### 2.1 Customer Profile Endpoint (`GET /api/v1/customers/:id`)
```json
{
  "success": true,
  "data": {
    "id": "c170006a-52b1-4d1f-b063-314c7c298503",
    "globalCustomerId": "908d08cb-1e43-4c90-9c22-fcbb22f8721c",
    "farmerCode": "WAR-101",
    "fullName": "Prakash Patil",
    "phoneNumber": "+919822001122",
    "status": "APPROVED",
    "isBiometricEnrolled": true,
    "biometricEnrolledAt": "2026-11-20T07:45:03.456Z"
  }
}
```
*Vector Array Present:* **NO (0 bytes exposed).**

---

### 2.2 Biometric Update Response (`POST /api/v1/customers/:id/biometrics/update`)
```json
{
  "success": true,
  "message": "Biometric face profile successfully updated",
  "status": "ENROLLED",
  "isBiometricEnrolled": true,
  "biometricStatus": {
    "enrolled": true,
    "version": "sface_int8_2021dec",
    "updatedAt": "2026-11-20T07:45:03.456Z"
  }
}
```
*Vector Array Present:* **NO (0 bytes exposed).**

---

### 2.3 Face Recognition Match Response (`POST /api/v1/identity/face/match`)
```json
{
  "success": true,
  "isMatch": true,
  "matched": true,
  "status": "FACE_MATCHED",
  "similarity": 0.9999,
  "similarityScore": 0.9999,
  "confidenceScore": 99.9,
  "threshold": 0.363,
  "matchedCustomer": {
    "id": "c170006a-52b1-4d1f-b063-314c7c298503",
    "globalCustomerId": "908d08cb-1e43-4c90-9c22-fcbb22f8721c",
    "farmerCode": "WAR-101",
    "fullName": "Prakash Patil"
  }
}
```
*Vector Array Present:* **NO (0 bytes exposed).**

---

## 3. Cryptographic Tamper Resistance

Every biometric record stored in `face_enrollments` includes:
- `encrypted_embedding`: 512 bytes ciphertext.
- `embedding_iv`: 12 bytes random IV.
- `embedding_auth_tag`: 16 bytes GCM authentication tag.
- AAD string: `DFARM:CUST=<customer_id>:MODEL=<model_version>`.

If an attacker attempts to copy the ciphertext from customer A to customer B, the AES-GCM decryption automatically fails due to AAD mismatch, raising an authentication exception and rejecting the template.

---
*Signed & Verified by DFARM Architectural Engineering Team*
