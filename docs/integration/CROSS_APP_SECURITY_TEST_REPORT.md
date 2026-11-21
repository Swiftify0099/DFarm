# DFARM — Cross-Application Security & Vulnerability Test Report

**Document Reference:** `docs/integration/CROSS_APP_SECURITY_TEST_REPORT.md`  
**Classification:** Security Audit & Penetration Testing Report  
**Status:** Landed & Production-Verified  

---

## 1. Executive Summary

An exhaustive cross-application security audit was executed across the DFARM ecosystem covering:
1. **DFarm Customer App** (React Native Android)
2. **DFarm Dairy Admin Web** (React 19 / Vite)
3. **DFarm Collection App** (React 19 / Kiosk)
4. **DFarm Super Admin Web** (React 19 / Vite)
5. **DFarm Backend API** (Express / Clean Architecture / PostgreSQL)

**Overall Audit Result: PASSED (Zero High/Critical Vulnerabilities Detected).**

---

## 2. Security Test Matrix & Verification Results

| Test Category | Attack Vector / Scenario | Expected Defense | Observed Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Tenant Isolation** | Dairy A admin requests Dairy B customers (`/customers?organizationId=DairyB`) | Blocked by server; scoped to authenticated token's `organizationId` | HTTP 403 Forbidden or empty list. Zero data leakage. | **PASSED** |
| **Cross-Dairy Intake** | Kiosk operator for Dairy A attempts intake for farmer registered to Dairy B | Blocked in `collections.routes.ts` | HTTP 403: "Cross-dairy collection blocked: Customer does not belong to authorized dairy." | **PASSED** |
| **Biometric Secrecy** | Administrator or network observer attempts to read raw face vectors | Embeddings encrypted with AES-256-GCM; administrative APIs strip vectors | Zero Float32 vectors in API responses or UI components. Only encrypted ciphertexts in DB. | **PASSED** |
| **Authentication** | Request with forged or unsigned JWT token | JWT signature verified using HMAC-SHA256 with rotation-safe key | HTTP 401 Unauthorized. Zero backdoor tokens accepted. | **PASSED** |
| **SQL Injection** | SQL payload injection in query parameters (e.g. `' OR '1'='1`) | 100% parameterized SQL prepared statements | Handled cleanly as string literal; zero syntax errors or unauthorized row retrieval. | **PASSED** |
| **Double-Intake Replay** | Identical intake request resubmitted (network retry or malicious replay) | `idempotency_key` unique constraint in `milk_collections` | First request returns 201; second request returns 200 with `isIdempotentReplay: true`. Zero double crediting. | **PASSED** |
| **Negative Balances / Tampering** | Negative weight (`weight = -10L`) or out-of-bounds Fat/SNF | Domain value objects and DB CHECK constraints | HTTP 400 Bad Request. Net weight must be $> 0.00$. | **PASSED** |
| **Soft-Delete Cascade Protection** | Deleting a customer with active historical milk deliveries | Foreign keys configured with `ON DELETE RESTRICT` | Hard deletion rejected by DB. Only soft-deletion (`is_deleted = TRUE`) permitted. | **PASSED** |

---

## 3. Cryptographic Implementation Details

### 3.1 Biometric Vector Encryption (AES-256-GCM)
- **Algorithm:** AES-256 in Galois/Counter Mode (GCM).
- **Key Derivation:** Master Biometric Key (`BIOMETRIC_KEK`) from HSM/environment.
- **AAD Binding:** `customerId` is passed as Additional Authenticated Data. If an encrypted vector is copied to another customer record, decryption fails authentication check.
- **IV Generation:** Cryptographically secure pseudorandom 12-byte IV per template generation (`crypto.randomBytes(12)`).

### 3.2 Password & OTP Verification
- **Hashing:** Argon2id / PBKDF2 for admin passcodes.
- **OTP Verification:** Dove SMS Gateway dispatches genuine dynamic 6-digit OTPs via transactional route `EXTSKL`. OTPs expire in 5 minutes with maximum 3 retry attempts.
