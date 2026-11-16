# DFarm Dairy Admin Web — Tenant Security & Isolation Report

## 1. Multi-Tenant Threat Model & Security Boundaries

DFarm is a multi-tenant platform where multiple independent dairy businesses (cooperatives, private dairies) operate simultaneously. The Dairy Admin Web application is the administrative boundary for **one specific dairy tenant**.

### Critical Threat Vectors Mitigated

| Threat | Description | Architectural Mitigation |
|---|---|---|
| **Cross-Tenant Data Exposure** | Dairy Admin A attempts to view customer records, milk rates, or ledger balances of Dairy B. | **Strict Backend Scoping:** Frontend cannot choose or alter its `dairyId`. The JWT token issued by the backend embeds the cryptographic `dairyId`. Every query and mutation is filtered by `dairy_id = req.user.dairyId`. |
| **Tampering with Financial Balances** | Operator attempts to directly edit customer balance via DOM or API payloads. | **Server-Authoritative Double-Entry Ledger:** Balance columns are read-only views computed from immutable transactional ledger rows. Adjustments require operator authorization, mandatory rationale (min 5 chars), and diff logging. |
| **Biometric Template Theft** | Unauthorized actors attempt to exfiltrate facial vector embeddings or customer photos from admin console. | **Zero-Knowledge Admin Console:** Only cryptographic hashes, model version identifiers (OpenCV YuNet + SFace ONNX), and quality scores are transmitted to the browser. Raw photos and embeddings are never exposed. |
| **Session Hijacking / Replay** | Replaying expired or stolen sessions to access dairy transactions. | **Ephemeral JWTs + Strict Inactivity Expiration:** Auth state includes token expiration timestamps. Mobile OTP rate-limiting locks attempts after 3 consecutive failures for 15 minutes. |
| **Duplicate Billing Fraud** | Issuing duplicate bills for the same period to debit customer twice or collect duplicate payouts. | **Transactional Database Constraints:** The backend enforces a composite unique key `(dairy_id, customer_id, period_start, period_end)`. Duplicate attempts are rejected immediately. |

---

## 2. One-Primary-Admin-Per-Dairy Enforcement

- The primary Dairy Admin account is provisioned exclusively by Super Admin during tenant onboarding.
- The Dairy Admin Web platform strictly prevents a Dairy Admin from creating another primary Dairy Admin for the same dairy.
- Secondary staff (Shift Supervisors, Collection Operators, Accountants) receive granular operational roles adhering strictly to the principle of least privilege.
