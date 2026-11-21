# DFARM — Security & Privacy Audit Report

**Report Index:** `08_SECURITY_PRIVACY_AUDIT.md`  
**Execution Reference:** `DFARM-FACE-ENROLLMENT-RECOGNITION-END-TO-END-FIX`  
**Target:** Cryptography, DPDP Act 2023 Compliance, Tenant Isolation, and RBAC

---

## 1. Biometric Data Privacy (DPDP Act 2023)

In accordance with India's Digital Personal Data Protection (DPDP) Act 2023:
1. **Explicit Consent Verification:** Every farmer registration requires verifiable consent (`biometricConsent: true`).
2. **Zero Raw Image Storage:** Camera frames are strictly processed in volatile device memory (RAM / WebGL buffer). **No JPEG, PNG, or photographic pixels are ever uploaded or written to persistent disk.**
3. **Encrypted Embedding Vectors:** Face representations are converted to 128 float mathematical abstractions and encrypted using AES-256-GCM before database storage.
4. **Right to Erasure (Revocation):** Dairy admin endpoints support `POST /identity/face/enrollments/:id/erase` which sets `status = 'PERMANENTLY_ERASED'` and overwrites ciphertext with zero bytes.

---

## 2. Cryptographic Security Standards

| Component | Standard | Enforcement |
| :--- | :--- | :--- |
| **Symmetric Encryption** | AES-256-GCM | Encrypts 128-D vector with unique 12-byte IV per template |
| **Integrity & Authenticity** | GCM Auth Tag (16 bytes) | Verifies ciphertext tampering or bit-flipping |
| **Authenticated Data (AAD)** | Bound Tenant & Customer UUID | Prevents copy-paste template replay attacks across users |
| **Key Derivation** | HKDF / PBKDF2 | Root cryptographic master key managed via secure environment variables |

---

## 3. RBAC & Cross-Tenant Access Enforcement

- **Customer Role:** Can only access and update their own biometrics (`req.user.userId === customerId`). Cross-customer inspection returns HTTP `403 Forbidden`.
- **Dairy Admin Role:** Can inspect enrollment metadata and quality scores within their own cooperative society. Attempting to query another dairy's enrollments returns HTTP `403 Forbidden`.
- **Kiosk Operator Role:** Can only match probe embeddings against active templates within their designated dairy.
