# DFARM PLATFORM: AUTHENTICATION & SESSION ARCHITECTURE

**Architecture Document Reference:** `DFARM-ARCH-AUTH-001`  
**Version:** 1.0.0 — Production Specification  
**Applies to:** Super Admin, Dairy Admin, Collection App, Customer App & Backend  
**Security Standard:** Cryptographic Multi-Factor / OTP, Distributed Atomic Cooldown, HMAC-SHA256 JWT  
**Author:** DFarm Security Architecture & Platform Engineering Team  
**Date:** November 17, 2026  

---

## 1. Architectural Overview

The DFarm authentication architecture provides a unified, hardened identity framework across the web portals and mobile applications. It replaces legacy client-simulated hashes and mock generators with real server-side cryptographic tokens, multi-tenant context resolution, distributed rate limiting, and role-segregated sessions.

```mermaid
flowchart TD
    subgraph Clients["Client Applications"]
        SA["Super Admin Web"]
        DA["Dairy Admin Web"]
        CK["Collection Kiosk Web"]
        CA["Customer Mobile App"]
    end

    subgraph AuthGateway["Authentication Gateway (services/backend)"]
        RL["Distributed Cooldown Check (PostgreSQL)"]
        OTP["Cryptographic OTP Engine (crypto.randomInt)"]
        SMS["Dove SMS Gateway / DLT Provider"]
        SMTP["Transactional SMTP Email Engine"]
        JWT["HMAC-SHA256 Token Service"]
    end

    subgraph Storage["Authoritative Control Plane (dfarm_central)"]
        ORL["otp_rate_limits (Atomic Cooldown)"]
        OAC["admin/customer_otp_challenges"]
        USERS["users (Platform & Operational Accounts)"]
        INV["dairy_admin_invitations"]
        MAP["dairy_database_mappings"]
    end

    CA -->|1. Request OTP (+91 E.164)| RL
    CK -->|1. Request OTP| RL
    DA -->|1. Request OTP| RL
    SA -->|1. Request OTP| RL

    RL -->|Check & Reserve 60s| ORL
    RL -->|Generate 6-digit OTP| OTP
    OTP -->|HMAC-SHA256 Hash| OAC
    OTP -->|Dispatch SMS| SMS
    
    CA -->|2. Verify OTP + Purpose| JWT
    CK -->|2. Verify OTP + Purpose| JWT
    DA -->|2. Verify OTP + Purpose| JWT
    SA -->|2. Verify OTP + Purpose| JWT

    JWT -->|Verify Hash & Attempts| OAC
    JWT -->|Lookup User / Tenant| USERS
    JWT -->|Issue Role-Bound JWT| Clients
```

---

## 2. Phone Number Standards & E.164 Normalization

All phone numbers across administrative, operational, and customer endpoints must be normalized to international E.164 standard prior to any database lookup or OTP generation:
- Local Indian input: `9822000001`, `09822000001`, `+91 98220-00001`
- Normalized output: `+919822000001`
- Validation Rule: Must start with `+91` followed by exactly 10 digits starting with `6`, `7`, `8`, or `9`.

---

## 3. Cryptographic OTP Lifecycle & Distributed Cooldown

### 3.1 Secure Generation
- **Algorithm:** Node.js `crypto.randomInt(100000, 1000000)` produces an unpredictable 6-digit integer string.
- **HMAC Hashing:** Stored as `HMAC-SHA256(rawOtp, secret)` in `admin_otp_challenges` or `customer_otp_challenges`.
- **Timing-Safe Verification:** Evaluated using `crypto.timingSafeEqual` to prevent side-channel timing attacks.
- **Validity Window:** Strict 300 seconds (5 minutes).
- **Max Invalid Attempts:** Capped at 5 attempts; 5th failure marks challenge `is_used = true` and invalidates token.

### 3.2 Distributed Atomic Cooldown Engine
To eliminate process-local memory bypasses across multi-instance clusters, cooldown is enforced atomically in PostgreSQL:
```sql
SELECT last_requested_at, 
       EXTRACT(EPOCH FROM (NOW() - last_requested_at))::integer AS elapsed_seconds
FROM otp_rate_limits
WHERE phone = $1;
```
If `elapsed_seconds < 60`, request is rejected with `DomainValidationError` stating exact remaining seconds.
Atomic reservation executes:
```sql
INSERT INTO otp_rate_limits (phone, purpose, last_requested_at, request_count, ip_address)
VALUES ($1, $2, NOW(), 1, $3)
ON CONFLICT (phone) DO UPDATE
SET last_requested_at = NOW(),
    purpose = EXCLUDED.purpose,
    request_count = otp_rate_limits.request_count + 1,
    ip_address = EXCLUDED.ip_address;
```

### 3.3 Zero Preview OTP in Production
`previewOtp` is strictly gated to `process.env.NODE_ENV === 'test' && config.ALLOW_TEST_PREVIEW_OTP`. In production environments, `previewOtp` is undefined and omitted from API responses.

---

## 4. JWT Architecture & Token Standards

### 4.1 Token Structure & Claims
Access tokens are signed using `HMAC-SHA256` with strong 256-bit server secret (`JWT_SECRET` / `ADMIN_OTP_SECRET`).
- `userId`: UUID of user or customer.
- `role`: One of the 8 authoritative roles (`SUPER_ADMIN`, `PRIMARY_DAIRY_ADMIN`, `DAIRY_ADMIN`, `COLLECTION_OPERATOR`, `SUPERVISOR`, `FARMER_CUSTOMER`, `GUEST_FARMER`, `PLATFORM_OPERATOR`).
- `actorType`: `'STAFF'` or `'CUSTOMER'`.
- `organizationId`: UUID of assigned Dairy (null for Super Admin / Platform Operator).
- `centerId`: UUID of collection center (for operators).
- `farmerCode`: Unique customer code (for approved farmers).
- `exp`: 3,600 seconds (1 hour).

### 4.2 Refresh Token Lifecycle
- Refresh tokens are long-lived (7 days) and single-purpose (`purpose: 'REFRESH_TOKEN'`).
- Exchanging refresh token at `POST /api/v1/auth/refresh-token` validates signature, verifies user active status in PostgreSQL, and issues a fresh 1-hour access token.

---

## 5. Security Gates & Dev Bypass Purge

1. **Elimination of Unauthenticated Dev Identity:**
   The legacy fallback in `requireSuperAdminRole` that injected default `SUPER_ADMIN` identity when `NODE_ENV !== 'production'` has been completely removed. All requests must present a valid `Authorization: Bearer <token>`.
2. **Operational Purge Protection:**
   Destructive purge endpoints (`DELETE /api/v1/dairies/purge/phone/:phone`) are permanently disabled in production runtime and return `403 Forbidden`. In test environments, they require Super Admin authorization.
3. **Platform Operator Least Privilege:**
   Platform Operators are explicitly barred from modifying tenant databases, publishing policies, or viewing unmasked customer financial records.
