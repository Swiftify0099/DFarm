# DFARM MULTI-DAIRY CUSTOMER IDENTITY & SWITCHING — EXISTING IMPLEMENTATION AUDIT

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Audit Stage:** Stage 1 — Existing Implementation Gap Audit  
**Date:** November 18, 2026  
**Auditor:** DFarm Core Platform & Identity Architecture Team  
**System Target:** `apps/dfarm-customer-app`, `services/backend`, `packages/database`, `supabase/migrations`

---

## 1. Executive Summary

This audit assesses the current state of Multi-Dairy Customer Identity, Multi-Tenant Database Architecture, Dairy Registration, Location-Based Discovery, and Dairy Switching across the DFarm platform.

Prior to this implementation:
1. **Customer Authentication:** OTP authentication operated with real cryptographic generation and Dove SMS dispatch. However, customer verification in `VerifyCustomerOtpUseCase` assumed a single customer record per phone number, utilizing `customerRepository.findByPhone()` which returned only the first matching record across all tenant databases.
2. **Central Identity Index:** The central control plane database (`dfarm_central`) lacked a canonical `global_customer_identities` table and a formal `customer_dairy_memberships` directory. Instead, an ad-hoc table `customer_tenant_lookup` existed in `PostgresCustomerRepository.ts` keyed strictly by `customer_id UUID PRIMARY KEY`, causing overwrite or non-deterministic resolution when a phone number was registered across multiple dairies.
3. **Multi-Dairy Registration:** While tenant databases enforced `uq_customer_mobile_per_org UNIQUE (organization_id, normalized_mobile_number)` within a single tenant database, there was no mechanism for a customer with an existing registration in Dairy A to discover their accounts, register in Dairy B, and independently maintain memberships in both.
4. **Customer App UI:** The Customer App (`apps/dfarm-customer-app`) included Mobile Login, OTP Verification, Dairy Discovery, Farmer Registration, and Dashboard/Passbook screens. However, it completely lacked:
   - "Your Dairy Accounts" (Multi-Dairy Membership selection screen post-OTP)
   - "Switch Dairy" modal/screen
   - "Add New Dairy / Register With Another Dairy" entry points for already authenticated customers
   - Multi-dairy session and query cache isolation on switch.

---

## 2. Comprehensive Component Audit & Classification Matrix

Every feature is classified according to the required taxonomy:
- **`FULLY IMPLEMENTED AND VERIFIED`**
- **`IMPLEMENTED BUT DEFECTIVE`**
- **`PARTIALLY IMPLEMENTED`**
- **`NOT IMPLEMENTED`**
- **`BLOCKED`**
- **`NOT VERIFIED`**

