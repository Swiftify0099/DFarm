# DFarm Dairy Admin Web — Permission Matrix

In adherence to Section 21 of the specification, the Dairy Admin platform implements a **configurable, backend-issued permission architecture** rather than a hardcoded, unchangeable hierarchy. The matrix below defines the baseline access controls for standard dairy operational roles.

## Permission Codes & Role Mapping

| Permission Code | Description | Primary Dairy Admin | Shift Supervisor | Collection Operator | Dairy Accountant |
|---|---|:---:|:---:|:---:|:---:|
| `VIEW_DASHBOARD` | View operational intake metrics, charts, & alerts | ✅ | ✅ | ✅ | ✅ |
| `MANAGE_CUSTOMERS` | View patron directory & customer detail dossiers | ✅ | ✅ | ❌ | ✅ |
| `APPROVE_REGISTRATIONS` | Review applicant biometrics & approve/reject onboarding | ✅ | ❌ | ❌ | ❌ |
| `MANAGE_FACE_ENROLLMENT` | Request re-enrollment or revoke YuNet biometric templates | ✅ | ❌ | ❌ | ❌ |
| `MANAGE_RFID` | Assign, reassign, or mark RFID smart cards lost | ✅ | ✅ | ❌ | ❌ |
| `MANAGE_COLLECTIONS` | Open/close shifts & view collection transaction register | ✅ | ✅ | ✅ | ❌ |
| `PERFORM_ADJUSTMENTS` | Non-destructively adjust collection weight with audit diff | ✅ | ❌ | ❌ | ❌ |
| `MANAGE_RATE_CHARTS` | Create new pricing versions & activate pricing grids | ✅ | ❌ | ❌ | ❌ |
| `VIEW_LEDGER` | View double-entry customer accounts & running balances | ✅ | ❌ | ❌ | ✅ |
| `PERFORM_LEDGER_ADJUSTMENT` | Post authorized manual adjustment to farmer account | ✅ | ❌ | ❌ | ❌ |
| `GENERATE_BILLS` | Generate fortnightly statements & payout vouchers | ✅ | ❌ | ❌ | ✅ |
| `MANAGE_FEED_INVENTORY` | Restock feed inventory & configure product prices | ✅ | ❌ | ❌ | ❌ |
| `RECORD_FEED_SALES` | Record customer feed purchases & deduct stock | ✅ | ✅ | ✅ | ❌ |
| `RECONCILE_PAYMENTS` | Record bank UTR disbursements & print vouchers | ✅ | ❌ | ❌ | ✅ |
| `VIEW_REPORTS` | Access and filter all 17 business reports | ✅ | ✅ | ❌ | ✅ |
| `EXPORT_REPORTS` | Export reconciled reports to CSV and thermal print | ✅ | ❌ | ❌ | ✅ |
| `MANAGE_DEVICES` | View kiosk health telemetry & trigger manual sync | ✅ | ✅ | ❌ | ❌ |
| `MANAGE_STAFF` | Configure operator accounts & assign permission sets | ✅ | ❌ | ❌ | ❌ |
| `VIEW_AUDIT_LOGS` | Inspect immutable audit logs & diff history | ✅ | ❌ | ❌ | ❌ |

---

## Unresolved Role Decisions (Section 21)

1. **Shift Supervisor Adjustment Authority:** Whether Shift Supervisors should be granted authority to adjust collection weights within a limited window (e.g. within 30 minutes of shift close) or if all adjustments strictly require Primary Dairy Admin sign-off.
2. **Accountant Self-Settlement:** Whether Dairy Accountants can directly approve payouts or if bill generation and payment disbursement require dual-authorization (Maker-Checker workflow).
*Architecture Note: The permission architecture is fully decoupled from UI code via `useAuth().hasPermission()`. Additional roles or modified permission bundles can be activated on the backend without rewriting frontend logic.*
