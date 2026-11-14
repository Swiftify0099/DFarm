# DFarm Admin Web Dashboard — Security & RBAC Specification

## 1. Role-Based Access Control (RBAC) Matrix

| Module / Action | Dairy Owner | Center Manager | Accountant | Supervisor | Collection Operator |
|---|:---:|:---:|:---:|:---:|:---:|
| **Main Dashboard & Operational KPIs** | Full Org | Center Only | Center Only | Center Only | Shift Only |
| **Customer List & KYC Directory** | Full Org | Center Only | Center Only | Center Only | Read-Only |
| **Register New Customer** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Customer Soft Delete / Restore** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Milk Collection Register** | Full Org | Center Only | Center Only | Center Only | Shift Only |
| **Supervisor Collection Adjustment** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Print Thermal Receipt Slip** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Rate Chart View & Preview** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Create Rate Version / Edit Matrix** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Approve Rate Version** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Publish Rate Version** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Create Billing Period & Generate Bills** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Submit / Approve Farmer Bills** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Finalize Bills (Cryptographic Lock)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Download Bill PDF Statement** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Disburse Direct Payout / Advance** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Approve Payout (Four-Eye Policy)** | ✅ | ✅ (Non-Creator) | ❌ | ✅ (Non-Creator) | ❌ |
| **Create Payment Batches** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Bank Statement Reconciliation** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Feed Inventory Management (P14)** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Feed POS Counter Sales (P14)** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Staff Directory & Attendance (P16)** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Payroll Processing & Salary Structures (P16)** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Approve Terminal Offline Policy** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Revoke Hardware Terminal** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Authoritative Reports & CSV Export** | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## 2. Separation of Duties & Four-Eye Principles
- **Payout Creator $\neq$ Payout Approver**: Staff users who create or enter a payout voucher cannot approve their own payment unless they are the Dairy Owner or Super Admin.
- **Bill Finalization**: Only Dairy Owners can permanently lock bills and trigger cryptographic SHA-256 seal generation.
- **Rate Publishing**: Only Dairy Owners can publish active pricing versions that govern automatic collection weighments.

---

## 3. Data Protection & Biometric Privacy Safeguards
1. **Zero Biometric Vector Exposure**:
   - The `/customers/:id/face-status` endpoint returns exclusively enrollment booleans, quality scores, and model metadata.
   - 192-dimensional MobileNet/FaceNet vector arrays are strictly stripped by backend DTO serializers.
2. **Terminal Security**:
   - Hardware terminal credentials and private keys are generated inside terminal hardware secure storage (TPM / Android Keystore).
   - Only public device certificates and identifiers are visible in the Admin Web.
3. **Double-Entry Financial Auditing**:
   - Every financial debit and credit is permanently written to `ledger_entries` and `ledger_transactions`.
   - Modifying previous transactions is impossible; all adjustments generate versioned, compensating debit/credit pairs with logged user attribution.
