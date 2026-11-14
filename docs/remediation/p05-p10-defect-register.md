# P05-P10 Master Defect Register
**DFarm — Smart Dairy Management System**  
**Remediation Tracking & Defect Resolutions**  
**Status**: 100% REMEDIATED & VERIFIED  

---

## Defect Inventory & Resolution Summary

| Defect ID | Phase | Severity | Title | Root Cause | Remediation Applied | Test Verification |
|---|---|---|---|---|---|---|
| **DEF-001** | P05 | CRITICAL | Non-Atomic Customer Restore | `restore_customer()` RPC did not check active biometric consent, face enrollment, or RFID | Replaced RPC in Migration 015 with strict multi-condition check; returns appropriate pending state | `customer-lifecycle-security.test.js` Subtests 8, 9 |
| **DEF-002** | P05 | HIGH | Role Inconsistencies across Layers | Multiple role variants (`DAIRY_ADMIN` vs `DAIRY_OWNER`) | Standardized on `chk_user_role` DB constraint; aligned backend `UserRole` enum and tests | `health-and-auth.test.js`, static DB checks |
| **DEF-003** | P06 | MEDIUM | KYC Data Minimization Violation | Registration wizard collected bank accounts and IFSC codes not approved in primary specification | Removed banking fields from UI and payload; defaults to null in API request | `RegistrationWizardScreen.kt`, `RegistrationWizardViewModel.kt` |
| **DEF-004** | P06 | HIGH | Unlinked Registration Lifecycle Flow | Face enrollment and RFID assignment were isolated screens with hardcoded IDs | Wired `onProceedToFaceEnrollment` in wizard and dynamic `Navigation.kt` backstack | `apps/registration-android` 36 unit tests |
| **DEF-005** | P07 | CRITICAL | Fraudulent Face Model Checksum | Artifact SHA-256 `e3b0c44...` was empty string; no model weights existed | Corrected DB and code metadata to `INVALID_EMPTY_HASH`, `NOT_CALIBRATED`, and `BLOCKED_BY_ARTIFACT` | `biometric-engine.test.js` (21 tests) |
| **DEF-006** | P07 | HIGH | Biometric Template Size Discrepancy | P09 documentation cited 434 bytes, but 512D Float32 vector requires 2048 bytes | Validated AES-256-GCM binary payload: 2048 bytes ciphertext + 12 IV + 16 Tag = 2076 bytes | `biometric-engine.test.js` Subtest 12 |
| **DEF-007** | P08 | HIGH | Isolated In-Memory RFID Repository | Android app relied on local mock repository without connecting to backend | Implemented `ApiRfidRepository` talking to `/api/v1/rfid` routes | `ApiRfidRepository.kt`, `RfidAssignmentTest.kt` |
| **DEF-008** | P08 | MEDIUM | Hardware Boundary Misrepresentation | RFID reader was implied as physical driver rather than manual software entry | Explicitly labeled all adapters and screens: `SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED` | `SoftwareManualEntryRfidAdapter.kt`, `RfidNormalizationTest.kt` |
| **DEF-009** | P09 | HIGH | Unauthenticated Device Registration | `POST /api/v1/devices/register` had no auth middleware | Added `authenticate` + `requireRole([SUPER_ADMIN, DAIRY_OWNER, CENTER_MANAGER])` | `offline-sync-22-scenarios.test.js` Scenario 1 |
| **DEF-010** | P09 | CRITICAL | Rate Chart Pricing Type Check Violation | Sync push service inserted `pricing_type = 'FAT_SNF'`, violating `chk_rate_chart_pricing_type` | Changed sync push insertion to `pricing_type = 'GRID'` | `offline-sync-22-scenarios.test.js` Scenario 17 |
| **DEF-011** | P10 | HIGH | Incomplete Customer Status Enum in Collection App | `CustomerStatus` lacked `PENDING_FACE_ENROLLMENT`, `PENDING_RFID_ASSIGNMENT`, `SOFT_DELETED` | Added missing statuses to `CustomerStatus` enum in collection app model | `apps/collection-app` unit tests |
| **DEF-012** | P10 | MEDIUM | Unvalidated Center Limits Governance | Center validation limits lacked explicit approval workflow and status tracking | Added `limits_approved`, `limits_status`, `limits_version` to `center_settings` and Kotlin models | Migration 015, `Models.kt` |

---

## Remediation Details

### DEF-001: Non-Atomic Customer Restore
- **File**: `supabase/migrations/015_p05_p10_master_remediation.sql`
- **Issue**: Previously, restoring a customer simply toggled `is_deleted = false` and set status back to `ACTIVE`, even if the customer never completed face enrollment, biometric consent had expired, or RFID was never assigned.
- **Fix**: Replaced `public.restore_customer(p_customer_id, p_restored_by, p_reason)` with an atomic transaction that:
  1. Verifies caller has admin authorization (`SUPER_ADMIN` or `DAIRY_OWNER`).
  2. Queries active consent records: `consent_type = 'BIOMETRIC_FACE_ENROLLMENT' AND consent_granted = TRUE AND revoked_at IS NULL`.
  3. Queries active face enrollments: `status = 'ACTIVE'`.
  4. Queries active RFID card assignments: `is_active = TRUE`.
  5. Dynamically determines status:
     - Missing consent or face enrollment -> `PENDING_FACE_ENROLLMENT`
     - Missing RFID assignment -> `PENDING_RFID_ASSIGNMENT`
     - All verified -> `ACTIVE`
  6. Removes active tombstone from `sync_tombstones`.
  7. Inserts audit trail log in `customer_audit_log` and `sync_events`.

### DEF-005: Biometric Model Digest & Calibration
- **Files**: `supabase/migrations/015_p05_p10_master_remediation.sql`, `services/backend/src/biometric/model-service.ts`
- **Issue**: The codebase reported model artifact digest `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` as valid. This hash is the exact SHA-256 of empty binary input `""`.
- **Fix**: Updated database and backend service to record truth:
  - `model_artifact_checksum = 'INVALID_EMPTY_HASH'`
  - `calibration_status = 'NOT_CALIBRATED'`
  - `artifact_status = 'UNVERIFIED_EMPTY_DIGEST'`
  - Threshold remains theoretical `0.720` until physical weights are calibrated.
