# DFarm Admin Web Dashboard — API Integration Specification

## 1. Authentication & Session Management
All requests to the backend include standard Bearer authorization:
```http
Authorization: Bearer <jwt-token>
X-Request-Id: <uuidv4>
```

### Endpoints:
- `POST /api/v1/auth/login`: Authenticates staff members with username/password or quick-switch QA presets. Returns token, user profile, and assigned centers.
- `GET /api/v1/auth/me`: Validates session validity and refreshes user permission claims.

---

## 2. Dashboard Endpoints
- `GET /api/v1/dashboard/metrics`:
  - **Query Params**: `centerId` (optional), `date` (YYYY-MM-DD).
  - **Response**: Aggregates all 15 operational KPIs including cow/buffalo split, shift totals, receivables, advances, stock alerts, and terminal fleet counts.
- `GET /api/v1/dashboard/overview`: High-level executive snapshot.

---

## 3. Customer Management Endpoints
- `GET /api/v1/customers`: Search, center filter, status filter, and pagination.
- `GET /api/v1/customers/:id`: Full KYC profile.
- `GET /api/v1/customers/:id/face-status`: Enrollment metadata without raw vector arrays.
- `GET /api/v1/customers/:id/rfid-status`: Active RFID card UID and assignment status.
- `GET /api/v1/customers/:id/subledger`: Customer double-entry ledger statement.
- `POST /api/v1/customers/:id/soft-delete`: Audited customer deactivation.
- `POST /api/v1/customers/:id/restore`: Reinstates soft-deleted farmer profile.

---

## 4. Milk Collection Endpoints
- `GET /api/v1/collections/shift-summary`: Live metrics for active shift (Total weight, count, gross value, average Fat, average SNF).
- `GET /api/v1/collections/history`: Filterable collection intake register with measurement sources (`AUTO_SCALE_BRIDGE`, `MANUAL`).
- `GET /api/v1/collections/sessions/:id/receipt`: 40-column thermal slip ASCII text.
- `POST /api/v1/collections/sessions/:id/adjust`: Audited supervisor adjustment with delta calculations and compensating journal entries.

---

## 5. Rate Management Endpoints
- `GET /api/v1/rates`: List configured rate charts.
- `GET /api/v1/rates/:id/versions`: List rate chart versions.
- `GET /api/v1/rates/:id/versions/:vId`: Returns complete Fat $\times$ SNF matrix cells.
- `PUT /api/v1/rates/:id/versions/:vId/matrix`: Updates matrix cell rates for draft versions.
- `POST /api/v1/rates/:id/versions/:vId/submit`: Submits draft version for approval.
- `POST /api/v1/rates/:id/versions/:vId/approve`: Approves submitted version.
- `POST /api/v1/rates/:id/versions/:vId/publish`: Locks and publishes version as active pricing standard.
- `POST /api/v1/rates/calculate`: Authoritative backend pricing calculation simulator.

---

## 6. Accounting & Billing Endpoints
- `GET /api/v1/billing/periods`: List billing periods and statuses.
- `POST /api/v1/billing/periods`: Initializes a new 10-day or monthly billing cycle.
- `POST /api/v1/billing/periods/:id/generate`: Generates authoritative farmer statements with feed/advance deductions.
- `POST /api/v1/billing/:id/submit-review`: Submits bill for supervisor verification.
- `POST /api/v1/billing/:id/approve`: Approves farmer bill.
- `POST /api/v1/billing/:id/finalize`: Cryptographically seals bill (SHA-256).
- `POST /api/v1/billing/:id/adjust`: Pre-finalization adjustments with audit reasons.
- `GET /api/v1/billing/:id/pdf`: Downloads binary PDF settlement statement.

---

## 7. Payments & Reconciliation Endpoints
- `POST /api/v1/payments/payouts`: Issues individual payout voucher.
- `POST /api/v1/payments/payouts/:id/approve`: Four-eye approval.
- `POST /api/v1/payments/payouts/:id/confirm`: Confirms bank UTR reference.
- `POST /api/v1/payments/batches`: Groups approved bills into bulk settlement batch.
- `POST /api/v1/reconciliation/import`: Imports bank statement lines for automatic reference matching.

---

## 8. Devices & Downstream Sync Endpoints
- `GET /api/v1/devices`: Lists provisioned hardware terminals and offline approval status.
- `POST /api/v1/devices/:id/approve-offline`: Signs offline authorization envelope (up to 72 hours).
- `POST /api/v1/devices/revoke`: Revokes device registration token.
- `GET /api/v1/sync/conflicts`: Surfaces synchronization conflicts for manual audit.
- `GET /api/v1/sync/events`: Downstream mutation event stream for edge terminal cache invalidation.

---

## 9. Reports Endpoints
- `GET /api/v1/reports/daily-collections`: Daily intake registers.
- `GET /api/v1/reports/monthly-collections`: Monthly aggregates.
- `GET /api/v1/reports/farmer-wise`: Farmer-specific performance summaries.
- `GET /api/v1/reports/cow-buffalo`: Category comparative metrics.
- `GET /api/v1/reports/fat-snf`: Quality distribution bands.
- `GET /api/v1/ledger/reports/register`: Double-entry accounting register.
- `GET /api/v1/ledger/reports/balances`: Customer payable & receivable aging.
