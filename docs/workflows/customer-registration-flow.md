# Customer Registration Lifecycle & Consent Workflow

## 1. Registration Lifecycle Architecture

The DFarm Customer Registration workflow enforces an immutable multi-stage state transition pipeline:

```
  ┌────────────────────────────────────────────────────────┐
  │ 1. DRAFT                                               │
  │    Basic dairy profile recorded (Name, Farmer Code,    │
  │    Mobile, Center, Milk Categories).                   │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼  Biometric Consent Recorded (v1.0.0, 'mr')
  ┌────────────────────────────────────────────────────────┐
  │ 2. PENDING_FACE_ENROLLMENT                             │
  │    Biometric face template captured & encrypted.       │
  │    (DRAFT customers with valid consent permitted).     │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼  128-D Embedding Enrolled (Quality & Liveness)
  ┌────────────────────────────────────────────────────────┐
  │ 3. PENDING_RFID_ASSIGNMENT                             │
  │    Physical smart card assigned atomically in DB.      │
  │    Unique card UID scoped to organization.             │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼  Card Assigned & Prerequisites Satisfied
  ┌────────────────────────────────────────────────────────┐
  │ 4. PENDING_SYNC (If offline mobile registration)       │
  │    Awaiting synchronization to central PostgreSQL.     │
  └──────────────────────────┬─────────────────────────────┘
                             │
                             ▼  Sync Complete / Direct API
  ┌────────────────────────────────────────────────────────┐
  │ 5. ACTIVE                                              │
  │    Customer fully authorized for daily milk collection │
  │    and double-entry ledger accounting.                 │
  └────────────────────────────────────────────────────────┘
```

---

## 2. Invariant Rules and Permissions

1. **DRAFT Face Enrollment Permission**:
   - A valid customer in `DRAFT` status with recorded, active biometric consent is explicitly permitted to call `POST /api/v1/customers/:id/face-enroll`.
   - The backend transitions the customer from `DRAFT` directly to `PENDING_RFID_ASSIGNMENT`.
   - Under no circumstances is an already `ACTIVE` customer required to exist before biometric enrollment can occur.

2. **Strict Active Prerequisite Enforcement**:
   - Final transition to `ACTIVE` status requires that **all prerequisites** are met:
     - Biometric face enrollment record active in `face_enrollments`.
     - Active RFID card assigned in `rfid_card_assignments`.
     - Milk categories authorized in `customer_milk_categories`.

3. **Data Minimization & Privacy Protection**:
   - In accordance with DPDP (Digital Personal Data Protection) principles, the customer registration wizard restricts collected attributes to dairy-operational data:
     - **Mandatory**: Full Name, Farmer Code, Center ID, Normalized Mobile (`+91XXXXXXXXXX`), Authorized Milk Category (`COW` / `BUFFALO`).
     - **Excluded / Not Collected**: Aadhaar last 4 digits, Date of Birth, Gender, Community details.
     - **Banking Data**: Bank account number, IFSC code, and beneficiary name are **optional** during initial registration and strictly collected only when electronic direct-to-bank farmer payouts are configured.
     - **Logging**: Sensitive personal fields are redacted in application logs.
