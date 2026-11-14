# Biometric Security & Template Protection Remediation
**DFarm — Smart Dairy Management System**  
**Remediation Deliverable 05**  

---

## 1. Biometric Template Envelope & Encryption Architecture

Facial feature templates represent sensitive biometric data under DPDP and ISO/IEC 24745. DFarm enforces end-to-end encryption for all stored and transmitted face embeddings.

### 1.1 Cryptographic Specification
- **Algorithm**: AES-256-GCM (Galois/Counter Mode).
- **Key Generation**: 256-bit symmetric key derived via Android Keystore / HSM.
- **Initialization Vector (IV)**: 12-byte cryptographically secure random nonce per encryption.
- **Authentication Tag**: 16-byte (128-bit) GCM authentication tag.
- **Associated Data (AAD)**: Canonical Customer UUID + Model Version UUID.

---

## 2. Template Size Reconciliation: 2048 Bytes vs 434 Bytes

### The 434-Byte Discrepancy:
Phase 09 sync documentation mistakenly cited a biometric template size of **434 bytes**.
Investigation identified that 434 bytes was the size of a mock JSON metadata object containing test strings, rather than the real biometric embedding payload.

### Authoritative Calculation:
$$\text{Dimensions} = 512 \quad (\text{Float32 numbers})$$
$$\text{Raw Binary Size} = 512 \times 4 \text{ bytes} = 2048 \text{ bytes}$$
$$\text{AES-256-GCM Envelope} = 2048 \text{ bytes (Ciphertext)} + 12 \text{ bytes (IV)} + 16 \text{ bytes (Auth Tag)} = 2076 \text{ bytes}$$
$$\text{Base64 Encoded Envelope} = \lceil 2076 \times \frac{4}{3} \rceil = 2768 \text{ characters}$$

This was mathematically verified in `biometric-engine.test.js` Subtest 12, confirming that any encrypted 512D Float32 vector payload occupies exactly 2076 binary bytes.

---

## 3. Biometric Consent Management

Under data protection laws, biometric processing requires explicit, voluntary, and revokable farmer consent.

### Schema Structure (`customer_consent_records`):
- `customer_id`: Canonical Customer UUID.
- `consent_type`: `'BIOMETRIC_FACE_ENROLLMENT'`.
- `consent_granted`: `TRUE`.
- `granted_at`: Timestamp of capture.
- `revoked_at`: Timestamp of revocation (NULL while active).
- `consent_text_version`: Version identifier of the displayed legal declaration.
- `witness_officer_id`: User UUID of the registration officer witnessing consent.

### Revocation Protocol:
1. When a farmer revokes biometric consent (`POST /api/v1/customers/:id/consent/revoke`):
   - `customer_consent_records.revoked_at` is set to current timestamp.
   - `face_enrollments` entries for the customer are marked `REVOKED`.
   - Customer status is transitioned from `ACTIVE` to `PENDING_FACE_ENROLLMENT`.
   - A durable tombstone is emitted to `sync_tombstones` to purge local face templates from edge tablets.
   - Milk collection continues via RFID or Supervisor Manual Verification.
