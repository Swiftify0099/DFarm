# DFARM — PROMPT 06 HANDOFF SPECIFICATION

**Document ID:** `DFARM-HANDOFF-06-001`  
**From Phase:** Prompt 05 (Customer App / Farmer Mobile Experience)  
**To Phase:** Prompt 06 (Production Deployment, Live WebSockets, Observability & Platform Hardening)  
**Date:** November 17, 2026  
**Status:** READY FOR PROMPT 06 COMMENCEMENT  

---

## 1. Executive Summary & Foundation Delivered

The Prompt 05 implementation has completed the farmer mobile experience (`apps/dfarm-customer-app`) and its full backend and database integration across the DFarm ecosystem.

All four client applications and the backend platform now operate against real data contracts with zero mock bypasses:
1. `apps/dfarm-super-admin` — Super Admin Platform Management (Prompt 02).
2. `apps/dfarm-dairy-admin` — Dairy Operational Platform (Prompt 03).
3. `apps/dfarm-collection-app` — Counter Kiosk Intake Terminal (Prompt 04).
4. `apps/dfarm-customer-app` — Farmer Mobile Experience (Prompt 05).
5. `services/backend` — Clean Architecture Backend with Tenant Database Routing.
6. `packages/database` — Central Control-Plane & Tenant Schema Migrations.

---

## 2. Completed Prompt 05 Deliverables

The next engineer entering Prompt 06 can rely on the following verified components:

| Area | Verified Implementation | Key Code Artifacts |
| :--- | :--- | :--- |
| **Authentication & OTP** | Cryptographic 6-digit OTP, 60s cooldown, E.164 phone normalization, `GUEST_FARMER` & `FARMER_CUSTOMER` JWT roles. | `services/backend/src/infrastructure/otp/DoveOtpService.ts`<br>`apps/dfarm-customer-app/src/app/(auth)/login.tsx` |
| **GPS Dairy Discovery** | Haversine proximity query (`GET /dairies/nearby`), ascending distance sorting, manual search fallback. | `services/backend/src/application/use-cases/organizations/GetNearbyDairiesUseCase.ts`<br>`apps/dfarm-customer-app/src/app/(auth)/select-dairy.tsx` |
| **Registration & Approval** | Self-registration (`POST /customers/register`), `PENDING` gating, Dairy Admin approval (`PATCH /customers/:id/approve`), unique code generation. | `services/backend/src/presentation/routes/customers.routes.ts`<br>`apps/dfarm-customer-app/src/app/(auth)/register.tsx` |
| **Facial Biometrics** | YuNet INT8 face detector + SFace INT8 embedder (128-dim normalized vector); zero synthetic fallbacks in production. | `apps/dfarm-customer-app/src/face-ai/yunet-detector.ts`<br>`apps/dfarm-customer-app/src/face-ai/sface-embedder.ts` |
| **Passbook & Subledger** | Daily milk collection passbook, real-time running balance (`GET /ledger/balance`), credit/debit double-entry. | `services/backend/src/presentation/routes/collections.routes.ts`<br>`services/backend/src/presentation/routes/ledger.routes.ts` |
| **Bills & Cattle Feed** | Periodic billing statements (10-day/monthly), store feed purchase ledger, deductions tracking. | `services/backend/src/presentation/routes/bills.routes.ts`<br>`services/backend/src/presentation/routes/feed.routes.ts` |
| **Bank Beneficiary Security** | Server-side masking (`XXXX-XXXX-1234`), strict ownership guards, RBI IFSC regex (`^[A-Z]{4}0[A-Z0-9]{6}$`). | `services/backend/src/presentation/routes/customers.routes.ts`<br>`apps/dfarm-customer-app/src/app/(main)/profile/index.tsx` |
| **Gateway Quarantine** | Verified 0 Razorpay dependencies in mobile app; Razorpay strictly quarantined to Super Admin AMC subscriptions. | `apps/dfarm-customer-app/package.json`<br>`services/backend/src/presentation/routes/super-admin.routes.ts` |
| **Notifications** | PostgreSQL tenant notification storage, event triggers on intake/approval/billing, unread counter & read state. | `services/backend/src/presentation/routes/notifications.routes.ts`<br>`apps/dfarm-customer-app/src/app/(main)/notifications/index.tsx` |

---

## 3. Testing & Verification Baseline

Before beginning any work in Prompt 06, run the following commands to confirm clean baseline health:

```bash
# 1. Backend Build & Static Analysis
npm --prefix services/backend run build

# 2. Customer App Production Verification Suite (42 tests)
node --test services/backend/tests/customer-app-production.test.js

# 3. Complete Monorepo Regression Test Suites (254 tests total)
node --test services/backend/tests/clean-architecture.test.js
node --test services/backend/tests/super-admin-production.test.js
node --test services/backend/tests/dairy-admin-production.test.js
node --test services/backend/tests/collection-kiosk-production.test.js
npm --prefix apps/dfarm-customer-app test
npm --prefix apps/dfarm-customer-app run typecheck
npm --prefix apps/dfarm-collection-app test
npm --prefix apps/dfarm-dairy-admin test
npm --prefix apps/dfarm-super-admin test
npm --prefix packages/database test
```

---

## 4. Key Directives & Invariants for Prompt 06

1. **Zero UI Redesign Policy:** Strict preservation of Claymorphism design language, tokens (`#FF6A00`, `#211B18`, `#FFF5EE`), and layout structures across all four applications.
2. **Database-Per-Dairy Invariant:** Under no circumstances should tenant data be merged into a single multi-tenant schema. Each dairy maintains an independent PostgreSQL database.
3. **No Direct Database Connections:** Kiosk and Mobile applications MUST communicate exclusively via the Backend REST/WebSocket API over TLS. Direct PostgreSQL connections from clients are strictly forbidden.
4. **Zero Razorpay for Farmers:** Payment gateways must remain strictly quarantined to Super Admin AMC subscriptions. Farmers receive direct bank transfers through cooperative accounts.
5. **Clean Architecture Boundary Protection:** Presentation layer depends on Application layer, Application on Domain. Infrastructure implements Application ports. No domain leaks.

---

## 5. Documentation References

The complete implementation audit and verification trail is documented in `docs/implementation/`:
- `PROMPT_05_PRE_IMPLEMENTATION_INSPECTION.md`
- `PROMPT_05_IMPLEMENTATION_PLAN.md`
- `PROMPT_05_CUSTOMER_AUTH_VERIFICATION.md`
- `PROMPT_05_GPS_DAIRY_DISCOVERY_VERIFICATION.md`
- `PROMPT_05_CUSTOMER_REGISTRATION_VERIFICATION.md`
- `PROMPT_05_MOBILE_BIOMETRIC_VERIFICATION.md`
- `PROMPT_05_PASSBOOK_BILLING_FEED_VERIFICATION.md`
- `PROMPT_05_BANK_BENEFICIARY_SECURITY.md`
- `PROMPT_05_NOTIFICATION_VERIFICATION.md`
- `PROMPT_05_CROSS_APP_VERIFICATION.md`
- `PROMPT_05_TEST_REPORT.md`
- `PROMPT_05_IMPLEMENTATION_REPORT.md`
- `PROMPT_06_HANDOFF.md`
