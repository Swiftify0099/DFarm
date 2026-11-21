# DFarm — Prompt 02 Implementation Plan

**Document ID:** DFARM-PLAN-002  
**Phase:** Prompt 02 — Super Admin Production Readiness, Dairy Lifecycle, Geolocation, Hardware Inventory & AMC Management  
**Status:** APPROVED ARCHITECTURAL PLAN  
**Date:** 2026-11-17  
**Author:** DFarm Principal Solution Architect & Engineering Team  

---

## 1. Plan Overview & Objectives

This implementation plan bridges the Prompt 01 foundation with full production readiness for the central DFarm Super Admin platform, adhering strictly to:
- **No UI Redesign:** All existing screens, Claymorphism styling, and components remain identical.
- **No Volatile / Fake Data:** Removal of `mockBackend.ts` delegations; real PostgreSQL control-plane data sources.
- **Physical Multi-Tenant Database Engine:** Preservation of the database-per-dairy topology and Prompt 01 provisioning state machine.
- **Razorpay Scope Boundary:** Razorpay is used exclusively for AMC payments.

---

## 2. Database Migrations Required

### Migration `032_central_super_admin_features.sql` (Control Plane Track)
Target Track: `CONTROL_PLANE` in `dfarm_central`.

Tables created / extended:
1. **`platform_audit_logs`:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `actor_id UUID NOT NULL`
   - `actor_role VARCHAR(50) NOT NULL`
   - `actor_name VARCHAR(150)`
   - `action VARCHAR(100) NOT NULL` (e.g. `DAIRY_CREATED`, `DAIRY_SUSPENDED`, `DEVICE_ASSIGNED`, `AMC_ACTIVATED`)
   - `entity_type VARCHAR(50) NOT NULL` (`DAIRY`, `DEVICE`, `AMC`, `USER`)
   - `entity_id VARCHAR(100) NOT NULL`
   - `details JSONB DEFAULT '{}'::jsonb`
   - `ip_address VARCHAR(50)`
   - `status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS'`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
2. **`central_hardware_inventory`:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `serial_number VARCHAR(100) NOT NULL UNIQUE`
   - `device_category VARCHAR(50) NOT NULL` (`RFID_READER`, `ANALYZER`, `WEIGHING_SCALE`, `COLLECTION_KIOSK`, `CAMERA`)
   - `manufacturer VARCHAR(100) NOT NULL`
   - `model VARCHAR(100) NOT NULL`
   - `status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE'` (`AVAILABLE`, `ASSIGNED`, `MAINTENANCE`, `FAULTY`, `RETIRED`)
   - `assigned_dairy_id UUID REFERENCES organizations(id) ON DELETE RESTRICT`
   - `assigned_at TIMESTAMPTZ`
   - `warranty_until TIMESTAMPTZ`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
3. **`hardware_assignment_history`:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `device_id UUID NOT NULL REFERENCES central_hardware_inventory(id) ON DELETE CASCADE`
   - `dairy_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT`
   - `action VARCHAR(50) NOT NULL` (`ASSIGNED`, `UNASSIGNED`, `MAINTENANCE_RETURN`)
   - `actor_id UUID`
   - `notes TEXT`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
4. **`amc_plans`:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `name VARCHAR(100) NOT NULL`
   - `duration_months INTEGER NOT NULL CHECK (duration_months > 0)`
   - `price_inr NUMERIC(12, 2) NOT NULL CHECK (price_inr >= 0)`
   - `description TEXT`
   - `is_active BOOLEAN NOT NULL DEFAULT TRUE`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
5. **`amc_subscriptions`:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `dairy_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT`
   - `plan_id UUID NOT NULL REFERENCES amc_plans(id) ON DELETE RESTRICT`
   - `start_date DATE NOT NULL`
   - `expiry_date DATE NOT NULL`
   - `status VARCHAR(50) NOT NULL DEFAULT 'PENDING_PAYMENT'` (`PENDING_PAYMENT`, `ACTIVE`, `RENEWAL_DUE`, `EXPIRED`, `REACTIVATED`)
   - `payment_status VARCHAR(50) NOT NULL DEFAULT 'UNPAID'` (`UNPAID`, `PAID`, `REFUNDED`)
   - `razorpay_order_id VARCHAR(100)`
   - `razorpay_payment_id VARCHAR(100)`
   - `amount_paid NUMERIC(12, 2)`
   - `activated_at TIMESTAMPTZ`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
