# ROADMAP PHASE 08: SECURITY ARCHITECTURE & DATA PROTECTION VERIFICATION

**Document ID:** `DFARM-ROADMAP-PHASE-08-SECURITY-VERIFICATION`  
**Phase:** Roadmap Phase 08 — Collection App & Kiosk Operational Integration  
**Target Applications:** `apps/dfarm-collection-app`, `services/backend`  
**Security Standard:** Multi-Tenant Database Isolation, OWASP Top 10, Biometric Privacy, RBAC  

---

## 1. Security Baseline & Threat Model

The milk collection kiosk counter is a shared terminal deployed in semi-public village environments. Physical proximity to operators and patrons creates distinct security threats:
1. **Biometric Theft / Replay:** Interception or unauthorized harvesting of facial biometrics.
2. **RFID Brute-Forcing / Skimming:** Rapid scanning of UIDs or guessing valid patron UIDs.
3. **Cross-Tenant Data Leakage:** Attempting to query or modify collections across different dairy cooperatives from a single kiosk terminal.
4. **Operator Impersonation / Fraud:** Manual selection of favored farmers to inflate ledger credits or bypass physical quality measurements.

---

## 2. Multi-Tenant Database Isolation

Physical database separation established in Roadmap Phase 01 is preserved 100% throughout Phase 08.

- **Dynamic Connection Resolution:** Every HTTP request from the Collection App carries an `Authorization: Bearer <JWT>` header containing the cryptographic claim for `tenantId` (e.g., `tenant-hash-uuid`) and `dairyCode`.
- **Tenant Middleware Gate:** `tenantMiddleware.ts` intercepts incoming requests, validates the signature, maps the tenant to its dedicated PostgreSQL database (`dfarm_tenant_<code_hash>`), and attaches the isolated connection pool to the request context.
- **SQL Parameter Scoping:** All queries enforce parameter isolation:
  ```sql
  SELECT id, full_name, patron_code, status FROM customers 
  WHERE tenant_id = $1 AND rfid_card_id = $2;
  ```
- **Cross-Tenant Leakage Verification:** Verified by `clean-architecture.test.js` and `roadmap-phase-02-auth-rbac.test.js`. Invocations without valid tenant context or with mismatched tenant IDs are aborted with HTTP 401/403.

---

## 3. Biometric Template Privacy & Protection

- **Vector-Only Processing:** Raw camera video frames are processed entirely within the browser client using OpenCV YuNet INT8 and SFace INT8 ONNX models. Raw facial images are **never** transmitted to the backend API during regular kiosk intake.
- **128-Dimensional Embeddings:** Face recognition operates solely on mathematical 128-D floating-point unit vectors. These embeddings are irreversible: raw facial photographs cannot be reconstructed from 128-D feature vectors.
- **Client Sandbox Isolation:** Biometric vectors cached on the kiosk for fast local identification are isolated within the browser's origin-private sandbox (`Origin: http://localhost:5173` or `https://kiosk.<dairy>.dfarm.in`).
- **Zero Mock / Synthetic Vectors in Production:** Prompt 08 strictly eliminated canonical fixture vectors and luminance fallbacks from production bundles (`NODE_ENV === 'production'`), ensuring all matching operates on authentic biometric feature extraction.

---

## 4. RFID Minimization & Anti-Enumeration

- **Minimal Data Projection:** The endpoint `GET /api/v1/rfid/lookup/:uid` implements strict data minimization. It returns only the fields required to present the patron at the counter:
  ```json
  {
    "id": "e3b0c442-98fc-1c14-9afb-4c8996fb9242",
    "patronCode": "PAT-0042",
    "fullName": "Ramesh Kumar Patel",
    "phone": "+91 98765 43210",
    "milkType": "COW",
    "status": "APPROVED",
    "dairyId": "dairy-01"
  }
  ```
- **Excluded Attributes:** Bank account numbers, IFSC codes, Aadhaar/National ID numbers, KYC document images, and 128-D biometric embeddings are **strictly excluded** from the RFID lookup projection.
- **Rate-Limiting & Anti-Brute-Force:** The RFID lookup endpoint is protected by rate-limiting (maximum 60 lookups/minute per kiosk IP), preventing automated enumeration of RFID UIDs.
- **Database Unique Constraint Catch:** In `registerCustomer`, Postgres error code `23505` (unique violation on `rfid_card_id`) is caught and translated to HTTP 409 Conflict with a clear message: `"This RFID card is already assigned to another patron"`.

---

## 5. Role-Based Access Control (RBAC) & Operator Fallback Auditing

- **Role Separation:**
  - `COLLECTION_OPERATOR`: Permitted to open/close sessions, record milk collections, execute thermal prints, and initiate offline sync.
  - `COLLECTION_OPERATOR` is **DENIED**: Rate chart creation, patron approval/rejection, user provisioning, or ledger balance manipulation.
  - `DAIRY_ADMIN`: Permitted to approve customers and configure dairy operations. Denied `customers:reject` (strictly reserved for `PRIMARY_DAIRY_ADMIN` and `SUPER_ADMIN`).
- **Supervisor Override Auditing:**
  When manual patron selection (`CustomerLookupModal`) is used instead of biometric/RFID verification, or when an identity conflict (`hasIdentityConflict`) is overridden:
  - The transaction record explicitly tags `intakeMethod: 'MANUAL_FALLBACK'`.
  - The operator's user UUID is permanently attached as `operatorId`.
  - A structured audit log entry is written to `audit_logs` capturing the reason, timestamp, and patron ID.

---

## 6. Security Audit Findings & Resolution Matrix

| Vulnerability / Risk | Mitigation Implemented | Verification Test |
| :--- | :--- | :--- |
| **Identity Conflict Exploitation** | Added `hasIdentityConflict` check to block automated intake when Face & RFID contradict | `HardwareContext.test.tsx`, `CollectionWorkspace.tsx` |
| **Stale Milk Analyzer Reading** | Added `milkAnalyzerDriver.clearLastReading()` in `resetIntakeCycle` | Unit tested in `apps/dfarm-collection-app` |
| **Synthetic Luminance Fallback** | Restricted fallback bounding boxes strictly to `NODE_ENV === 'test'` | `yunet-detector.ts` code audit |
| **Canonical Vector Leakage** | Throws explicit Error on failed ONNX session in production | `sface-embedder.ts` code audit |
| **Client-Side Sensitive RFID Filter** | Replaced client `.find()` with authenticated `GET /api/v1/rfid/lookup/:uid` | `api/client.ts` code audit |
| **Excessive Role Authority** | Removed `customers:reject` from `DAIRY_ADMIN` role | `roadmap-phase-02-auth-rbac.test.js` (Test 1.5) |
