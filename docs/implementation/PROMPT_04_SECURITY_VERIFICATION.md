# DFARM — PROMPT 04 SECURITY VERIFICATION
## KIOSK HARDWARE ACCESS CONTROL, BIOMETRIC CRYPTOGRAPHY, OFFLINE QUEUE INTEGRITY & MULTI-TENANT ISOLATION

**Document Reference:** `DFARM-SECURITY-PROMPT-04`  
**Execution Phase:** Prompt 04  
**Status:** FULLY COMPLIANT & VERIFIED  
**Target Applications:** `apps/dfarm-collection-app`, `services/backend`, Browser APIs  

---

## 1. MULTI-TENANT ISOLATION AT THE COLLECTION KIOSK

The milk collection kiosk counter (`apps/dfarm-collection-app`) runs as a browser-based single-page React web application deployed at remote Village Milk Collection Centers (VLCC). It interacts with the platform strictly over authenticated REST APIs.

### 1.1 Architectural Isolation Guarantees
1. **Zero Direct Database Connections**:
   - The kiosk client does NOT hold direct database credentials or network access to either `dfarm_central` or any tenant database (`dfarm_tenant_<code_hash>`).
   - All state transitions route through `services/backend` API endpoints.
2. **Strict Dairy Context Enforcement**:
   - Every API request carries a JWT Bearer token issued during operator/kiosk authentication.
   - The backend enforces `req.user.organizationId` as the authoritative tenant context.
   - Any attempt to spoof headers (`x-dairy-tenant-id`) or query parameters (`?organizationId=...`) targeting another dairy results in immediate `403 Forbidden` (`Cross-dairy query blocked: authenticated user does not have permission for organization`).
3. **Tenant-Scoped Biometric Caching**:
   - Active customer biometric templates downloaded for offline local matching are scoped exclusively to the authenticated dairy center.
   - Biometric vectors from other dairies are never transmitted to or cached by the kiosk.

---

## 2. BROWSER HARDWARE DRIVER SECURITY & INPUT VALIDATION

Because the collection kiosk interfaces directly with physical peripheral devices via Web APIs and OS events, strict hardware boundary security is enforced.

### 2.1 Web Serial & WebUSB Security
- **Explicit User Consent & Origin Isolation**:
  - `navigator.serial.requestPort()` and `navigator.usb.requestDevice()` cannot be triggered programmatically in the background; they strictly require an explicit user gesture (button click).
  - Web Serial connections are locked to secure contexts (`https://` or `localhost`).
  - Origin policy prevents unauthorized cross-origin frames from accessing serial devices.
- **Fail-Safe Disconnect Handling**:
  - `ScaleDriver` and `MilkAnalyzerDriver` monitor `disconnect` events on ports and active readable streams.
  - If a device cable is severed or powered off mid-session, active reading loops abort cleanly, returning error states rather than hanging or accepting stale partial data.

### 2.2 Keyboard-Wedge RFID Injection Defense
- **Buffer Timing Validation**:
  - Physical RFID card scanners emulate rapid keystroke bursts.
  - `RfidReaderDriver` validates that characters arrive within a strict inter-keystroke interval threshold (< 60ms).
  - Manual keyboard typing (typically > 120ms per character) does not accidentally trigger card swipe events.
- **Format & Character Whitelisting**:
  - RFID payload is validated against hexadecimal / alphanumeric identifiers (`^[A-Za-z0-9_-]{4,32}$`).
  - Terminal control sequences, carriage-return overflows, or shell injection characters are stripped and discarded.

### 2.3 Sensor Stream Biological & Sanity Bounds
To prevent malicious hardware spoofing or malformed sensor frames from corrupting dairy milk ledgers, all raw hardware inputs are strictly bounded:
- **Weighing Scale Validation**:
  - Only frames marked with the stability indicator (`ST`) are accepted for intake. Dynamic/unstable frames (`US`) are rejected.
  - Weight must exceed zero net kilograms (`0.10 kg` to `500.00 kg`). Negative or zero values trigger `ScaleUnstableError`.
- **Milk Analyzer Validation**:
  - Fat % must fall within biological bounds: `2.00% <= FAT <= 15.00%`.
  - SNF % must fall within biological bounds: `6.00% <= SNF <= 12.00%`.
  - Density / Corrected Lactometer Reading (CLR): `20.00 <= CLR <= 35.00`.
  - Out-of-bounds readings immediately abort the weighment step and display an operator calibration alert.

---

## 3. BIOMETRIC CRYPTOGRAPHY & TEMPLATE SECRECY

Biometric facial recognition is used for rapid 1:N farmer identification at the intake counter. The platform implements rigorous privacy and cryptographic protections.

### 3.1 Encryption at Rest and in Transit
- **No Raw Face Imagery**:
  - Raw facial images captured during enrollment or verification are NEVER stored on disk, written to databases, or retained in persistent storage.
  - YuNet detects facial bounding boxes and landmarks in volatile memory. SFace computes a 128-dimensional normalized floating-point embedding vector, after which image pixel buffers are immediately garbage-collected.
- **AES-256-GCM Authenticated Encryption**:
  - Biometric templates stored in PostgreSQL `face_enrollments` are encrypted using AES-256-GCM with a 16-byte random IV, 16-byte authentication tag, and Associated Authenticated Data (AAD):
    `DFARM:CUST=<customer_id>:MODEL=<model_version_id>`.
  - Tampering with any byte of ciphertext or tag causes decryption to fail immediately with an authentication error.
