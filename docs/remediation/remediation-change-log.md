# Remediation Change Log & File Modification Registry
**DFarm — Smart Dairy Management System**  
**Remediation Deliverable 11**  

---

## 1. Safety Backups Created

- **Local PostgreSQL Database Dump**:
  - Path: `backups/pre-remediation/supabase_db_DFarm_backup.sql`
  - Created: Prior to applying Migration 015.
  - Contains complete pre-remediation schema and data state.

---

## 2. Database Migrations Added

- **`supabase/migrations/015_p05_p10_master_remediation.sql`**:
  - **Applied Date**: November 2026
  - **Recorded in Schema Migrations**: Version `015` in `supabase_migrations.schema_migrations`.
  - **Contents**:
    1. Updates canonical model in `face_model_versions`: `model_artifact_checksum = 'INVALID_EMPTY_HASH'`, `calibration_status = 'NOT_CALIBRATED'`, `is_active = TRUE`, `recommended_threshold = 0.720`.
    2. Creates table `face_re_enrollment_jobs` for zero-downtime model weight upgrades.
    3. Alters table `center_settings`: adds `limits_approved BOOLEAN DEFAULT FALSE`, `limits_status VARCHAR(50) DEFAULT 'PENDING_OWNER_APPROVAL'`, `limits_version VARCHAR(20) DEFAULT 'v1.0-draft'`.
    4. Replaces RPC `public.restore_customer(p_customer_id, p_restored_by, p_reason)` with hardened atomic function checking biometric consent, face enrollment, and RFID assignment.

---

## 3. Backend Source Files Modified

1. **`services/backend/src/biometric/model-service.ts`**:
   - Updated `CANONICAL_MODEL` constant:
     - `modelArtifactChecksum = 'INVALID_EMPTY_HASH'`
     - `calibrationStatus = 'NOT_CALIBRATED'`
     - `artifactStatus = 'UNVERIFIED_EMPTY_DIGEST'`
2. **`services/backend/src/modules/sync/sync.routes.ts`**:
   - Secured `POST /api/v1/devices/register` with `authenticate` and `requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER])`.
   - Secured `POST /api/v1/devices/revoke` with `authenticate` and `requireRole([UserRole.SUPER_ADMIN, UserRole.DAIRY_OWNER, UserRole.CENTER_MANAGER])`.
   - Integrated `center_settings` offline policy verification (`maxOfflineHours`, `offlinePolicyApproved`).
3. **`services/backend/src/modules/sync/sync.service.ts`**:
   - Fixed rate chart insertion in sync push: replaced invalid `pricing_type: 'FAT_SNF'` with canonical `pricing_type: 'GRID'`.
4. **`services/backend/src/modules/rfid/rfid.repository.ts`**:
   - Hardened `createAssignment` to enforce lifecycle state machine:
     - Advances customer from `PENDING_RFID_ASSIGNMENT` to `ACTIVE` with `registration_status: 'COMPLETED'` when face is enrolled.
     - Advances customer from `DRAFT` to `PENDING_FACE_ENROLLMENT` with `registration_status: 'IN_PROGRESS'`.
5. **`services/backend/src/modules/biometrics/biometric.repository.ts`**:
   - Updated `saveFaceEnrollment` to use `registration_status: 'IN_PROGRESS'` instead of invalid `'FACE_ENROLLED'` when pending RFID.
   - Updated checksum and calibration constants to match truthful schema.

---

## 4. Android Registration Application Files Modified / Created

1. **`apps/registration-android/app/src/main/kotlin/com/dfarm/registration/data/repository/ApiRfidRepository.kt`** (NEW):
   - Implements `RfidRepository` talking directly to backend `/api/v1/rfid` routes.
   - Replaces mock in-memory RFID repository in live application.
2. **`apps/registration-android/app/src/main/kotlin/com/dfarm/registration/hardware/RfidReaderAdapter.kt`**:
   - Updated `SoftwareManualEntryRfidAdapter.sourceLabel` to `"SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED"`.
3. **`apps/registration-android/app/src/main/kotlin/com/dfarm/registration/ui/rfid/RfidAssignmentViewModel.kt`**:
   - Updated default `hardwareSourceLabel` to `"SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED"`.
4. **`apps/registration-android/app/src/main/kotlin/com/dfarm/registration/ui/rfid/RfidAssignmentScreen.kt`**:
   - Updated manual UID input label to `"SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED"`.
5. **`apps/registration-android/app/src/main/kotlin/com/dfarm/registration/ui/enrollment/FaceEnrollmentScreen.kt`**:
   - Parameterized `customerId`, `customerName`, and `farmerCode` with dynamic `IdleView`, removing hardcoded dummy customer ID.
6. **`apps/registration-android/app/src/main/kotlin/com/dfarm/registration/ui/registration/RegistrationWizardScreen.kt`**:
   - Removed unapproved banking input fields from `MilkCategoryStep` and `ReviewDetailsStep` (Data Minimization).
   - Added `"Proceed to Biometric Face Enrollment"` button in `RegistrationStatusStep` linking customer directly to enrollment.
7. **`apps/registration-android/app/src/main/kotlin/com/dfarm/registration/ui/registration/RegistrationWizardViewModel.kt`**:
   - Updated `submitRegistration()` to pass `null` for banking fields in `CreateCustomerRequest`.
8. **`apps/registration-android/app/src/main/kotlin/com/dfarm/registration/Navigation.kt`**:
   - Wired `entry<FaceEnrollment>` and `entry<RfidAssignment>` into application navigation backstack.
   - Injected `ApiRfidRepository` into `RfidAssignmentViewModel`.
9. **`apps/registration-android/app/src/test/kotlin/com/dfarm/registration/RfidNormalizationTest.kt`**:
   - Aligned expected hardware label assertion with `"SOFTWARE MANUAL UID ENTRY — PHYSICAL READER DEFERRED"`.

---

## 5. Android Collection Application Files Modified

1. **`apps/collection-app/app/src/main/java/com/dfarm/collection/domain/model/Models.kt`**:
   - Updated `CustomerStatus` enum to include `PENDING_FACE_ENROLLMENT`, `PENDING_RFID_ASSIGNMENT`, `PENDING_SYNC`, `SOFT_DELETED`.
   - Updated `CenterValidationLimits` to include governance fields: `isApproved: Boolean = false`, `configurationStatus: String = "PENDING_OWNER_APPROVAL"`, `limitsVersion: String = "v1.0-draft"`.

---

## 6. Test Suite Files Hardened

1. **`services/backend/test/offline-sync-22-scenarios.test.js`**:
   - Fixed schema errors: removed nonexistent address columns on `organizations`; fixed column `code` on `dairy_centers`; added unique `username` on `users`.
   - Fixed device type check constraint: changed `'COLLECTION_TABLET'` to canonical `'COUNTER_TERMINAL'`.
   - Signed admin JWT for protected device registration/revocation endpoints.
   - Added pool cleanup to ensure instant process exit.
2. **`services/backend/test/health-and-auth.test.js`**:
   - Added connection pool closure hook `t.after()`.
3. **`services/backend/test/customer-endpoints.test.js`**:
   - Updated subtest 9 assertion to search items by created customer ID rather than assuming index 0.
4. **`services/backend/test/customer-lifecycle-security.test.js`**:
   - Aligned restore assertion to expect `status: 'PENDING_FACE_ENROLLMENT'` matching the hardened atomic RPC state machine.
