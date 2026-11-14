# DFarm API Gateway & REST Endpoint Specification
**Phase 05 Authoritative Contract — Core Backend Service, Authentication & REST APIs**

---

## 1. Global API Standards

- **Base URL:** `/api/v1`
- **Payload Format:** `application/json; charset=utf-8`
- **Transport Security:** HTTPS (TLS 1.3)
- **Standard Authentication Header:**
  ```http
  Authorization: Bearer <jwt_access_token>
  ```
- **Optional Center Header:**
  ```http
  X-Center-ID: <dairy_center_uuid>
  ```

### Response Envelopes

Every API endpoint responds with a standardized JSON envelope.

#### Standard Success Envelope (2xx)
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "5bee2ace-b1c6-47a2-91e9-8efdc906e91f",
    "timestamp": "2026-11-13T16:20:00.000Z"
  }
}
```

#### Standard Error Envelope (4xx, 5xx)
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_MOBILE_NUMBER",
    "message": "Customer with mobile number +919876529387 already exists in this organization",
    "details": [ ... ]
  },
  "meta": {
    "requestId": "2ea5d80e-ab38-41e7-8f11-7cef769a2f63",
    "timestamp": "2026-11-13T16:20:01.000Z"
  }
}
```

---

## 2. Global Security & Rate Limiting

- **Helmet Security Headers:** Content-Security-Policy, HSTS, X-Frame-Options (`SAMEORIGIN`), X-Content-Type-Options (`nosniff`).
- **CORS Policy:** Strict allowlist via `CORS_ALLOWED_ORIGINS` (e.g., `http://localhost:3000,http://localhost:5173`).
- **Rate Limiting:** 
  - Standard Draft-7 headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`).
  - Configurable window (`RATE_LIMIT_WINDOW_MS`) and max requests (`RATE_LIMIT_MAX_REQUESTS`).
  - HTTP 429 `RATE_LIMIT_EXCEEDED` on breach.
- **Request Context & Correlation:**
  - Auto-generated UUID `X-Request-Id` attached to every request and returned in response headers and envelope meta.
- **Structured Redacted Logging:**
  - Pino HTTP logger automatically masks `Authorization`, passwords, tokens, encryption keys, and secrets.

---

## 3. Health & Liveness Endpoints

### 3.1 Process Liveness Probe
- **Method & Path:** `GET /health/live` or `GET /api/v1/health/live`
- **Authentication:** None (Public)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "status": "UP",
      "timestamp": "2026-11-13T16:20:00.000Z"
    },
    "meta": {
      "requestId": "uuid",
      "timestamp": "..."
    }
  }
  ```

### 3.2 Readiness Probe
- **Method & Path:** `GET /health/ready` or `GET /api/v1/health/ready`
- **Authentication:** None (Public)
- **Checks Verified:**
  - Environment Configuration: `OK`
  - Supabase Administrative Client: `OK`
  - PostgreSQL Database Connectivity: `OK`
- **Security Invariant:** Never returns credentials, database connection strings, or service keys.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "status": "READY",
      "checks": {
        "env": "OK",
        "supabase": "OK",
        "database": "OK"
      },
      "timestamp": "2026-11-13T16:20:00.000Z"
    },
    "meta": {
      "requestId": "uuid",
      "timestamp": "..."
    }
  }
  ```

---

## 4. Error Code Directory

| HTTP Status | Error Code | Description |
|:---|:---|:---|
| 400 | `VALIDATION_ERROR` | Request payload failed Zod schema validation rules. |
| 401 | `UNAUTHORIZED` | Missing or malformed `Authorization: Bearer <token>` header. |
| 401 | `INVALID_TOKEN` | Bearer token signature is invalid or token has expired. |
| 401 | `INVALID_CREDENTIALS` | Login username/password is incorrect. |
| 403 | `FORBIDDEN` | Authenticated user lacks required role or permissions. |
| 403 | `UNMAPPED_IDENTITY` | Token identity does not exist in `users` or `customers` tables. |
| 403 | `ACCOUNT_SUSPENDED` | User or customer account status is `SUSPENDED`. |
| 403 | `ACCOUNT_DELETED` | Customer profile has been soft-deleted. |
| 403 | `CENTER_ACCESS_DENIED` | Staff user has no assignment to target dairy center. |
| 404 | `NOT_FOUND` | Target entity, record, or URL route was not found. |
| 409 | `DUPLICATE_MOBILE_NUMBER` | Mobile number already exists for another customer in this organization. |
| 429 | `RATE_LIMIT_EXCEEDED` | Request rate limit exceeded. |
| 500 | `INTERNAL_SERVER_ERROR` | Unhandled runtime exception masked safely for client. |
