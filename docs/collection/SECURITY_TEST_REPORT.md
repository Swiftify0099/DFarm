# DFarm Security & Biometric Data Protection Audit Report

**Audit Focus:** Biometric Data Privacy, Multi-Tenant Boundary Enforcement, and Authentication Security  

---

## 1. Biometric Template Protection (AES-256-GCM)

Face embeddings represent sensitive personally identifiable biometric information (PII).
- **At Rest:** Face templates are encrypted using AES-256-GCM in the backend database (`face_enrollments.encrypted_embedding`).
- **Authenticated Additional Data (AAD):** Each vector is cryptographically bound to its customer and model version:
  $$\text{AAD} = \text{"DFARM:CUST="} + \text{customerId} + \text{":MODEL="} + \text{modelVersion}$$
  Any tampering with customer ownership invalidates GCM authentication tag verification.
- **In Transit:** TLS 1.3 encryption on all API endpoints. Only decrypted vector payloads are delivered to authenticated kiosk terminals authorized for that exact dairy.

---

## 2. Multi-Tenant Penetration & Isolation Testing

1. **Cross-Tenant ID Tampering:**
   - Test: Operator authenticated in Dairy A sends a request to `GET /api/v1/customers/:id` using Dairy B patron UUID `20000000-0000-0000-0000-000000000201`.
   - Result: Intercepted by tenant authorization guard and rejected with `403 Forbidden`.
2. **Cross-Tenant Biometric Injection:**
   - Test: Presenting a probe face vector enrolled under Dairy B at Dairy A's kiosk.
   - Result: `DairyFaceMatcher` filters candidate search space exclusively to Dairy A. Match returns `isMatch: false, status: 'UNKNOWN_PERSON'`.
3. **Frontend Header Spoofing:**
   - Test: Sending `X-Dairy-Id: 00000000-0000-0000-0000-000000000004` with a token belonging to Dairy A.
   - Result: Backend resolves tenant identity from the cryptographic JWT payload (`req.user.organizationId`), completely ignoring malicious header overrides.

---

## 3. Authentication & Zero-Backdoor Assurance

- **JWT Cryptography:** Signed with HMAC-SHA256 using an environment-managed 256-bit secret.
- **Zero Backdoors:** No hardcoded admin tokens, debug bypasses, or mock login bypasses exist in production code paths.
- **Brute-Force Protection:** Rate limiting active via Redis/Memory token bucket on all `/auth` and `/otp` routes.
