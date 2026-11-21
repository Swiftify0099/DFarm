# DFARM — ROADMAP PHASE 10: API CONTRACT MAP

**Document ID:** `ROADMAP-PHASE-10-DOC-013`  
**Execution Phase:** Roadmap Phase 10 — Cross-App Integration, End-to-End Business Workflows & Data Consistency  
**Target Path:** `docs/implementation/ROADMAP_PHASE_10_API_CONTRACT_MAP.md`  
**Date:** 2026-11-18  
**Classification:** Cross-Application API Contract Matrix  

---

## 1. Executive Summary

This document maps all backend API routes invoked by the four DFarm client applications, detailing their HTTP contracts, authentication scopes, database targets, and operational verification statuses.

---

## 2. API Contract Specification Matrix

### 2.1 Customer App Endpoints (`apps/dfarm-customer-app`)

| Method & Route | Auth & Roles | Target DB | Request / Query | Response Summary | Verification Status |
|:---|:---|:---|:---|:---|:---|
| `POST /api/v1/auth/customer/otp/request` | Public | `dfarm_central` | `{ mobileNumber }` | `{ status: 'OTP_SENT', retryAfterSeconds: 60 }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/auth/customer/otp/verify` | Public | `dfarm_central` | `{ mobileNumber, otp }` | `{ token, refreshToken, customerId, isRegistered }` | **IMPLEMENTED AND TESTED** |
| `GET /api/v1/customers/discover-dairies` | Customer JWT | `dfarm_central` | `?latitude=...&longitude=...&radius=50` | `[{ id, code, name, latitude, longitude, distanceKm }]` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/customers/register` | Customer JWT | `dfarm_central` + Tenant DB | `{ fullName, mobileNumber, primaryCenterId, address, bankDetails }` | `{ id, registrationStatus: 'PENDING_APPROVAL' }` | **IMPLEMENTED AND TESTED** |
| `GET /api/v1/customers/me/profile` | Customer JWT | Tenant DB | None | `{ id, farmerCode, fullName, status, registrationStatus, bankDetails }` | **IMPLEMENTED AND TESTED** |
| `GET /api/v1/collections/customer/:id` | Customer JWT (Ownership) | Tenant DB | `?startDate=...&endDate=...&shift=...` | `[{ id, date, shift, category, liters, fat, snf, rate, amount }]` | **IMPLEMENTED AND TESTED** |
| `GET /api/v1/customers/me/passbook` | Customer JWT | Tenant DB | `?limit=50&offset=0` | `{ currentBalance, transactions: [{ date, type, debit, credit, utrNumber }] }` | **IMPLEMENTED AND TESTED** |
| `GET /api/v1/customers/me/bills` | Customer JWT | Tenant DB | `?year=2026` | `[{ id, periodStart, periodEnd, grossAmount, deductions, netPayable, status }]` | **IMPLEMENTED AND TESTED** |

---

### 2.2 Dairy Admin Endpoints (`apps/dfarm-dairy-admin`)

| Method & Route | Auth & Roles | Target DB | Request / Query | Response Summary | Verification Status |
|:---|:---|:---|:---|:---|:---|
| `POST /api/v1/auth/dairy/login` | Public | `dfarm_central` | `{ username, password, dairyCode }` | `{ token, refreshToken, user: { id, role, organizationId } }` | **IMPLEMENTED AND TESTED** |
| `GET /api/v1/customers/pending` | `DAIRY_OWNER`, `CENTER_MANAGER` | Tenant DB | None | `[{ id, fullName, normalizedMobileNumber, address, registeredAt }]` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/customers/:id/approve` | `DAIRY_OWNER`, `CENTER_MANAGER` | Tenant DB | `{ farmerCode: 'C-101' }` | `{ id, farmerCode, status: 'ACTIVE', registrationStatus: 'APPROVED' }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/customers/:id/reject` | `DAIRY_OWNER`, `CENTER_MANAGER` | Tenant DB | `{ reason: 'Incomplete KYC' }` | `{ id, registrationStatus: 'REJECTED' }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/customers/:id/biometrics/face` | `DAIRY_OWNER`, `CENTER_MANAGER` | Tenant DB | `{ embeddingVector128d, modelVersion: 'SFACE-128' }` | `{ templateId, status: 'ENROLLED' }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/customers/:id/rfid` | `DAIRY_OWNER`, `CENTER_MANAGER` | Tenant DB | `{ rfidCardNumber: 'E2001928' }` | `{ customerId, rfidCardNumber, assignedAt }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/rate-charts` | `DAIRY_OWNER` | Tenant DB | `{ name, milkCategory, pricingType, matrix/formula }` | `{ id, version: 1, isActive: true }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/billing/periods` | `DAIRY_OWNER`, `ACCOUNTANT` | Tenant DB | `{ startDate, endDate, cycleType }` | `{ id, status: 'DRAFT', startDate, endDate }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/billing/periods/:id/generate` | `DAIRY_OWNER`, `ACCOUNTANT` | Tenant DB | None | `{ billPeriodId, totalFarmers, totalLiters, totalAmount }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/billing/periods/:id/finalize` | `DAIRY_OWNER` | Tenant DB | None | `{ billPeriodId, status: 'FINALIZED', finalizedAt }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/payments/batches` | `ACCOUNTANT` (Maker) | Tenant DB | `{ billingPeriodId }` | `{ id, batchNumber, totalAmount, status: 'DRAFT' }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/payments/batches/:id/approve` | `DAIRY_OWNER` (Checker) | Tenant DB | None | `{ id, status: 'APPROVED', approvedBy, approvedAt }` | **IMPLEMENTED AND TESTED** |
| `GET /api/v1/payments/batches/:id/export` | `DAIRY_OWNER`, `ACCOUNTANT` | Tenant DB | `?format=NEFT_STANDARD` | Stream CSV (`text/csv`, `X-Checksum-SHA256`) | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/payments/batches/:id/reconcile` | `DAIRY_OWNER`, `ACCOUNTANT` | Tenant DB | Multipart / CSV Return File | `{ reconciledCount, settledCount, rejectedCount }` | **IMPLEMENTED AND TESTED** |

---

### 2.3 Collection Kiosk Endpoints (`apps/dfarm-collection-app`)

| Method & Route | Auth & Roles | Target DB | Request / Query | Response Summary | Verification Status |
|:---|:---|:---|:---|:---|:---|
| `POST /api/v1/rfid/lookup` | Kiosk Token | Tenant DB | `{ rfidCardNumber }` | `{ customerId, farmerCode, fullName, status, permittedCategories }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/collections/sessions` | Kiosk Token | Tenant DB | `{ centerId, shiftType, businessDate }` | `{ id, sessionState: 'INITIALIZED' }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/collections/sessions/:id/complete` | Kiosk Token | Tenant DB | `{ customerId, weightKg, fat, snf, milkCategory }` | `{ id, totalAmount, ratePerLiter, receiptText, snapshot }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/sync/push` | Kiosk Device Token | Tenant DB | `{ deviceId, centerId, events: [...] }` | `{ applied: [...], conflicts: [...], results: [...] }` | **IMPLEMENTED AND TESTED** |
| `GET /api/v1/sync/pull` | Kiosk Device Token | Tenant DB | `?deviceId=...&cursor=...` | `{ downstreamCursor, customers: [...], cards: [...] }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/sync/acknowledge` | Kiosk Device Token | Tenant DB | `{ deviceId, downstreamCursor }` | `{ status: 'ACKNOWLEDGED', acknowledgedCursor }` | **IMPLEMENTED AND TESTED** |

---

### 2.4 Super Admin Endpoints (`apps/dfarm-super-admin`)

| Method & Route | Auth & Roles | Target DB | Request / Query | Response Summary | Verification Status |
|:---|:---|:---|:---|:---|:---|
| `GET /api/v1/super-admin/tenants` | `SUPER_ADMIN` | `dfarm_central` | None | `[{ id, code, name, dbHost, dbName, status, createdAt }]` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/super-admin/tenants` | `SUPER_ADMIN` | `dfarm_central` | `{ name, code, dbConfig, adminUser }` | `{ id, code, status: 'PROVISIONED' }` | **IMPLEMENTED AND TESTED** |
| `GET /api/v1/super-admin/rate-policies` | `SUPER_ADMIN` | `dfarm_central` | None | `[{ id, policyCode, name, policyType, versions: [...] }]` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/super-admin/rate-policies` | `SUPER_ADMIN` | `dfarm_central` | `{ policyCode, name, policyType }` | `{ id, status: 'DRAFT' }` | **IMPLEMENTED AND TESTED** |
| `POST /api/v1/super-admin/rate-policies/versions/:id/publish` | `SUPER_ADMIN` | `dfarm_central` | None | `{ id, status: 'PUBLISHED', publishedAt }` | **IMPLEMENTED AND TESTED** |
| `GET /api/v1/super-admin/telemetry/health` | `SUPER_ADMIN` | `dfarm_central` | None | `{ centralDb: 'HEALTHY', tenantPools: [...], uptimeSeconds }` | **IMPLEMENTED AND TESTED** |

---

## 3. Operational Classification Legend

- **IMPLEMENTED AND TESTED:** Fully functional code with automated integration test coverage.
- **IMPLEMENTED BUT NOT VERIFIED:** Code exists in codebase but awaits live staging verification.
- **BLOCKED BY EXTERNAL PROVIDER:** Requires third-party corporate agreement, credentials, or live sandbox (e.g. SBI CMP SFTP host, live IMPS penny-drop bank API).
- **BLOCKED BY PHYSICAL HARDWARE:** Requires physical USB serial device (e.g. weighing scale, optical analyzer); tested via software simulation.