- **Root Key Isolation**:
  - Encryption keys are derived via `CREDENTIAL_ENCRYPTION_KEY` using secure HKDF / PBKDF2 derivation.
  - Storage in `bytea` fields via PostgreSQL `decode(base64, 'base64')` prevents binary serialization corruption.

### 3.2 Calibrated Matching & False Acceptance Defense
- **Model Reference**: OpenCV SFace INT8 (`sface_int8_2021dec`).
- **Cosine Similarity Invariant**:
  $$\text{sim}(\mathbf{u}, \mathbf{v}) = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\| \|\mathbf{v}\|}$$
- **Threshold Calibration**:
  - Calibrated match threshold is locked at $\ge 0.363$.
  - Candidates with similarity $< 0.363$ are rejected.
  - If multiple candidate embeddings exceed the threshold, the kiosk presents the top candidate only if the margin over the second candidate exceeds a confidence gap; otherwise, operator confirmation or RFID tap is required.

---

## 4. OFFLINE QUEUE SECURITY & REPLAY PROTECTION

Village collection centers regularly experience internet disconnects. The kiosk's offline intake engine ensures data integrity during network outages.

### 4.1 Storage Partitioning & Anti-Tampering
- Offline transactions are persisted in browser IndexedDB database `dfarm_collection_local_db` within object store `offline_intake_queue`.
- Browser origin isolation prevents other web domains from reading or modifying the queued records.
- Unsynced records are explicitly flagged with `syncStatus: 'PENDING'`. The UI strictly displays them as "Queued Locally (Unsynced)", preventing false claims of confirmed central ledger credit until server acknowledgement is received.

### 4.2 Idempotency & Replay Defense
- Every offline collection transaction generates an immutable `idempotencyKey` (UUIDv4) at the precise moment the scale and analyzer readings are accepted by the operator.
- When network connectivity returns, the batch push endpoint `POST /api/v1/sync/push` processes the queue.
- If a transaction was already received (e.g. timeout on previous attempt), the server identifies the duplicate `idempotencyKey`, returns the cached transaction, and prevents duplicate debit/credit postings to `customer_ledger_entries`.

---

## 5. DOUBLE-ENTRY FINANCIAL INTEGRITY & ZERO-RAZORPAY INVARIANT

### 5.1 Strict Farmer Payout Quarantine
- Third-party payment gateways (including Razorpay) are **STRICTLY PROHIBITED** from executing farmer milk payout disbursements.
- Razorpay SDKs and API keys are quarantined exclusively to Super Admin AMC subscription renewals (`services/backend/src/presentation/routes/super-admin.routes.ts`).
- All farmer milk intake credits are posted directly to the internal double-entry subledger:
  - Account: `MILK_CREDIT` (Liability to Farmer)
  - Offsetting: Inventory / Milk Inward asset.
- Payouts are executed via direct bank batch transfer files or cash register receipts generated through Dairy Admin.

---

## 6. IMMUTABLE AUDIT TRAIL & OPERATOR ACCOUNTABILITY

Every collection transaction recorded at the kiosk captures an immutable forensic trail:
1. `operator_id`: Authenticated staff member operating the kiosk counter.
2. `center_id` & `session_id`: Specific village center and active shift session.
3. `customer_id` & `farmer_code`: Verified farmer identifier.
4. `verification_method`: Recorded as `FACE`, `RFID`, or `MANUAL_OVERRIDE`. If manual override is used, the reason is logged.
5. `gross_weight_kg`, `tare_weight_kg`, `net_weight_kg`: Raw scale metrics.
6. `fat_percentage`, `snf_percentage`, `clr_density`: Direct analyzer metrics.
7. `rate_per_liter` & `total_cost`: Authoritative rate chart pricing locked at transaction time.
8. `created_at` & `synced_at`: Timestamp difference proves offline queue duration.
9. `receipt_number`: Monotonically incrementing serial identifier.

---

## 7. SECURITY AUDIT CHECKLIST

| Security Control | Implementation Mechanism | Audit Result |
|---|---|---|
| **Kiosk Multi-Tenant Guard** | JWT validation + `req.user.organizationId` scoping | VERIFIED PASSED |
| **Cross-Dairy Query Block** | Mismatched tenant headers/params return HTTP 403 | VERIFIED PASSED |
| **Web Serial Origin Safety** | Requires explicit user gesture + HTTPS context | VERIFIED PASSED |
| **RFID Buffer Timing Guard** | Rejects keystroke streams exceeding 60ms interval | VERIFIED PASSED |
| **Sensor Biological Bounds** | Rejects FAT < 2% or > 15%, SNF < 6% or > 12% | VERIFIED PASSED |
| **Scale Stability Lock** | Rejects dynamic `US` packets; requires `ST` lock | VERIFIED PASSED |
| **Biometric Secrecy** | AES-256-GCM encryption with 16-byte AAD tag | VERIFIED PASSED |
| **Biometric Match Safety** | SFace INT8 calibrated threshold $\ge 0.363$ | VERIFIED PASSED |
| **Offline Idempotency** | Client-generated UUIDv4 prevents duplicate credits | VERIFIED PASSED |
| **Zero Razorpay for Farmers** | Farmer payouts isolated to double-entry ledger | VERIFIED PASSED |
| **Forensic Audit Logging** | Operator, center, device, and method captured | VERIFIED PASSED |
