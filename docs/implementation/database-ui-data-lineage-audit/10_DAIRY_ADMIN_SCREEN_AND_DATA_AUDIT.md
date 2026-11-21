# DFARM — DAIRY ADMIN SCREEN AND DATA AUDIT (`dfarm-dairy-admin`)
## 21 OPERATIONAL MODULES, API BRIDGES & DATABASE LINEAGE

**Audit Reference:** `DFARM-AUDIT-APP-DAIRY-ADMIN-001`  
**Target:** `apps/dfarm-dairy-admin` (React 18 / Vite SPA)  
**Date:** 2026-11-18  

---

### 1. Screen-by-Screen Data Traceability Matrix

| Module / Screen | File Path | API Endpoint | Target Tables | Primary UI Data Elements | Status |
|---|---|---|---|---|---|
| **Admin Login** | `src/pages/auth/Login.tsx` | `POST /api/v1/auth/admin/otp/verify` | `users`, `organizations` | Mobile Number, OTP Input | LIVE UI VERIFIED |
| **Admin Activation**| `src/pages/auth/ActivationPage.tsx`| `POST /api/v1/dairies/activate` | `dairy_admin_invitations`, `users` | Invitation Token, Set Password | STATIC SOURCE VERIFIED |
| **Dashboard** | `src/pages/dashboard/Dashboard.tsx`| `GET /api/v1/dashboard/summary` | `milk_collections`, `customer_ledger_accounts` | Today's Intake (L), Active Farmers, Payouts | STATIC SOURCE VERIFIED |
| **Pending Approvals**|`src/pages/customers/PendingApprovals.tsx`|`GET /api/v1/customers/pending-registrations`|`customer_registration_records`| Applicant Name, Mobile, Cattle Count, Actions | STATIC SOURCE VERIFIED |
| **Customer Directory**|`src/pages/customers/CustomerDirectory.tsx`|`GET /api/v1/customers` | `customers`, `dairy_centers` | Farmer Code, Full Name, Status, Actions | STATIC SOURCE VERIFIED |
| **Customer Detail** |`src/pages/customers/CustomerDetail.tsx`|`GET /api/v1/customers/:id` | `customers`, `customer_addresses` | KYC Status, Bank Details, Passbook Tab | STATIC SOURCE VERIFIED |
| **Face Enrollments**|`src/pages/biometrics/FaceEnrollmentList.tsx`|`GET /api/v1/identity/face/enrollments`|`face_enrollments`, `customers` | Farmer Code, Model Version, Confidence | STATIC SOURCE VERIFIED |
| **RFID Management** |`src/pages/rfid/RfidManagement.tsx` |`GET /api/v1/rfid/cards` | `rfid_cards`, `rfid_card_assignments` | Card UID, Assigned Farmer, Status | STATIC SOURCE VERIFIED |
| **Collection Sessions**|`src/pages/collection/CollectionSessions.tsx`|`GET /api/v1/collections/sessions`|`collection_sessions` | Shift, Center, Total Liters, Status | STATIC SOURCE VERIFIED |
| **Milk Register** |`src/pages/collection/MilkCollectionRegister.tsx`|`GET /api/v1/collections` | `milk_collections` | Txn ID, Time, Qty, FAT, SNF, Rate, Amount | STATIC SOURCE VERIFIED |
| **Rate Charts** | `src/pages/rate-charts/RateChartManagement.tsx`|`GET /api/v1/rate-charts` | `rate_charts`, `rate_chart_cells` | Formula / Matrix Grid, Effective Dates | STATIC SOURCE VERIFIED |
| **Feed Inventory** |`src/pages/feed/FeedInventory.tsx` |`GET /api/v1/feed/products` | `feed_products`, `stock_movements` | SKU, Product Name, In Stock Bags, Sales | STATIC SOURCE VERIFIED |
| **Customer Ledger** |`src/pages/ledger/CustomerLedgerView.tsx`|`GET /api/v1/ledger/accounts/:id`|`customer_ledger_accounts`, `ledger_entries`| Running Balance, Debit, Credit, Journal | STATIC SOURCE VERIFIED |
| **Billing Cycles** |`src/pages/billing/BillingManagement.tsx`|`GET /api/v1/billing/cycles` | `billing_periods`, `monthly_bills` | Cycle Code, Period, Net Payable, Finalize | STATIC SOURCE VERIFIED |
| **Payment Register**|`src/pages/payments/PaymentRegister.tsx`|`GET /api/v1/payments/batches` | `payment_batches`, `payment_approvals` | Batch ID, Total Beneficiaries, Maker/Checker| STATIC SOURCE VERIFIED |
| **Device Hub** | `src/pages/devices/DeviceManagement.tsx`|`GET /api/v1/devices` | `devices`, `device_sync_state` | Device Name, Serial, Heartbeat, Firmware | STATIC SOURCE VERIFIED |
| **Staff Registry** |`src/pages/staff/StaffManagement.tsx` |`GET /api/v1/staff` | `users`, `user_center_assignments` | Staff Name, Role, Center Assignment | STATIC SOURCE VERIFIED |
| **Audit Logs** | `src/pages/audit/AuditLogViewer.tsx` |`GET /api/v1/audit` | `audit_logs` | Actor, Action, Resource, Timestamp | STATIC SOURCE VERIFIED |
| **Dairy Profile** | `src/pages/profile/DairyProfile.tsx` |`GET /api/v1/dairies/profile` | `organizations`, `dairy_centers` | Union Name, Code, Headquarters Address | STATIC SOURCE VERIFIED |
