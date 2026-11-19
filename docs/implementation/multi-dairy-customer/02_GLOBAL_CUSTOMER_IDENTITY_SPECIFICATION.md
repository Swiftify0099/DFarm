# 02 — GLOBAL CUSTOMER IDENTITY SPECIFICATION

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Systems:** `global_customer_identities`, `PostgresCustomerMembershipRepository`, `CustomerAuthUseCases`

---

## 1. Global Identity Definition

A Global Customer Identity represents the verified human entity across the entire DFarm federation. It is identified solely by their canonical mobile telephone number verified via real cryptographic OTP.

### Database Schema (`dfarm_central`)

```sql
CREATE TABLE IF NOT EXISTS global_customer_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_mobile_number VARCHAR(20) NOT NULL UNIQUE,
    phone_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_global_cust_phone 
ON global_customer_identities (normalized_mobile_number);
```

---

## 2. Canonical E.164 Normalization

Mobile numbers enter the system in various representations:
- Raw user input: `9876543210`, `09876543210`, `+91 98765-43210`, `919876543210`.
- Normalization Logic (`PhoneNumber` Value Object):
  1. Strip all non-digit characters (`\D`).
  2. Extract national significant number (last 10 digits for India +91 country calling code).
  3. Validate standard 10-digit Indian numbering plan format (`^[6-9]\d{9}$`).
  4. Prefix with standard international notation: `+91` + `10_DIGITS`.
  5. Canonical result: `+919876543210`.

Any variation resolves to the exact same canonical string prior to database queries.

---

## 3. Concurrency & Idempotency Guarantees

### Concurrent OTP Verification
When a customer attempts simultaneous logins from multiple devices:
```sql
INSERT INTO global_customer_identities (id, normalized_mobile_number, phone_verified_at, created_at, updated_at)
VALUES ($1, $2, $3, $3, $3)
ON CONFLICT (normalized_mobile_number) DO UPDATE SET
  phone_verified_at = EXCLUDED.phone_verified_at,
  updated_at = EXCLUDED.updated_at
RETURNING id, normalized_mobile_number, phone_verified_at, created_at, updated_at;
```
- PostgreSQL atomic upsert guarantees that only one row is ever created for a phone number.
- The `id` UUID remains stable across subsequent logins, passwordless sessions, and credential refreshes.

---

## 4. No Operational PII in Control Plane

To maintain strict compliance with data minimization and physical tenant isolation:
- `global_customer_identities` does **not** store customer full name, address, bank accounts, or biometric templates.
- Operational profiles belong exclusively to the customer's records within each dairy's physical tenant database.
