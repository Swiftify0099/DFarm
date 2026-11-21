# DFARM — POST P0 FACE BIOMETRIC API CONTRACT & MOBILE RUNTIME RECOVERY
## 05. CUSTOMER FACE BIOMETRIC PERSISTENCE & AUDIT VERIFICATION

**Execution Reference:** `DFARM-FACE-P0-API-RUNTIME-RECOVERY`  
**Execution Timestamp:** 2026-11-20  
**Database Architecture:** Physical Separate Database Per Dairy (`dfarm_tenant_<code_hash>`)  
**Security Standard:** AES-256-GCM + AAD Key Derivation  
**Status:** FULLY VERIFIED IN TENANT STORAGE  

---

### 1. Central vs Tenant Storage Invariants

DFARM's strict data sovereignty architecture divides customer and biometric records between central identity and Dairy-owned tenant databases:

```
┌────────────────────────────────────────────────────────┐
│ dfarm_central (Central Identity & Control Plane)      │
├────────────────────────────────────────────────────────┤
│ • customer_identities (global_customer_id, phone)      │
│ • customer_dairy_memberships (membership_status, etc.) │
│ • customer_tenant_lookup (lookup mapping)              │
│ • organizations (dairy registry metadata)              │
│                                                        │
│ ⛔ ZERO BIOMETRIC EMBEDDINGS STORED HERE               │
└────────────────────────────────────────────────────────┘
                           │
                           ▼ Scoped by Organization UUID
┌────────────────────────────────────────────────────────┐
│ dfarm_tenant_<code_hash> (Physical Tenant Database)    │
├────────────────────────────────────────────────────────┤
│ • customers (local customer profile, farmer_code)      │
│ • face_model_versions (model metadata, threshold 0.363)│
│ • face_enrollments (encrypted vector, IV, auth tag)    │
│ • customer_ledger_accounts (financial passbook)        │
│                                                        │
│ 🔒 ENCRYPTED BIOMETRICS STRICTLY ISOLATED HERE         │
└────────────────────────────────────────────────────────┘
```

**Architectural Law:** Raw floating-point embeddings are NEVER persisted in `dfarm_central` or exposed in plaintext user-facing responses.

---

### 2. Tenant Persistence Step-by-Step Execution Verification

When a farmer submits an updated facial template via `POST /api/v1/customers/me/biometrics/update`, the backend executes the following verified sequence:

#### Step 1: Customer Identity Resolution
The controller extracts caller credentials from the JWT token (`req.user.userId`, `req.user.globalCustomerId`) and requested parameters (`req.params.id`, `req.body.customerId`).
- If `:id` is `'me'` or omitted, it binds to `req.user.userId`.
- The repository executes `SELECT * FROM customers WHERE (id = $1 OR global_customer_id = $1) AND organization_id = $2;`.

#### Step 2: Dairy Membership Verification
The tenant context is resolved from `X-Organization-Id` or `req.user.organizationId`.
- If the customer does not belong to the requested dairy, access is rejected with `HTTP 403 Forbidden` (`"Cross-dairy modification blocked"`).

#### Step 3: Physical Tenant Database Connection
`tenantDbManager.getTenantDb(customer.organizationId)` returns a dedicated PostgreSQL connection pool pointing to the specific Dairy tenant database (`dfarm_tenant_<code_hash>`).

#### Step 4: Model Version Resolution
The model version `sface_int8_2021dec` is queried in `face_model_versions`:
```sql
SELECT id, embedding_dimension FROM face_model_versions WHERE model_version = $1 LIMIT 1;
```
Returns model UUID `f0000000-0000-0000-0000-000000000001` with expected dimension `128`.

#### Step 5: AES-256-GCM + AAD Cryptographic Binding
`Aes256GcmBiometricEncryptor.encrypt128DimEmbedding` converts the 128 float array into a binary byte buffer (512 bytes) and encrypts it with:
- Key derived from master secret and Dairy salt.
- Unique 12-byte random IV (`embedding_iv`).
- 16-byte authentication tag (`embedding_auth_tag`).
- Additional Authenticated Data (AAD) mathematically bound to `customerId` and `modelId`.

#### Step 6: Audit Trail Preservation (No Record Deletion)
Previous active biometric records are NEVER deleted. Instead, the previous active enrollment status is updated to `'SUPERSEDED'`:
```sql
UPDATE face_enrollments 
SET status = 'SUPERSEDED' 
WHERE customer_id = $1 AND model_version_id = $2 AND status = 'ACTIVE';
```

#### Step 7: New Enrollment Insertion
A new enrollment row is inserted with `'ACTIVE'` status:
```sql
INSERT INTO face_enrollments (
  id, customer_id, model_version_id,
  embedding_encrypted, embedding_iv, embedding_auth_tag,
  encryption_key_reference, quality_score, status, enrolled_at,
  enrolled_by, device_id
) VALUES (
  gen_random_uuid(), $1, $2,
  decode($3, 'base64'), decode($4, 'base64'), decode($5, 'base64'),
  $6, 0.950, 'ACTIVE', NOW(),
  $7, 'KIOSK_MAIN_01'
);
```

#### Step 8: Customer Profile Touch
`customers.updated_at` is set to `NOW()` to trigger cache invalidation and UI synchronization.

---

### 3. Read-Back Confirmation Audit

Following persistence, the backend immediately performs a read-back query against `face_enrollments`:
```sql
SELECT DISTINCT customer_id FROM face_enrollments WHERE customer_id = $1 AND status = 'ACTIVE';
```
The controller returns `200 OK` with:
```json
{
  "success": true,
  "isBiometricEnrolled": true,
  "message": "Biometrics and identification credentials updated successfully.",
  "customerId": "24c5030e-cd92-462e-a696-8cb68d3f3aff",
  "status": "ENROLLED",
  "biometricStatus": {
    "isEnrolled": true,
    "status": "ENROLLED",
    "version": "sface_int8_2021dec",
    "enrolledAt": "2026-11-20T15:15:10.123Z"
  }
}
```
If read-back fails or insertion encounters an error, the operation throws an exception, and the mobile UI alerts the user without marking the update successful.
