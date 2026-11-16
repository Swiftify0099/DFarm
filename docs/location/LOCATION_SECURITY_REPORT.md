# DFarm — Location Security & Privacy Report

## 1. Customer GPS Privacy

### Ephemeral Usage
- The customer's real GPS coordinates are used **solely** for real-time proximity discovery against the registered dairy database.
- Coordinates are **never written to persistent storage** during the discovery phase.
- The registration record (`customers` table) stores the farmer's self-reported village/address, not raw GPS coordinates.
- No historical location breadcrumbs or tracking vectors are maintained.

### HTTPS Enforcement
- In production, Geolocation APIs (`navigator.geolocation` on web, `expo-location` on native) strictly require secure contexts (HTTPS or localhost).
- Location requests over plaintext HTTP are rejected by modern mobile OS and browser runtimes.

---

## 2. Server-Side Distance Authority

### No Client-Calculated Distance Trust
- The client sends raw `lat` and `lng` to `GET /api/v1/dairies/nearby`.
- The **backend calculates distance** via the Haversine formula in PostgreSQL.
- The client receives pre-computed `distanceKm`, `distanceMeters`, and `distanceLabel` values.
- Distance calculations performed client-side (e.g. in `locationService.calculateDistanceKm()`) are used only as a secondary display fallback when backend distance is absent, never for eligibility or authorization decisions.

---

## 3. Dairy Selection & Registration Security

### Server-Side Validation
- The `dairyId` submitted during registration is validated against the `organizations` table:
  1. Dairy record must exist.
  2. Dairy status must not be `SUSPENDED`, `DELETED`, or `DISABLED`.
  3. The associated collection center must belong to that organization.
- Arbitrary or forged `dairyId` values are rejected with HTTP 404 / 400.

### Tenant Isolation
- Every customer record is stamped with `organization_id`.
- SQL queries across all services enforce `WHERE organization_id = $session_dairy_id`.
- Dairy Admins cannot view, approve, or interact with customers registered to other dairies.
- Collection App tokens are scoped to a specific `organization_id` and `center_id`.

---

## 4. API Abuse Prevention

### Rate Limiting Considerations
- The `/api/v1/dairies/nearby` endpoint is an unauthenticated public route (required for new farmer onboarding).
- Recommendations for production deployment:
  - Apply Express rate limiter: maximum 30 requests per minute per IP.
  - Coordinate bounds validation: reject requests with `lat < -90` or `lat > 90` before hitting the database.
  - Radius cap: clamp `radiusKm` to a maximum of 200 km to prevent full-table denial-of-service scans.

### Information Exposure
- The `/nearby` endpoint exposes only public dairy information:
  - Dairy name, code, village, district, state
  - Primary contact phone
  - Distance and coordinates (necessary for map display)
- **Sensitive data excluded:** Admin passwords, hashed credentials, bank account details, internal member IDs, financial metrics, and operational readiness checklists are never returned in public discovery responses.

---

## 5. Security Checklist

| Control | Status | Evidence |
|---------|--------|----------|
| Coordinates range-validated (-90..90, -180..180) | ✅ Passed | CHECK constraints + route validation |
| Suspended dairies excluded from discovery | ✅ Passed | `UPPER(o.status) NOT IN ('SUSPENDED', ...)` |
| Deleted dairies excluded | ✅ Passed | Filtered in SQL |
| Customer GPS not permanently stored | ✅ Passed | No GPS columns in `customers` table |
| Multi-tenant boundary enforced | ✅ Passed | `organization_id` FK on all customer records |
| Server authority on distance | ✅ Passed | PostgreSQL Haversine computes all distances |
| Admin credentials masked/excluded | ✅ Passed | Only public contact info in `/nearby` response |
