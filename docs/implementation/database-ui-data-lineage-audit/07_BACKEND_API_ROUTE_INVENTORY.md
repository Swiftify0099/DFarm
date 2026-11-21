# DFARM — BACKEND API ROUTE INVENTORY
## COMPLETE ENDPOINT REGISTRY, VERBS, CONTROLLERS & PERMISSIONS

**Audit Reference:** `DFARM-AUDIT-API-INV-001`  
**Total Route Registrations:** 214  
**Unique Active APIs:** 212  
**Date:** 2026-11-18  

---

### 1. API Route Distribution by Functional Domain

| Domain | Route Prefix | Handler Count | Primary Controller | Primary Database |
|---|---|---|---|---|
| **Authentication & OTP** | `/api/v1/auth` | 14 | `AuthController` | `dfarm_central` & `dfarm_tenant` |
| **Milk Collections & Sessions** | `/api/v1/collections` | 22 | `CollectionController` | `dfarm_tenant` |
| **Customer Self-Service & Directory**| `/api/v1/customers` | 24 | `CustomerController` | `dfarm_tenant` |
| **Biometric & Face Identification** | `/api/v1/identity` | 12 | `BiometricController` | `dfarm_tenant` |
| **RFID Card Lifecycle** | `/api/v1/rfid` | 10 | `RfidController` | `dfarm_tenant` |
| **Customer Ledgers & Statements** | `/api/v1/ledger` | 12 | `LedgerController` | `dfarm_tenant` |
| **Periodic Billing Cycles & Bills** | `/api/v1/bills` | 14 | `BillingController` | `dfarm_tenant` |
| **Bulk Payouts & Maker-Checker** | `/api/v1/payments` | 18 | `PaymentController` | `dfarm_tenant` |
| **Cattle Feed & Store Credit** | `/api/v1/feed` | 16 | `FeedController` | `dfarm_tenant` |
| **Device Hardware Registry & Sync** | `/api/v1/devices`, `/sync` | 14 | `DeviceController`, `SyncController` | `dfarm_tenant` |
| **Cooperative Unions & Discovery** | `/api/v1/dairies` | 16 | `DairyController` | `dfarm_central` |
| **Super Admin Platform Operations** | `/api/v1/super-admin` | 22 | `SuperAdminController` | `dfarm_central` |
| **Employee Attendance & Payroll** | `/api/v1/employees` | 18 | `EmployeeController` | `dfarm_tenant` |

---

### 2. Sample Master Endpoints & Security Boundaries

```
POST /api/v1/auth/customer/otp/request  -> AuthController.requestCustomerOtp (Public Rate-Limited)
POST /api/v1/auth/customer/otp/verify   -> AuthController.verifyCustomerOtp (Public)
POST /api/v1/customers/register         -> CustomerController.register (Public with allowPublicRegistration)
POST /api/v1/customers/:id/approve      -> CustomerController.approve (Role: DAIRY_OWNER / ADMIN)
POST /api/v1/collections/sessions/open  -> CollectionController.openSession (Role: COLLECTION_OPERATOR)
POST /api/v1/collections/intake         -> CollectionController.recordIntake (Role: COLLECTION_OPERATOR)
POST /api/v1/payments/batches           -> PaymentController.createBatch (Role: ACCOUNTANT - Maker)
POST /api/v1/payments/batches/:id/approve -> PaymentController.approveBatch (Role: DAIRY_OWNER - Checker)
POST /api/v1/payments/reconciliation    -> PaymentController.reconcile (Role: ACCOUNTANT / DAIRY_OWNER)
```
