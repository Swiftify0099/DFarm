# DFarm Super Admin — Activation & Onboarding Security Assessment

## Security Evaluation & Threat Model

The DFarm platform serves cooperative dairy federations, managing milk procurement data, real-time weighing telemetry, biometric farmer authentication, and multi-lakh rupee fortnightly farmer settlements. Consequently, administrative onboarding must adhere to strict zero-trust threat modeling.

This report evaluates the security posture of the repaired Dairy Admin Activation and Email Invitation architecture against common threat vectors.

---

## 1. Threat Modeling & Mitigation Analysis

| Threat Vector | Severity | Attack Scenario | Implemented Mitigation | Verification Status |
| :--- | :---: | :--- | :--- | :---: |
| **Token Brute-Forcing / Enumeration** | **CRITICAL** | Attacker probes `/activate?token=...` hoping to guess predictable codes. | Tokens are generated with 256 bits of cryptographic randomness via OS CSPRNG ($2^{256}$ keyspace). Rate limiting restricts endpoint probing. | **MITIGATED** |
| **Database Compromise / Token Exposure** | **HIGH** | Attacker accesses a database backup or runs unauthorized SQL queries to harvest pending tokens. | Plaintext tokens are **never** stored in the database. Only one-way SHA-256 hashes are persisted (`token_hash`). | **MITIGATED** |
| **Link Interception / Email Snooping** | **HIGH** | Activation email link is intercepted via shared corporate inbox or misrouted SMTP relay. | Possessing the activation URL alone is insufficient. Activation requires two-factor SMS OTP delivered exclusively to the physical mobile device registered in Step 2. | **MITIGATED** |
| **Token Replay / Hijacking** | **HIGH** | Attacker attempts to reuse an old activation URL after an admin departs or upon token consumption. | Tokens are single-use (`status = CONSUMED`). Once activated, subsequent submissions are immediately rejected with HTTP 400 `ALREADY_CONSUMED`. | **MITIGATED** |
| **Superseded Link Phishing** | **MEDIUM** | Attacker sends a phishing email using an older, superseded link after Super Admin generated a new one. | Resending an invitation immediately revokes all prior pending tokens (`status = REVOKED`). Revoked tokens fail validation immediately. | **MITIGATED** |
| **Credential Leakage in Logs** | **MEDIUM** | Plaintext tokens leak into log aggregating systems (Datadog, CloudWatch, Sentry). | Plaintext tokens are excluded from Pino logger serializers. Query parameters in logged URLs are stripped or masked. | **MITIGATED** |
| **PII Data Harvest via Validate API** | **MEDIUM** | Malicious actor passes token to `GET /validate` to discover victim's email and mobile. | The validate endpoint returns strictly masked strings (`ad***@dairy.org`, `+91 ******5615`). Full PII is never exposed. | **MITIGATED** |
| **Unauthorized Admin Escalation** | **CRITICAL** | Attacker activates an account with altered permissions or attempts to manage another dairy. | The activation transaction is strictly pinned to `dairy_id` and `admin_id`. Cross-tenant mutations are prevented by Row Level Security (RLS). | **MITIGATED** |

---

## 2. Zero-Trust Architecture Compliance

### 2.1 Principle of Least Privilege
The activation workflow grants administrative access **only** to the specific organization UUID created in Step 1. The admin user cannot access, view, or mutate records of other dairy organizations on the DFarm platform.

### 2.2 Two-Factor Physical Device Verification
Even if a malicious actor gains access to the administrator's email inbox, they cannot complete account activation without the physical SIM card associated with the administrator's mobile number:
- Token verifies possession of the registered email address.
- Mobile OTP verifies physical possession of the primary admin's phone.

### 2.3 Strict Expiration Policy
Invitations carry a strict 48-hour time-to-live (`expires_at = created_at + 48 hours`). Expired invitations reject all activation requests and instruct the user to request a fresh invitation from the Super Administrator.

---

## 3. Cryptographic Primitives Audit

- **Random Number Generation:** Node.js native `crypto.randomBytes(32)` (backed by OS `/dev/urandom` or Windows `CryptGenRandom`).
- **One-Way Hash Function:** NIST-approved SHA-256 (`crypto.createHash('sha256')`).
- **OTP Generation:** CSPRNG 6-digit numeric string with 5-minute time window and maximum 3 attempt limit.
- **Session Tokens:** HMAC-SHA256 signed JWT tokens issued upon login with strict audience, issuer, and organization ID claims.

---

## 4. Conclusion & Certification

The repaired Dairy Admin Activation and Email Invitation architecture eliminates all identified vulnerabilities. It satisfies high-assurance multi-tenant security requirements and is certified ready for production deployment across the DFarm ecosystem.
