# DFarm Biometric Security: Cryptography, Anti-Spoofing & Privacy Guardrails

## 1. Cryptographic Architecture for Biometric Templates

Biometric templates represent sensitive personal data under the Digital Personal Data Protection Act (DPDP Act, 2023) and global biometric standards. DFarm enforces defense-in-depth cryptographic isolation at rest, in transit, and during in-memory processing.

### 1.1 AES-256-GCM Authenticated Encryption

All 512-dimensional floating-point embeddings are serialized into raw 2048-byte IEEE-754 binary buffers and encrypted using Authenticated Encryption with Associated Data (AEAD) via AES-256-GCM.

- **Algorithm**: `AES/GCM/NoPadding` (256-bit key length).
- **Initialization Vector (IV)**: 12-byte cryptographically secure random nonce generated independently for every single encryption operation using `crypto.randomBytes(12)` or `SecureRandom`. IV reuse is mathematically prevented.
- **Authentication Tag**: 128-bit (16-byte) Galois message authentication code (GMAC). Any alteration of ciphertext bits, truncation, or bit-flipping immediately triggers an authentication tag verification failure.

### 1.2 Cryptographic AAD Binding (Anti-Transplantation Defense)

A major attack vector in biometric databases is template transplantation—copying an encrypted template from one customer's record and placing it into another customer's profile.

DFarm eliminates this risk by binding the customer UUID and the model version into the Additional Authenticated Data (AAD) stream:

$$\text{AAD} = \text{"DFARM:CUST="} \parallel \text{customerId} \parallel \text{":MODEL="} \parallel \text{modelVersionId}$$

```typescript
// Backend and Android AAD verification
const expectedAad = `DFARM:CUST=${customerId}:MODEL=${modelVersionId}`;
cipher.setAAD(Buffer.from(expectedAad, 'utf8'));
```

If an adversary transfers an encrypted template to a different customer ID or pairs it with a different model version ID, GCM authentication tag verification will fail deterministically during decryption, raising `TAMPERED_CIPHERTEXT_OR_AAD`.

### 1.3 Key Management & Envelope Architecture

- **Backend Key Rotation**: Encryption keys are referenced by logical identifiers (e.g., `key-v1-2026`). Backend microservices retrieve root keys from secure environment stores or cloud KMS (Google Cloud KMS / HashiCorp Vault). Plaintext keys are never hardcoded in source code or committed to repositories.
- **Android Device Keystore**: Collection and registration tablets utilize the hardware-backed Android Keystore (`AndroidKeyStore` provider) running inside the device's Trusted Execution Environment (TEE) or StrongBox Keymaster. Private keys never leave the hardware module.
- **Device-Specific Envelope Delivery**: Cloud-to-device synchronization of authorized matching templates utilizes an envelope encryption design. Templates are wrapped with device-specific public keys authorized for that specific collection center. No universal decryption master key is ever broadcast to field devices.

---

## 2. Volatile RAM & Zero-Raw-Photo Policy

DFarm enforces a zero-raw-photo persistence architecture across all systems:

1. **Camera Frame Processing**: Android CameraX streams `ImageProxy` frames directly into volatile RAM.
2. **Immediate Crop & Discard**: After face detection and 5-point landmark extraction, the full camera frame is unpinned and GC-recycled.
3. **In-Place Memory Zeroization**: Once the 512D embedding vector is generated, intermediate aligned bitmap arrays and grayscale Laplacian buffers are explicitly overwritten with zeroes (`Arrays.fill(buffer, 0)`).
4. **Backend Transmission**: The Android Registration App never transmits raw JPEG, PNG, or uncompressed RGB bitmaps over the network. Only the client-encrypted template envelope, liveness score, and quality telemetry are submitted to the backend.

---

## 3. Liveness Detection & Presentation Attack Defense

### 3.1 Threat Assessment (ISO/IEC 30107-3)

| Attack Scenario | Modality | Vulnerability Level | Defense Mechanism |
| :--- | :--- | :--- | :--- |
| **High-Res Printed Photo** | 2D Print | High on naive systems | Specular reflection spread, Laplacian texture cutoff |
| **Smartphone / Tablet Replay** | 2D Screen | Very High on RGB | High-frequency Moiré pattern analysis, screen gamut detection |
| **Video Loop Replay** | Dynamic Screen | High | Interactive multi-sample challenge, motion parallax tracking |
| **3D Silicone / Latex Mask** | Physical Mask | Moderate | Active challenge sequence, pose angle variation correlation |

### 3.2 Detection Strategy & Classification Honesty

DFarm implements passive software heuristics coupled with active interactive challenges:

1. **High-Frequency Texture & Moiré Analysis**: Screen refresh grids introduce harmonic peaks in the 2D Fourier domain. Images with abnormal high-frequency spectral ratios ($> 0.82$) are classified as `SUSPECTED_SPOOF`.
2. **Specular Reflection Distribution**: Natural human skin displays diffuse micro-reflections. Glass screens and laminated paper display sharp, concentrated specular specular highlights ($< 8.0$).
3. **Color Gamut Diversity**: Natural skin illuminated by daylight displays rich chrominance variance. Screen reproductions display narrow, saturated color clusters.
4. **Active Randomized Challenges**: The Registration UI prompts the subject with randomized micro-actions (e.g., "Look Center", "Turn Head Slightly Left", "Smile Gently"). The coordinator verifies that the yaw/pitch trajectory changes realistically between captures.

### 3.3 Honest Classification Policy

> [!IMPORTANT]
> Mobile devices relying strictly on standard 2D RGB front/rear cameras without dedicated structured-light 3D IR projectors or Time-of-Flight (ToF) sensors cannot mathematically guarantee 100% defense against all presentation attacks.

Rather than claiming false absolute security, DFarm classifies standard RGB passes as:
- **`RESTRICTED_PASS`**: Software liveness heuristics and active challenges passed on standard 2D camera. In collection centers, high-value transactions or unexpected location shifts require dual-factor verification (RFID + Face).
- **`LIVE`**: Reserved exclusively for devices equipped with verified hardware depth sensors (IR / ToF / Stereo).
- **`SUSPECTED_SPOOF`**: Presentation attack indicators detected. Enrollment or identification is rejected immediately.

---

## 4. DPDP Act & Privacy Lifecycle Compliance

1. **Explicit Consent Recording**: Prior to opening the Android camera, the Registration Officer must read the consent script in the customer's preferred vernacular language (e.g., Marathi or English) and record explicit consent in `customer_consent_records`.
2. **Right to Erasure & Revocation**: Calling `POST /api/v1/customers/:id/face-revoke` sets the enrollment status to `REVOKED`. If `permanentErasure = true`, the system executes cryptographic shredding by nullifying encrypted payloads and IVs.
3. **No Biometric Data in Logs**: Application logger configurations (Pino, Logcat) strictly redact authorization headers, raw vectors, ciphertexts, and customer photographs.
