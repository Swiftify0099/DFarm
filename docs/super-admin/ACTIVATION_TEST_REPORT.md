# DFarm Super Admin — Activation & Real Email Test Execution Report

## Test Execution Summary

- **Test Suite Date:** November 16, 2026
- **Test Target:** Guided Dairy Onboarding, Cryptographic Activation Token, Real Email Delivery, SPA Deep-Linking, Mobile OTP, Atomic Activation, and Resend Flow.
- **Total Test Cases Executed:** 125
- **Pass Rate:** **100% (125 / 125 Passed, 0 Failed)**
- **Workspaces Validated:**
  - `services/backend` (Clean Architecture + Activation Workflow)
  - `packages/database` (Supabase Schema Migrations)
  - `apps/dfarm-super-admin` (Guided Onboarding Modal + Detail View)
  - `apps/dfarm-dairy-admin` (Activation Page + Mobile OTP Authentication)
  - `apps/dfarm-collection-app` & `apps/dfarm-customer-app` (Non-regression validation)

---

## 1. Test Execution Breakdown by Workspace

| Workspace / Module | Test Runner | Suites | Tests | Status | Duration |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Backend Activation Workflow** (`dairy-activation-workflow.test.js`) | Node Test Runner | 1 | 13 | **PASS** | 4.75s |
| **Backend Clean Architecture** (`clean-architecture.test.js`) | Node Test Runner | 1 | 9 | **PASS** | 4.94s |
| **Database Migrations** (`schema-validation.test.js`) | Node Test Runner | 1 | 13 | **PASS** | 0.54s |
| **Super Admin Web** (`apps/dfarm-super-admin`) | Vitest v5.1 | 5 | 26 | **PASS** | 8.87s |
| **Dairy Admin Web** (`apps/dfarm-dairy-admin`) | Vitest v5.1 | 5 | 14 | **PASS** | 9.82s |
| **Collection App** (`apps/dfarm-collection-app`) | Vitest v5.1 | 7 | 30 | **PASS** | 23.10s |
| **Customer App** (`apps/dfarm-customer-app`) | Jest | 5 | 20 | **PASS** | 7.66s |
| **TOTALS** | | **25** | **125** | **100% PASS** | **59.68s** |

---

## 2. Dedicated Activation Workflow Test Cases (`dairy-activation-workflow.test.js`)

All 13 test scenarios in `services/backend/tests/dairy-activation-workflow.test.js` passed successfully:

```
TAP version 13
# Subtest: DFarm Dairy Admin Activation & Real Email Workflow Test Suite
    # Subtest: setup backend test server
    ok 1 - setup backend test server
    # Subtest: should reject dairy creation when businessEmail is missing
    ok 2 - should reject dairy creation when businessEmail is missing
    # Subtest: should reject dairy creation when businessEmail is malformed
    ok 3 - should reject dairy creation when businessEmail is malformed
    # Subtest: should reject dairy creation when primary admin mobile is invalid
    ok 4 - should reject dairy creation when primary admin mobile is invalid
    # Subtest: should provision dairy tenant and return 256-bit activation token & link
    ok 5 - should provision dairy tenant and return 256-bit activation token & link
    # Subtest: should validate activation token and return masked admin metadata
    ok 6 - should validate activation token and return masked admin metadata
    # Subtest: should reject invalid or non-existent token with INVALID_TOKEN
    ok 7 - should reject invalid or non-existent token with INVALID_TOKEN
    # Subtest: should dispatch activation OTP for valid invitation
    ok 8 - should dispatch activation OTP for valid invitation
    # Subtest: should atomically activate Primary Dairy Admin with valid token and OTP
    ok 9 - should atomically activate Primary Dairy Admin with valid token and OTP
    # Subtest: should reject already consumed token on second activation attempt
    ok 10 - should reject already consumed token on second activation attempt
    # Subtest: should return ALREADY_CONSUMED on validate endpoint for used token
    ok 11 - should return ALREADY_CONSUMED on validate endpoint for used token
    # Subtest: should reject resend on already activated Primary Admin account
    ok 12 - should reject resend on already activated Primary Admin account
    # Subtest: should resend invitation for pending dairy, revoke previous token, and generate fresh token
    ok 13 - should resend invitation for pending dairy, revoke previous token, and generate fresh token
1..13
ok 1 - DFarm Dairy Admin Activation & Real Email Workflow Test Suite
```

---

## 3. Deep Verification of Invariants

### 3.1 Mandatory Email Invariant
- Verified that submitting an onboarding payload without an email returns HTTP 400 with an explicit error.
- Verified that malformed emails (`not-an-email`, `user@`, `@domain.com`) are rejected.
- Verified that plus-addressing (`admin+nashik@dfarm.in`) and normal uppercase/lowercase variations are correctly parsed and normalized to lowercase.

### 3.2 256-Bit Cryptographic Token Invariant
- Verified that generated activation tokens have 64 hexadecimal characters (32 bytes = 256 bits).
- Verified that the database persists strictly the SHA-256 hash.
- Verified that the activation link is constructed as:
  `http://localhost:5174/activate?token=<64-hex-token>`

### 3.3 Atomic Activation & Scoring Invariant
- Verified that `primaryAdminActivated` updates from `false` $\to$ `true`.
- Verified that `operationalReadinessScore` increments from `25%` $\to$ `50%`.
- Verified that `hardwareSynced` remains `false` and `collectionStaffTrained` remains `false`.

### 3.4 Single-Use Token Guard Invariant
- Verified that attempting to activate an already consumed token returns HTTP 400 `ALREADY_CONSUMED`.
- Verified that `GET /api/v1/dairies/invitations/validate?token=<consumedToken>` returns HTTP 400 `ALREADY_CONSUMED` and masked profile data.

### 3.5 Resend & Token Revocation Invariant
- Verified that `POST /api/v1/dairies/invitations/resend` invalidates all previous pending tokens (`status: REVOKED`).
- Verified that attempting to validate a revoked token returns HTTP 400 `INVITATION_REVOKED`.
- Verified that calling resend on an already active admin returns HTTP 400 (`This Primary Admin account is already activated`).
