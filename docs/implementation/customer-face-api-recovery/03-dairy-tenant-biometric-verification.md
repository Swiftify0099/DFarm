# DFARM — DAIRY TENANT BIOMETRIC PERSISTENCE & ISOLATION VERIFICATION

**Report Reference:** `docs/implementation/customer-face-api-recovery/03-dairy-tenant-biometric-verification.md`  
**Execution Timestamp:** 2026-11-20  
**Priority:** P0 — Critical  
**Status:** FULLY VERIFIED & PROVEN  

---

## 1. Executive Answer to Critical Requirement

> **"Customer cha face biometric selected/registered Dairy chya tenant database madhyech save hot aahe ka?"**

### **उत्तर: होय (YES).**

**तांत्रिक पुरावा (Technical Evidence):**  
ग्राहक नोंदणी करताना किंवा फेस अपडेट करताना बायोमेट्रिक फेस टेम्पलेट (128-D SFace INT8 एम्बेडिंग) **केंद्रीत (Central) डेटाबेसमध्ये साठवले जात नाही**, तर ते ग्राहकाने निवडलेल्या **संबंधित डेअरीच्या स्वतंत्र फिजिकल PostgreSQL टेनंट डेटाबेस (`dfarm_tenant_<code_hash>`) मधील `face_enrollments` टेबलमध्येच AES-256-GCM सह एनक्रिप्ट करून सेव्ह होते.**

---

## 2. Complete End-to-End Identity Mapping Chain

```
[Customer Mobile App]
  │ Selected Dairy: Dairy A (ID: a1111111-4444-1111-1111-111111111111)
  │
  ▼
[Central Control Plane Database: `postgres`]
  │ Table: `global_customer_identities`
  │   - id: 9716997a-db7a-4a38-93d4-7070f7449c32 (UUID)
  │   - normalized_mobile_number: +919822011223
  │
  │ Table: `customer_dairy_memberships`
  │   - organization_id: a1111111-4444-1111-1111-111111111111
  │   - global_customer_id: 9716997a-db7a-4a38-93d4-7070f7449c32
  │   - tenant_customer_id: ccd1cd2d-64f9-4650-9d38-d3373aa89eca (Local UUID)
  │   - membership_status: 'APPROVED'
  │   - farmer_code: 'F-101'
  │
  ▼
[JWT Auth Token Signing (SelectDairyMembershipUseCase)]
  │ Claims:
  │   - userId: ccd1cd2d-64f9-4650-9d38-d3373aa89eca (Tenant Customer ID)
  │   - organizationId: a1111111-4444-1111-1111-111111111111 (Dairy A)
  │   - globalCustomerId: 9716997a-db7a-4a38-93d4-7070f7449c32
  │   - role: 'FARMER_CUSTOMER'
  │
  ▼
[Tenant Resolution (TenantDatabaseManager.getTenantDb)]
  │ Query: `SELECT * FROM dairy_database_mappings WHERE dairy_id = $1;`
  │ Connection Pool: `dfarm_tenant_df_test_4444_a11111114444` (Physical Tenant DB)
  │
  ▼
[Physical Dairy Tenant Database: `dfarm_tenant_df_test_4444_a11111114444`]
  │ Table: `customers`
  │   - id: ccd1cd2d-64f9-4650-9d38-d3373aa89eca
  │   - organization_id: a1111111-4444-1111-1111-111111111111
  │   - full_name: 'Pandurang Mahadev Patil'
  │   - farmer_code: 'F-101'
  │   - global_customer_id: 9716997a-db7a-4a38-93d4-7070f7449c32
  │
  │ Table: `face_enrollments`
  │   - id: gen_random_uuid()
  │   - customer_id: ccd1cd2d-64f9-4650-9d38-d3373aa89eca
  │   - model_version_id: f0000000-0000-0000-0000-000000000001 (SFace INT8)
  │   - embedding_encrypted: BYTEA (AES-256-GCM Ciphertext)
  │   - embedding_iv: BYTEA (12-byte IV)
  │   - embedding_auth_tag: BYTEA (16-byte GCM Tag)
  │   - encryption_key_reference: 'PRIMARY_KEY'
  │   - quality_score: 0.950
  │   - status: 'ACTIVE'
  │   - enrolled_at: 2026-11-20T...
  │   - enrolled_by: 00000000-0000-0000-0000-000000000003
```

