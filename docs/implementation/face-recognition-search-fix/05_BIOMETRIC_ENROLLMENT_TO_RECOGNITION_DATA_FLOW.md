# DFARM — BIOMETRIC ENROLLMENT TO RECOGNITION END-TO-END DATA FLOW

**Execution Reference:** `DFARM-FACE-RECOGNITION-AND-CUSTOMER-SEARCH-FIX`  
**Document Identifier:** `05_BIOMETRIC_ENROLLMENT_TO_RECOGNITION_DATA_FLOW.md`  
**Status:** COMPLETED & VERIFIED  
**Date:** November 2026  
**Auditor:** Antigravity AI Engineering  

---

## 1. CANONICAL BIOMETRIC DATA FLOW ARCHITECTURE

```mermaid
sequenceDiagram
    autonumber
    actor Farmer as Farmer (Customer App)
    participant Mobile as dfarm-customer-app
    participant Backend as services/backend
    participant TenantDB as Tenant Database (Warna DB)
    participant Kiosk as dfarm-collection-app
    actor Operator as Collection Operator

    Note over Farmer, Mobile: Stage 1: Biometric Enrollment & Update
    Farmer->>Mobile: Navigates to Update Face Biometrics
    Mobile->>Mobile: Live Camera Preview & Reticle
    Farmer->>Mobile: Clicks "Capture & Update Template"
    Mobile->>Mobile: YuNet Detection -> Bounding Box & 5 Landmarks
    Mobile->>Mobile: SFace INT8 Feature Extraction -> 128-D Float Vector
    Mobile->>Mobile: L2 Unit Normalization (||v||₂ = 1.0)
    Mobile->>Backend: POST /api/v1/customers/:id/biometrics/update (128-D Vector, X-Dairy-Id)

    Note over Backend, TenantDB: Stage 2: Server-side Security & Isolation
    Backend->>Backend: Verify Authenticated Customer & Dairy Context
    Backend->>TenantDB: Fetch Customer Entity from Tenant DB
    Backend->>TenantDB: Query/Ensure face_model_versions (OpenCV-SFace-INT8)
    Backend->>Backend: AES-256-GCM + AAD Encryption (DFARM:CUST=id:MODEL=modelId)
    Backend->>TenantDB: UPDATE face_enrollments SET status = 'SUPERSEDED' (where status = 'ACTIVE')
    Backend->>TenantDB: INSERT INTO face_enrollments (ACTIVE, 128-D encrypted, IV, AuthTag)
    Backend-->>Mobile: 200 OK (status: 'ENROLLED', biometricStatus: { isEnrolled: true })
    Mobile-->>Farmer: Success Toast & Updated Profile Badge

    Note over Kiosk, TenantDB: Stage 3: Collection Terminal Template Cache Sync
    Operator->>Kiosk: Opens Collection Counter (Shift Session Open)
    Kiosk->>Backend: GET /api/v1/identity/face/templates?organizationId=:dairyId
    Backend->>TenantDB: SELECT FROM face_enrollments WHERE status = 'ACTIVE' AND c.status = 'ACTIVE'
    Backend->>Backend: AES-256-GCM Decrypt Embeddings for Authorized Terminal
    Backend-->>Kiosk: 200 OK (count: N, templates: [{ customerId, farmerCode, embedding[128] }])
    Kiosk->>Kiosk: Store in HardwareContext enrolledTemplates Cache

    Note over Farmer, Kiosk: Stage 4: Contactless Milk Intake Face Recognition
    Farmer->>Kiosk: Steps into Kiosk Camera Frame
    Kiosk->>Kiosk: WebRTC Frame (640x480) -> YuNet 2023Mar Face Detection
    Kiosk->>Kiosk: 5 Facial Landmarks -> Affine Warp to 112x112
    Kiosk->>Kiosk: SFace INT8 ONNX -> 128-D Vector + L2 Normalization
    Kiosk->>Kiosk: DairyFaceMatcher.match(liveVector, enrolledTemplates)
    Note over Kiosk: Cosine Similarity Calculation (>= 0.363)
    Kiosk->>Kiosk: MATCH CONFIRMED (e.g. 96.2% Confidence, Shubhangi Popat Yewale, C-101)
    Kiosk->>Kiosk: Load Customer Dossier, Category & Ledger Balance
    Kiosk->>Operator: Voice Announcer: "Farmer identified: Shubhangi Popat Yewale"
```

---

## 2. DATA AT REST & DATA IN TRANSIT ENCRYPTION GUARANTEES

1. **Zero Raw Biometric Vectors in Database:**
   - Face embeddings are never stored as plaintext floating-point numbers.
   - Embeddings are encrypted using `AES-256-GCM` with a 96-bit cryptographically random IV and 128-bit authentication tag.
   - Additional Authenticated Data (AAD) binds the ciphertext to the exact customer ID and model version UUID:
     $$\text{AAD} = \text{"DFARM:CUST="} + \text{customerId} + \text{":MODEL="} + \text{modelVersionId}$$
   - Any tampering or cross-tenant copying of the ciphertext causes authentication tag mismatch and immediate decryption failure.

2. **Tenant Physical Partitioning:**
   - Biometric vectors for Warna Milk's exist exclusively in Warna's PostgreSQL tenant database (`dfarm_tenant_...`).
   - The central control database (`dfarm_central`) contains **zero** biometric records, preserving tenant isolation and privacy compliance.

3. **In-Memory Terminal Cache:**
   - Decrypted embeddings exist transiently in the Collection Kiosk's memory (`HardwareContext`) scoped strictly to the authenticated `dairyId`.
   - Cross-dairy queries are rejected with HTTP 403 Forbidden.
