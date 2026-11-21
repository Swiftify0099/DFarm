# CORS, Authentication and Tenant Routing Audit

**Execution Reference:** DFARM-MASTER-BACKEND-API-RECOVERY

---

## 1. CORS Preflight & Header Whitelist

| Header Name | Required By | Previously Whitelisted | Current Status |
|---|---|---|---|
| `Content-Type` | All Apps | Yes | APPROVED |
| `Authorization` | All Apps | Yes | APPROVED |
| `X-Request-Id` | All Apps | Yes | APPROVED |
| `Accept` | All Apps | Yes | APPROVED |
| `X-Dairy-Tenant-ID` | Customer App | Yes | APPROVED |
| `X-Dairy-Id` | Dairy Admin / Collection App | **No (Caused Network Error)** | **APPROVED & VERIFIED** |
| `X-Client-App` | Client Telemetry | **No** | **APPROVED & VERIFIED** |
| `X-Client-Version` | Client Telemetry | **No** | **APPROVED & VERIFIED** |
| `X-Device-Id` | Kiosk Hardware / Sync | **No** | **APPROVED & VERIFIED** |
| `X-Idempotency-Key` | Milk Intake & Ledger | **No** | **APPROVED & VERIFIED** |

---

## 2. Authentication Hierarchy

- **Platform Super Admin:** HMAC-SHA256 JWT containing role `SUPER_ADMIN`, scopes `platform:admin`, `dairies:manage`. Validated against central user directory.
- **Dairy Admin:** HMAC-SHA256 JWT containing `organizationId`, role `PRIMARY_DAIRY_ADMIN`. Grants administrative access strictly to the assigned tenant database.
- **Kiosk Counter Operator:** HMAC-SHA256 JWT containing `centerId`, role `CENTER_OPERATOR`. Authorizes collection intake and session opening.
- **Farmer Customer:** HMAC-SHA256 JWT containing `customerId`, verified mobile number, and active dairy membership context.