| Module / Capability | Existing Status | Source Reference | Audit Findings & Defect Description |
|---|---|---|---|
| **E.164 Phone Normalization** | FULLY IMPLEMENTED AND VERIFIED | `services/backend/src/domain/value-objects/PhoneNumber.ts` | Validates 10-digit Indian numbers (`^[6-9]\d{9}$`) and normalizes to `+91<10digits>`. Works reliably. |
| **Dove SMS OTP Generation & Verification** | FULLY IMPLEMENTED AND VERIFIED | `services/backend/src/infrastructure/otp/DoveOtpService.ts`, `routes/auth.routes.ts` | Distributed atomic rate limiting in `otp_rate_limits`, HMAC-SHA256 hashed OTP challenges, real SMS delivery via Dove Gateway. |
| **Global Customer Identity Table** | NOT IMPLEMENTED | `supabase/migrations/` | No central table `global_customer_identities` exists in `dfarm_central`. Identity was inferred ad-hoc from tenant customer rows. |
| **Central Dairy Membership Directory** | IMPLEMENTED BUT DEFECTIVE | `services/backend/src/infrastructure/repositories/PostgresCustomerRepository.ts:425` | Ad-hoc `customer_tenant_lookup` table keyed by `customer_id PRIMARY KEY`. Does not support 1:N mapping (one phone to many dairy memberships). |
| **Per-Dairy Customer Uniqueness** | FULLY IMPLEMENTED AND VERIFIED | `supabase/migrations/004_customer_identity.sql:27` | `CONSTRAINT uq_customer_mobile_per_org UNIQUE (organization_id, normalized_mobile_number)` exists in tenant schema. |
| **Global Customer Identity FK in Tenant DB** | NOT IMPLEMENTED | `supabase/migrations/004_customer_identity.sql` | Tenant `customers` table lacked a dedicated `global_customer_id` column linking tenant profiles to the global identity anchor. |
| **Multi-Dairy OTP Post-Verification Resolution** | IMPLEMENTED BUT DEFECTIVE | `services/backend/src/application/use-cases/auth/CustomerAuthUseCases.ts:59` | Calls `customerRepository.findByPhone(phone.e164)` which picks the first matching organization via `LIMIT 1` and discards all other memberships. |
| **Customer Memberships Discovery API** | NOT IMPLEMENTED | `services/backend/src/presentation/routes/customers.routes.ts` | No endpoint exists returning all memberships (`GET /customers/memberships` or `/auth/customer/memberships`). |
| **Dairy Switch API** | NOT IMPLEMENTED | `services/backend/src/presentation/routes/auth.routes.ts` | No endpoint exists (`POST /auth/customer/select-dairy` or `POST /customers/switch-dairy`) allowing verified token rotation to another approved dairy. |
| **Nearby Dairy Discovery Backend API** | FULLY IMPLEMENTED AND VERIFIED | `services/backend/src/presentation/routes/dairies.routes.ts:552`, `GetNearbyDairiesUseCase.ts` | Proximity querying with Haversine formula, filtering active/inactive status, sorting by distance. Real Super Admin records queried. |
| **Multi-Dairy New Registration Backend Flow** | PARTIALLY IMPLEMENTED | `services/backend/src/presentation/routes/customers.routes.ts:131` | `POST /customers/register` handles single registration, but does not link to central multi-dairy membership index or allow guest token transition when already registered with another dairy. |
| **Dairy Admin Approval Sync to Central Index** | NOT IMPLEMENTED | `services/backend/src/presentation/routes/customers.routes.ts:312` | Admin approval updates tenant DB (`customers.registration_status = 'APPROVED'`), but does not update central membership directory. |
| **Tenant Operational Isolation (Ledger)** | IMPLEMENTED BUT DEFECTIVE | `services/backend/src/presentation/routes/ledger.routes.ts:47` | `getKhataSummary.execute(customerId)` did not pass `req.user.organizationId` down to repository, falling back to control plane DB query. |
| **Tenant Operational Isolation (Collections)** | IMPLEMENTED BUT DEFECTIVE | `services/backend/src/presentation/routes/collections.routes.ts:531` | `getHistoryUseCase.execute(customerId)` did not pass `organizationId`, causing scan across all tenant DBs. |
| **Tenant Operational Isolation (Bills)** | IMPLEMENTED BUT DEFECTIVE | `services/backend/src/application/use-cases/ledger/CustomerLedgerUseCases.ts:26` | `GetCustomerBillsUseCase.execute` queried central `db.query` directly instead of tenant database client. |
| **Customer App: Login Screen (Screen A)** | FULLY IMPLEMENTED AND VERIFIED | `apps/dfarm-customer-app/src/app/(auth)/login.tsx` | Approved Claymorphism design, E.164 phone validation, Dove SMS dispatch. |
| **Customer App: OTP Verification Screen** | FULLY IMPLEMENTED AND VERIFIED | `apps/dfarm-customer-app/src/app/(auth)/verify-otp.tsx` | ClayOTPInput, 60-second cooldown, auto-resend. Navigates directly to main or onboarding without membership selection. |
| **Customer App: Your Dairy Accounts (Screen B)** | NOT IMPLEMENTED | `apps/dfarm-customer-app/src/app/` | Screen missing. Customers with multiple dairies cannot see their accounts after login. |
| **Customer App: Switch Dairy Modal/Screen (Screen C)** | NOT IMPLEMENTED | `apps/dfarm-customer-app/src/app/` | Screen missing. No mechanism exists to view other memberships and switch active tenant context. |
| **Customer App: Add New Dairy Discovery (Screen D)** | PARTIALLY IMPLEMENTED | `apps/dfarm-customer-app/src/app/(onboarding)/dairy-discovery.tsx` | Exists for first-time unmapped users, but inaccessible to already-registered farmers. Lacks "Already Registered" status indicators. |
| **Customer App: New Dairy Registration (Screen E)** | FULLY IMPLEMENTED AND VERIFIED | `apps/dfarm-customer-app/src/app/(onboarding)/register.tsx` | Profile, bank, animal type, face enrollment workflow exists. Needs parameterization for multi-dairy registration. |
| **Customer App: Registration Status (Screen F)** | FULLY IMPLEMENTED AND VERIFIED | `apps/dfarm-customer-app/src/app/(onboarding)/pending-approval.tsx` | Visual timeline for pending/approved status. |
| **Customer App: Current Dairy Context in Header (Screen G)** | PARTIALLY IMPLEMENTED | `apps/dfarm-customer-app/src/app/(main)/index.tsx:44` | Displays affiliated dairy name as a static tag, but lacks touchable trigger to open Switch Dairy. |
| **Customer App: Multi-Tenant Cache Isolation** | NOT IMPLEMENTED | `apps/dfarm-customer-app/src/features/` | Query keys (`['collection']`, `['ledger']`, etc.) do not include `dairyId`, risking cross-dairy data contamination if switching occurs without cache invalidation. |

