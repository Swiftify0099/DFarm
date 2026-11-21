# DFARM — CUSTOMER REGISTRATION DATA FLOW SPECIFICATION

**Authoritative Technical Document**  
**Component Scope**: DFarm Customer App (Android / React Native) → API Gateway → Selected Dairy Isolated Database  
**Lifecycle Stage**: Farmer Registration Submission to Tenant Persistence

---

## 1. End-to-End Registration Workflow Sequence

```
[Farmer Mobile App]
       │
       ├─► 1. Customer Login & OTP Authentication (+91XXXXXXXXXX)
       ├─► 2. Location Discovery & Nearby Dairy Selection (e.g. Gokul Primary Cooperative)
       ├─► 3. Producer Profile Details (Full Name, Village, Milk Animal Supply Types)
       ├─► 4. Bank Account Details (Account Number, IFSC, Bank Name)
       ├─► 5. Explicit Biometric Consent Record
       ├─► 6. Live Camera Stream Face Detection (OpenCV YuNet - 14 keypoints)
       ├─► 7. Deep Feature Embedding Extraction (OpenCV SFace INT8 - 128 normalized float values)
       │
       ▼ (HTTP POST /api/v1/customers/register)
[DFarm Backend API Gateway]
       │
       ├─► 8. JWT Bearer / Mobile Session Verification
       ├─► 9. Tenant Database Resolution via TenantDatabaseManager(selectedDairyId)
       ├─► 10. Duplicate Mobile Validation within Target Dairy
       ├─► 11. Initial Status Assignment: status='INACTIVE', registration_status='PENDING_APPROVAL'
       ├─► 12. AES-256-GCM Biometric Vector Encryption with AAD
       │
       ▼ (SQL Transaction in Isolated Tenant Database)
[Selected Dairy Operational DB]
       │
       ├─► 13. INSERT INTO customers (...)
       ├─► 14. INSERT INTO customer_milk_categories (...)
       ├─► 15. INSERT INTO customer_addresses (...)
       ├─► 16. INSERT INTO face_enrollments (...)
       └─► 17. INSERT INTO customer_consent_records (...)
```

---

## 2. Field-Level Payload to Database Mapping

| Frontend App Field | Payload JSON Path | Database Target Table | Target Column | Data Type | Constraint / Rule |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Customer ID** | `id` (or generated on backend) | `customers` | `id` | `UUID` | Primary Key |
| **Selected Dairy** | `organizationId` | `customers` | `organization_id` | `UUID` | Resolves Tenant DB |
| **Center Selection** | `centerId` | `customers` | `primary_center_id` | `UUID` | References `dairy_centers(id)` |
| **Applicant Name** | `fullName` | `customers` | `full_name` | `VARCHAR(150)` | Trimmed, non-empty |
| **Mobile Number** | `mobileNumber` | `customers` | `normalized_mobile_number` | `VARCHAR(20)` | E.164 normalized (`+91...`) |
| **Village / Town** | `village` | `customer_addresses` | `village_town` | `VARCHAR(100)` | Primary address record |
| **Supply Animals** | `categories` (or `milkSupplyType`) | `customer_milk_categories` | `milk_category` | `VARCHAR(20)` | `'COW'`, `'BUFFALO'` |
| **Bank Account** | `bankDetails.accountNumber` | `customers` | `bank_account_number` | `VARCHAR(50)` | Encrypted at rest |
| **Bank IFSC** | `bankDetails.ifscCode` | `customers` | `bank_ifsc` | `VARCHAR(20)` | Valid 11-char IFSC |
| **Account Status** | *Backend Enforced* | `customers` | `status` | `VARCHAR(20)` | Strictly `'INACTIVE'` |
| **Registration Status** | *Backend Enforced* | `customers` | `registration_status` | `VARCHAR(30)` | Strictly `'PENDING_APPROVAL'` |
| **Biometric Vector** | `faceTemplate.embedding` | `face_enrollments` | `embedding_encrypted` | `BYTEA` | AES-256-GCM Ciphertext |
| **Encryption IV** | *Backend Generated* | `face_enrollments` | `embedding_iv` | `BYTEA` | 12-byte random IV |
| **Auth Tag** | *Backend Generated* | `face_enrollments` | `embedding_auth_tag` | `BYTEA` | 16-byte GCM authentication tag |
| **Model Reference** | `faceTemplate.modelVersion` | `face_enrollments` | `model_version_id` | `UUID` | `sface_int8_2021dec` (128-D) |
| **Consent Agreed** | `consentAgreed` | `customer_consent_records` | `consent_granted` | `BOOLEAN` | Mandatory `TRUE` |

---

## 3. Biometric Protection Engine (AES-256-GCM with AAD)

Biometric vectors are never stored in plaintext and never leave the backend unencrypted.

### Additional Authenticated Data (AAD) Invariant
To prevent ciphertext swapping attacks between customers or models, the encryption engine cryptographically binds the customer ID and model version ID into the GCM authentication tag:
```
AAD = "DFARM:CUST=" + customerId + ":MODEL=" + modelVersionId
```
If an attacker attempts to associate Customer A's encrypted face vector with Customer B, GCM tag verification fails immediately, aborting decryption.

---

## 4. Multi-Tenant Persistence Verification

In our verified end-to-end integration test:
- **Registration ID**: `f4aab961-7379-4e38-affc-2c1e236c2a35`
- **Target Dairy**: `00000000-0000-0000-0000-000000000001` (Gokul Primary Cooperative)
- **Persisted Database**: `dfarm_tenant_gokul_01_00000000`
- **Verification Query on Gokul DB**: 1 record returned with status `PENDING_APPROVAL`.
- **Verification Query on Warna DB (`00000000-0000-0000-0000-000000000004`)**: 0 records returned.