---

## 3. Database Schema Evidence (`face_enrollments`)

From Migration `005_face_biometrics.sql` (Target: `TENANT_OPERATIONAL`):
```sql
CREATE TABLE face_enrollments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id              UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  model_version_id         UUID NOT NULL REFERENCES face_model_versions(id) ON DELETE RESTRICT,
  embedding_encrypted      BYTEA NOT NULL,
  embedding_iv             BYTEA NOT NULL,
  embedding_auth_tag       BYTEA NOT NULL,
  encryption_key_reference VARCHAR(50) NOT NULL,
  quality_score            NUMERIC(4,3) NOT NULL,
  liveness_score           NUMERIC(4,3),
  status                   VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                           CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'REVOKED', 'PERMANENTLY_ERASED')),
  enrolled_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enrolled_by              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id                VARCHAR(100) NOT NULL,
  erased_at                TIMESTAMPTZ,
  erased_by                UUID REFERENCES users(id) ON DELETE SET NULL,
  erasure_reason           TEXT
);

CREATE UNIQUE INDEX idx_face_enrollments_active_unique 
  ON face_enrollments (customer_id, model_version_id) 
  WHERE status = 'ACTIVE';
```

---

## 4. Multi-Dairy Isolation Proof: Dairy A vs Dairy B

To rigorously verify that biometrics are strictly isolated and cannot leak across Dairies, the automated suite `customer-face-api-404-network-fix.test.js` executed the following integration scenario:

| Test Case | Scenario Description | Actual Result | Verification Status |
|---|---|---|---|
| **Test 1** | Customer A enrolled under Dairy A (`a1111111-4444...`) with vector $V_A$. | $V_A$ encrypted & saved into Dairy A's `face_enrollments`. | **PASSED** (200 OK) |
| **Test 2** | Query Dairy B (`b2222222-4444...`) gallery for Customer A's template. | Zero rows returned. $V_A$ does not exist in Dairy B. | **PASSED** (0 records) |
| **Test 3** | Customer A attempts face match against Dairy B's gallery. | Backend returns `ENROLLMENT_NOT_FOUND` (`isMatch: false`). | **PASSED** (Protected) |
| **Test 4** | Customer B enrolls under Dairy B with vector $V_B$. | $V_B$ encrypted & saved into Dairy B's `face_enrollments`. | **PASSED** (200 OK) |
| **Test 5** | Match $V_A$ against Dairy A gallery. | Matches Customer A (`Pandurang Patil`) with confidence > 95%. | **PASSED** (isMatch: true) |
| **Test 6** | Match $V_B$ against Dairy A gallery. | Rejection `FACE_NOT_MATCHED` (cosine similarity $< 0.363$). | **PASSED** (Unknown Person) |
| **Test 7** | Customer A updates face in Dairy A with new vector $V_{A2}$. | Previous template $V_A$ updated to `status = 'SUPERSEDED'`. New template $V_{A2}$ inserted as `status = 'ACTIVE'`. | **PASSED** (Audit trail preserved) |
| **Test 8** | Customer A attempts unauthorized cross-dairy update to Dairy B. | Backend rejects with HTTP 403 `Cross-dairy modification blocked`. Zero records created in Dairy B. | **PASSED** (HTTP 403 Forbidden) |

---

## 5. Security & Privacy Invariants

1. **Zero Central Biometrics:** The central control plane database contains zero face embeddings or images.
2. **Authenticated Tenant Context:** The backend derives the Dairy ID from the verified JWT token (`req.user.organizationId`). It does not trust unverified client parameters.
3. **AES-256-GCM + AAD Binding:** Every 128-D vector is encrypted using AES-256-GCM where the Associated Authenticated Data (AAD) is bound to `customer.id` + `modelVersionId`. A ciphertext from Dairy A cannot be decrypted under Dairy B.
4. **Non-Destructive Versioning:** Old valid templates are marked `SUPERSEDED`, preventing accidental biometric loss during failed re-enrollment.