---

## 3. Detailed Architectural Gap Analysis

### 3.1 Central Database Schema Deficiencies
1. **Lack of Global Customer Master:** No table in `dfarm_central` stored the verified customer phone number independently of a specific dairy organization.
2. **Defective Lookup Index:** `customer_tenant_lookup` in `PostgresCustomerRepository.ts` used `customer_id UUID PRIMARY KEY`, preventing multiple records for the same normalized phone number.
3. **No Central Status Tracking:** When a dairy admin approved or rejected a customer registration in their tenant database, the central database remained unaware of this transition.

### 3.2 Backend Service Deficiencies
1. **Single-Tenant Assumption in Auth:** `VerifyCustomerOtpUseCase` assumed `1 Phone = 1 Customer Record = 1 Dairy`.
2. **Missing Membership API:** No endpoint allowed the mobile app to retrieve a list of all dairies associated with the customer's phone number.
3. **Missing Context Rotation API:** No secure endpoint existed to rotate a customer's JWT token to another authorized dairy without re-authenticating with OTP.
4. **Leaky Repository Queries:** Several repositories (`PostgresLedgerRepository`, `PostgresCollectionTransactionRepository`, `GetCustomerBillsUseCase`) did not strictly enforce tenant scoping using `req.user.organizationId`, instead falling back to the control plane DB or looping over all tenant DBs.

### 3.3 Customer Mobile Application Deficiencies
1. **Direct Routing Post-OTP:** `verify-otp.tsx` immediately routed approved users to `/(main)` and pending users to `/(onboarding)/pending-approval`, bypassing any membership selection.
2. **Inaccessible Multi-Dairy Features:** Once logged in, there was no UI or navigation path to register with a second dairy or switch between registered dairies.
3. **Cache Stale Risks:** React Query cache was not cleared or scoped on dairy switch, creating a critical vulnerability where Dairy A financial records could be displayed under Dairy B.

---

## 4. Remediation Plan

1. **Database Migration (`037_multi_dairy_customer_identity_and_membership.sql`):**
   - Create `global_customer_identities` table in `dfarm_central`.
   - Create `customer_dairy_memberships` table in `dfarm_central` with `UNIQUE (organization_id, global_customer_id)`.
   - Add `global_customer_id` column to tenant `customers` table with `UNIQUE (organization_id, global_customer_id)`.
   - Backfill existing tenant customer records into central identity tables.
2. **Backend Use Cases & Routes:**
   - Implement `GetCustomerMembershipsUseCase` and route `GET /api/v1/customers/memberships`.
   - Implement `SelectDairyMembershipUseCase` and route `POST /api/v1/customers/switch-dairy` and `POST /api/v1/auth/customer/select-dairy`.
   - Update `VerifyCustomerOtpUseCase` to return global customer identity and membership list.
   - Update `RegisterCustomerUseCase` to support multi-dairy registration and sync to central membership directory.
   - Update Customer Admin approval/rejection/suspension handlers to synchronize status to `customer_dairy_memberships`.
   - Enforce strict tenant database routing in `ledger.routes.ts`, `collections.routes.ts`, `bills.routes.ts`.
3. **Customer App Implementation:**
   - Implement `Your Dairy Accounts` screen (`select-dairy.tsx`).
   - Implement `Switch Dairy` modal and profile/header triggers.
   - Implement `Add New Dairy` workflow from within the app.
   - Implement cache clearing and token rotation on dairy switch.
4. **Verification & Testing:**
   - Implement comprehensive automated test suite covering all 50 acceptance criteria.
   - Verify Android typecheck and builds.
   - Compile documentation and visual QA artifacts.
