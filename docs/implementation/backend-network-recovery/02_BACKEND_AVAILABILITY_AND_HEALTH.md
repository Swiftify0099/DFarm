# DFarm — Priority 0: Backend Availability and Health Report

**Execution Reference:** DFARM-PRIORITY-00-BACKEND-NETWORK-RECOVERY  
**Document:** `02_BACKEND_AVAILABILITY_AND_HEALTH.md`  
**Timestamp:** 2026-11-19T13:31:00+05:30  
**Backend Status:** HEALTHY & LISTENING  

---

## 1. Process & Port Audit

| Component | Target Port | Active Process PID | Listening Address | Entrypoint | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Backend REST API** | `4000` | `8896` | `::` (All IPv4/IPv6) | `node services/backend/dist/server.js` | **ACTIVE / HEALTHY** |
| **Platform Hub Proxy**| `3000` | `20324` | `::` (All IPv4/IPv6) | `node scripts/dev-server.js` | **ACTIVE / HEALTHY** |
| **Super Admin Web** | `5173` | `22960` | `::1` (Loopback) | `apps/dfarm-super-admin` | **ACTIVE** |
| **Dairy Admin Web** | `5174` | `21280` | `::1` (Loopback) | `apps/dfarm-dairy-admin` | **ACTIVE** |
| **Collection Terminal**| `5175` | `17292` | `::1` (Loopback) | `apps/dfarm-collection-app` | **ACTIVE** |
| **Customer App Web** | `8081` | `30692` | `::` (All IPv4/IPv6) | `apps/dfarm-customer-app` (Metro) | **ACTIVE** |

---

## 2. Health Endpoint Verification

### Root Service Probe (`GET /`)
- **URL:** `http://localhost:4000/`
- **HTTP Status:** `200 OK`
- **Payload Evidence:**
  ```json
  {
    "success": true,
    "service": "DFarm Smart Dairy API",
    "status": "UP",
    "health": "/health/live",
    "timestamp": "2026-11-19T07:43:16.134Z"
  }
  ```

### API Liveness Probe (`GET /health/live`)
- **URL:** `http://localhost:4000/health/live`
- **HTTP Status:** `200 OK`
- **Payload Evidence:**
  ```json
  {
    "success": true,
    "data": {
      "status": "UP",
      "service": "DFarm Smart Dairy API"
    }
  }
  ```

### API v1 Scoped Health Probe (`GET /api/v1/health`)
- **URL:** `http://localhost:4000/api/v1/health`
- **HTTP Status:** `200 OK`
- **Rate-Limiting:** Excluded from rate limiter to protect infrastructure probes from 429 throttling.

---

## 3. Deployment Configuration Verification

- **Render Spec (`render.yaml`):**
  - Service: `dfarm-backend`
  - Build Command: `npm install && npm run build:backend`
  - Start Command: `npm run start:backend` (resolves to `node services/backend/dist/server.js`)
  - Health Path: `/health/live`
- **Node.js Engine Compatibility:** Verified Node `>=22.0.0` runtime requirement.
