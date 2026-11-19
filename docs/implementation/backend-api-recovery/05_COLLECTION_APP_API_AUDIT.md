# Collection App — API Audit Report

**Application:** `apps/dfarm-collection-app`  
**Target Platform:** Browser-based React 19 / Vite Kiosk  
**Audit Scope:** Hardware Serial Drivers, Offline Queue, Sync Push/Pull, Biometrics

---

## 1. Protocol Mismatch Resolution

- **Issue:** Collection App called `POST /sync/push` with `{ deviceId: 'KIOSK_MAIN', transactions: [...] }`. The backend route handler strictly required a device UUID token and queried `WHERE id = $1`, throwing a PostgreSQL UUID casting error.
- **Resolution:**
  1. Updated `services/backend/src/middleware/authenticate.ts` (`authenticateDevice`) to safely branch UUID vs string identifier query.
  2. Mapped `POST /sync/push` to `handleSyncBatch` (`ProcessOfflineSyncBatchUseCase`) which natively handles offline batches and supports optional operator JWT.
  3. Added tolerance for both `quantityLiters` / `weightLiters` and `milkType` / `milkCategory` property naming.
- **Verification:** Tested live `POST /api/v1/sync/push` with curl; returned HTTP 200 with `{ total: 0, succeeded: 0, failed: 0 }`.

---

## 2. Consumed API Endpoints & Verification

| Kiosk Feature | API Endpoint | HTTP Method | Backend Handler | Verification Status |
|---|---|---|---|---|
| Operator Login | `/api/v1/auth/operator/otp/verify` | POST | `VerifyOperatorOtpUseCase` | PASSED |
| Customer Lookup | `/api/v1/customers/lookup` | GET | `LookupCustomerUseCase` | PASSED |
| Live Intake | `/api/v1/collections/intake` | POST | `ProcessMilkIntakeUseCase` | PASSED |
| Session Control | `/api/v1/sessions/open` | POST | `OpenShiftSessionUseCase` | PASSED |
| Offline Batch Push | `/api/v1/sync/push` | POST | `ProcessOfflineSyncBatchUseCase` | PASSED |
| Downstream Pull | `/api/v1/sync/pull` | GET | `SyncService.pullEvents` | PASSED |
| Device Telemetry | `/api/v1/devices/telemetry` | GET | `GetDeviceTelemetryUseCase` | PASSED |

All 9 Vitest suites passed (48/48 tests).