6. **`platform_alerts`:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `severity VARCHAR(30) NOT NULL DEFAULT 'INFO'` (`INFO`, `WARNING`, `CRITICAL`)
   - `title VARCHAR(255) NOT NULL`
   - `description TEXT NOT NULL`
   - `source VARCHAR(100) NOT NULL` (`SYNC_ENGINE`, `DATABASE_PROVISIONER`, `HARDWARE`, `SYSTEM`)
   - `dairy_id UUID REFERENCES organizations(id) ON DELETE SET NULL`
   - `status VARCHAR(30) NOT NULL DEFAULT 'OPEN'` (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`)
   - `acknowledged_at TIMESTAMPTZ`
   - `acknowledged_by UUID`
   - `resolved_at TIMESTAMPTZ`
   - `resolved_by UUID`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
7. **`dairy_bank_details`:**
   - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
   - `organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE`
   - `bank_name VARCHAR(150) NOT NULL`
   - `account_number_encrypted TEXT NOT NULL`
   - `account_number_masked VARCHAR(30) NOT NULL`
   - `ifsc_code VARCHAR(20) NOT NULL`
   - `account_holder_name VARCHAR(150) NOT NULL`
   - `is_verified BOOLEAN NOT NULL DEFAULT FALSE`
   - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
   - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

---

## 3. Backend Implementation Modules (`services/backend`)

### 3.1 Super Admin Authentication Repair
- File: `services/backend/src/application/use-cases/auth/AdminAuthUseCases.ts`
- Fix: Check if user role is `SUPER_ADMIN`. If `SUPER_ADMIN`, do not require `organization_id` assignment to a single dairy cooperative. Sign JWT token with role `'SUPER_ADMIN'` and platform administration capabilities.

### 3.2 Super Admin Backend Router (`/api/v1/super-admin/*`)
- Mount in `services/backend/src/presentation/routes/super-admin.routes.ts`:
  - `GET /dashboard/metrics`: Real platform KPIs (total dairies, active, suspended, pending onboarding, hardware units, sync health, open alerts).
  - `GET /dashboard/analytics`: Real monthly onboarding growth and geographic distribution.
  - `GET /audit`: Real platform audit logs with pagination and action filtering.
  - `GET /alerts`: Real platform alerts with status and severity filters.
  - `POST /alerts/:id/acknowledge`: Acknowledge alert.
  - `POST /alerts/:id/resolve`: Resolve alert.
  - `GET /health`: Comprehensive platform health (control plane, active tenant pools, PostgreSQL connection latency).
  - `GET /hardware`: List hardware inventory with filters (status, category, dairy).
  - `POST /hardware`: Register new physical device (serial number, manufacturer, model, category, warranty).
  - `POST /hardware/:id/assign`: Assign device to an active Dairy and record assignment history.
  - `POST /hardware/:id/unassign`: Unassign device.
  - `PATCH /hardware/:id/status`: Update device lifecycle status (Maintenance, Faulty, Retired).
  - `GET /amc/plans`: List AMC plans.
  - `POST /amc/plans`: Create AMC plan.
  - `GET /amc/subscriptions`: List dairy subscriptions with expiry status.
  - `POST /amc/subscriptions`: Create or renew dairy AMC subscription.
  - `POST /amc/subscriptions/:id/create-order`: Create Razorpay payment order.
  - `POST /amc/subscriptions/:id/verify-payment`: Verify Razorpay signature and activate subscription.
  - `GET /admins`: List primary dairy admins across all dairies with activation status.

### 3.3 Enhanced Dairy Onboarding & Bank Details Encryption
- File: `services/backend/src/presentation/routes/dairies.routes.ts`
- Encrypt and store bank account details in `dairy_bank_details` with AES-256-GCM.
- Mask bank account numbers in API responses (e.g. `XXXX-XXXX-1234`).
- Log audit event in `platform_audit_logs`.

### 3.4 Geolocation & Customer App Verification
- Verify `GET /api/v1/dairies/nearby` properly accepts customer coordinates, uses Haversine distance, excludes suspended dairies, and is wired into the Customer App without hardcoding.

---

## 4. Frontend Integration (`apps/dfarm-super-admin`)

- Update `apps/dfarm-super-admin/src/api/client.ts`:
  - Remove all delegations to `mockBackend.ts`.
  - Connect all queries and mutations to the real backend endpoints.
  - Surface truthful error states when backend calls fail.
  - Display genuine empty states when lists are empty.
  - Remove browser `localStorage` mock database reliance.

---

## 5. Automated Verification Plan

Create `services/backend/tests/super-admin-production.test.js` covering:
- **Test Group A: Super Admin Authentication & Platform Authorization**
  - Super Admin login via OTP.
  - Super Admin token validation and access control on `/api/v1/super-admin/*`.
  - Rejection of unauthorized users and non-Super-Admin roles.
- **Test Group B: Real Super Admin Dashboard & Audit Trail**
  - KPI metrics and analytics sourced directly from `dfarm_central`.
  - Resolution of the 8 vs 9 dairy count discrepancy.
  - Immutable platform audit logging for sensitive actions.
- **Test Group C: Dairy Onboarding, Provisioning & Bank Details Encryption**
  - Complete dairy onboarding with map pin coordinates and masked bank details.
  - Idempotent provisioning via Prompt 01 state machine.
  - Dual activation tokens and primary admin assignment.
- **Test Group D: Geolocation & Nearby Dairy Discovery**
  - Coordinate validation and accurate Haversine distance sorting.
  - Exclusion of suspended and closed dairies.
- **Test Group E: Central Hardware Inventory & Dairy Assignment**
  - Duplicate serial number rejection.
  - Assignment to an active dairy and state update.
  - Prevention of double-assignment and assignment to suspended dairies.
- **Test Group F: AMC & Subscription Lifecycle (with Razorpay Signature Verification)**
  - AMC plan creation and dairy subscription creation.
  - Expiry date calculation and status transitions.
  - Verified Razorpay signature handling and rejection of forged signatures.
