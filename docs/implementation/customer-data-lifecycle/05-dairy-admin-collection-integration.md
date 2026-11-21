# Cross-App Integration: Dairy Admin Approval, Collection App Intake & Customer App Visibility

**Document:** `05-dairy-admin-collection-integration.md`  
**Monorepo Track:** DFarm Multi-Tenant Enterprise Architecture  
**Scope:** Verification of customer identification, milk intake, biometric pipeline preservation, and cross-application consistency.

---

## 1. End-to-End Workflow Architecture

The authoritative data lifecycle connects four applications through a unified multi-tenant backend:

```
[ Customer App ] ──(1. Registration Submission)──► [ Central Control DB ]
                                                          │ (Maps global_customer_id)
                                                          ▼
[ Dairy Admin ]  ◄──(2. Approval & Farmer Code)──── [ Physical Tenant DB ]
        │                                                 │
        ▼                                                 ▼
[ Collection App ] ──(3. YuNet/SFace 128-dim)─────► [ face_enrollments (Tenant) ]
        │
        ├────────────(4. Milk Weighing & FAT/SNF)──► [ milk_collections (Tenant) ]
        │
        └────────────(5. Double-Entry Posting)────► [ customer_ledger_entries (Tenant) ]
                                                          │
                                                          ▼
[ Customer App ] ◄──(6. Passbook & History)──────── [ Customer App View ]
```

---

## 2. Step-by-Step Integration Verification

### Step 1: Customer App Registration
1. Customer inputs mobile number and selects a Dairy from `/api/v1/dairies/nearby`.
2. Backend checks if `global_customer_identities` exists for the mobile number; if not, creates one.
3. Backend provisions a tenant-local customer record in the Dairy's physical database (`customers` table) with `registration_status = 'PENDING_APPROVAL'`.
4. A central membership record is created in `customer_dairy_memberships` with `membership_status = 'PENDING'`.

### Step 2: Dairy Admin Approval & Farmer Code Assignment
1. Dairy Admin opens Dairy Admin Web (`apps/dfarm-dairy-admin` on port 5174).
2. The admin reviews pending customer applications via `GET /api/v1/customers?registrationStatus=PENDING_APPROVAL`.
3. The admin approves the customer, assigning an official `farmer_code` (e.g., `F-101`):
   ```sql
   UPDATE customers 
   SET registration_status = 'APPROVED', status = 'ACTIVE', farmer_code = 'F-101'
   WHERE id = $1;
   ```
4. The backend updates central membership:
   ```sql
   UPDATE customer_dairy_memberships
   SET membership_status = 'APPROVED', farmer_code = 'F-101', customer_name = $2
   WHERE tenant_customer_id = $1;
   ```

### Step 3: Biometric Pipeline Preservation (YuNet + SFace)
- **Biometric Standard:** YuNet face detector + OpenCV SFace INT8 model version `sface_int8_2021dec` (128-dimensional floating point embeddings).
- **Physical Storage:** Biometric embeddings and encrypted face crops are stored strictly in the physical Dairy tenant database in `face_enrollments`.
- **Cos Similarity Threshold:** Matching is performed at cosine similarity threshold `0.363`.
- **Preservation Check:** Zero modifications were made to the core YuNet/SFace detection and embedding inference pipeline in `apps/dfarm-collection-app/src/face-ai/`. All 128-dim models and calibration routines remain fully intact.

### Step 4: Collection App Customer Intake & Transaction Creation
1. The kiosk operator at the collection center opens `apps/dfarm-collection-app` (port 5175).
2. Customer is identified via:
   - **YuNet/SFace Facial Recognition** (matched against tenant embeddings)
   - **RFID Card Tap** (matched against tenant `rfid_cards`)
   - **Manual Code Entry** (fallback: `F-101`)
3. The Single Active Collection State Machine ensures only one active collection is processed at a time.
4. Scale and Milk Analyzer readings are recorded:
   - Weight (Liters): `20.5`
   - FAT (%): `4.5`
   - SNF (%): `8.8`
   - CLR Density: `28.5`
   - Applied Rate: `₹42.00 / Liter`
   - Total Amount: `₹861.00`
5. The transaction is saved via `transactionRepo.save(txn)` to tenant table `milk_collections` with an idempotency key (`idempotency_key`) preventing duplicate submissions.

### Step 5: Double-Entry Financial Posting
Upon transaction persistence:
- **Debit:** Milk Purchase / Inventory Asset Account (`₹861.00`)
- **Credit:** Customer Payable Account (`₹861.00`)
- A journal entry is inserted into tenant `customer_ledger_entries` with `entry_type = 'MILK_COLLECTION_CREDIT'`.

### Step 6: Customer App Visibility & Passbook
1. Customer opens `apps/dfarm-customer-app`.
2. Query key `['collection', 'history', dairyId, customerId]` queries `GET /api/v1/collection/history?limit=10&page=1` with header `x-dairy-tenant-id`.
3. The 20.5L / ₹861.00 collection is immediately returned.
4. Passbook displays running balance and credit transaction.
5. Zero cross-tenant leakage: Querying Dairy B returns 0 collections.

---

## 3. Cross-Application Compatibility Matrix

| Feature | Customer App | Dairy Admin | Collection App | Super Admin |
|---|---|---|---|---|
| Customer Name | Real Farmer Name | Real Farmer Name | Real Farmer Name | Audit Log Only |
| Identification | Mobile OTP | Admin Auth | YuNet / SFace / RFID | Super Admin Token |
| Tenant Routing | `x-dairy-tenant-id` | `x-dairy-tenant-id` | `x-dairy-tenant-id` | Target Path Param / Tenant Header |
| Local Offline | Read Cache | Cache | IndexedDB Sync Queue | N/A |
| Authoritative DB | Tenant Postgres | Tenant Postgres | Tenant Postgres | Central Control DB |
