# DFARM — EXISTING FACE IMPLEMENTATION & ROOT CAUSE AUDIT

**Execution Reference:** `DFARM-FACE-1N-RECOGNITION-CUSTOMER-LEDGER-FIX`  
**Document ID:** `00_EXISTING_FACE_IMPLEMENTATION_AUDIT`  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

This audit establishes the root causes behind the three critical failures identified under execution reference `DFARM-FACE-1N-RECOGNITION-CUSTOMER-LEDGER-FIX`:
1. **Issue A:** Collection receipts and milk intake transactions failing to link accurately to the intended customer's record and ledger account.
2. **Issue B:** Collection App 1:N face biometric recognition returning `UNKNOWN_PERSON` with low similarity (`similarity: 0.0955` vs `threshold: 0.363`).
3. **Issue C:** Customer App "Test Face" button redirecting to Dashboard instead of opening the diagnostic face test screen, and Biometric Update/Re-enrollment failure.

---

## 2. Root Cause Analysis

### 2.1 Issue A — Customer ID Mismatch in Collection Intake & Ledger Posting
* **Symptom:** Milk intake receipts were created, but the transactions and ledger credits were detached from the customer's passbook or displayed under wrong identities.
* **Root Causes:**
  1. *Dual Customer Identifier Fragmentation:* Customers in DFARM possess two valid UUIDs:
     - Central global user ID: `c.global_customer_id` (used by Customer App mobile JWT auth token `req.user.userId`).
     - Tenant-specific customer profile ID: `c.id` (primary key in the tenant's `customers` table, referenced by `milk_collections.customer_id` and `customer_ledger_accounts.customer_id`).
  2. *Intake Endpoint Binding Bug:* In `collections.routes.ts`, the intake handler did not resolve the incoming customer identifier to the canonical tenant customer record before invoking `processMilkIntakeUseCase.execute`. If a client sent a global customer ID or a farmer code, the lookup failed or assigned default/stale references.
  3. *Repository Filter Exclusion:* `PostgresCustomerRepository.findById`, `PostgresLedgerRepository.findByCustomer`, `PostgresLedgerRepository.listEntries`, and `PostgresCollectionTransactionRepository.listByCustomer` only queried `c.id = $1`. When a farmer authenticated via Customer App queried `/collections/history`, `/collections/summary/monthly`, or `/ledger/entries`, their JWT token containing `req.user.userId = global_customer_id` resulted in 0 rows.

### 2.2 Issue B — Collection App 1:N Face Recognition `UNKNOWN_PERSON`
* **Symptom:** The Collection App kiosk camera captured an enrolled farmer's face, but the API returned:
  ```json
  {
    "success": true,
    "isMatch": false,
    "status": "UNKNOWN_PERSON",
    "similarity": 0.0955,
    "threshold": 0.363
  }
  ```
* **Root Causes:**
  1. *Center-Level Over-Filtering:* In `services/backend/src/presentation/routes/identity.routes.ts`, `GET /face/templates` and `POST /face/match` defaulted `centerId = req.user?.centerId`. Because collection operators are assigned to a specific kiosk center, but farmers may be enrolled at the dairy headquarters or neighboring village sub-centers, the candidate template query returned 0 enrolled templates for that center, leading to an empty gallery or fallback probe against wrong profiles.
  2. *Model Pipeline Discrepancy:* Discrepancies between face alignment landmark extraction and INT8 quantization normalization across web and backend embedders caused vector distortion when not adhering strictly to the Google Colab canonical OpenCV YuNet + SFace INT8 pipeline.

### 2.3 Issue C — Customer App Face Test & Update Navigation Deadlock
* **Symptom:** Clicking "Test Face" in the customer profile screen instantly redirected back to the Home Dashboard tab. Clicking "Update Biometrics" failed to persist.
* **Root Causes:**
  1. *Missing Sub-Route Stack Router:* In `apps/dfarm-customer-app/src/app/(main)/_layout.tsx`, tabs were configured with `<Tabs.Screen name="profile/index" />`. Expo Router tabs cannot automatically nest push navigation for sibling files (`diagnostics.tsx`, `update-face.tsx`) within the same directory without an intermediate `_layout.tsx` Stack navigator. When the router attempted to navigate to `/(main)/profile/diagnostics`, the tab navigator failed to resolve the route and defaulted to the initial route `/(main)/index` (Home Dashboard).
  2. *Missing Tenant Context in Update Payload:* Customer App biometric update route did not forward `organizationId` from `useProfile()`, causing backend tenant database resolution to reject the request.

---

## 3. Comprehensive Remediation Matrix

| Failure Mode | Component | Remedial Action Applied | Verification Status |
| :--- | :--- | :--- | :--- |
| **Issue A: Customer ID Lookup** | `PostgresCustomerRepository` | Updated `findById` to query `(c.id = $1 OR c.global_customer_id = $1)` | Verified in E2E Suite |
| **Issue A: Collection Intake Binding** | `collections.routes.ts` | Resolves canonical customer record before transaction processing; binds `c.id` | Verified in E2E Suite |
| **Issue A: Ledger Account & Entries** | `PostgresLedgerRepository` | Joins `c.global_customer_id`; auto-provisions ledger account if missing | Verified in E2E Suite |
| **Issue A: Transaction Listing & Summary** | `PostgresCollectionTransactionRepository` | Joins `c.global_customer_id`; uses ISO date range `[startDate, endDate]` | Verified in E2E Suite |
| **Issue B: 1:N Dairy-Wide Gallery** | `identity.routes.ts` | Removed center-level filter; loads all active enrolled templates across Dairy | Verified in E2E Suite |
| **Issue B: 1:1 Diagnostic Test** | `identity.routes.ts` | Added `targetCustomerId` branch for read-only 1:1 test verification | Verified in E2E Suite |
| **Issue C: Stack Navigation** | `dfarm-customer-app` | Created `(main)/profile/_layout.tsx` Stack router; mounts `profile` tab | Verified in TypeScript & Router |
| **Issue C: Biometric Re-enrollment** | `customers.routes.ts` | Accepts `organizationId || dairyId`; marks previous enrollment `SUPERSEDED` | Verified in E2E Suite |

---
*Signed & Verified by DFARM Architectural Engineering Team*
