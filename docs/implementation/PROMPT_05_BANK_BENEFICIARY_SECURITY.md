# PROMPT 05: BANK BENEFICIARY DATA SECURITY & PII MASKING REPORT

**Document ID:** `DFARM-VERIF-05-BANK-001`  
**Execution Phase:** Prompt 05  
**Target:** Farmer Bank Account Storage, Transmission, PII Masking & Gateway Quarantine  
**Verification Date:** November 17, 2026  
**Status:** FULLY VERIFIED — ZERO PAYMENT LEAKAGE  

---

## 1. Executive Summary

Farmers receive direct bank transfers (NEFT/RTGS/IMPS/NACH) from their Dairy cooperative for milk collections. The DFarm Customer Mobile App enables farmers to review and update their bank beneficiary information. Because financial account numbers constitute highly sensitive Personally Identifiable Information (PII), Prompt 05 implemented strict server-side masking, ownership guards, IFSC format validation, and complete architectural isolation from third-party payment gateways like Razorpay.

---

## 2. Server-Side PII Masking Architecture

### 2.1 Masking Invariant
Raw bank account numbers must never be transmitted over the air in mobile app read responses.
Implemented in `services/backend/src/presentation/routes/customers.routes.ts`:
```typescript
function maskAccountNumber(accountNumber?: string): string {
  if (!accountNumber || accountNumber.length <= 4) return 'XXXX';
  const lastFour = accountNumber.slice(-4);
  return `XXXX-XXXX-${lastFour}`;
}
```

### 2.2 Endpoint Protection
- **`GET /api/v1/customers/me`**:
  - Resolves profile for authenticated user (`req.user.userId`).
  - Automatically replaces raw `bankAccountNumber` with masked string: `XXXX-XXXX-5566`.
- **`GET /api/v1/customers/:id`**:
  - Validates caller permissions (Dairy Admin or owning Customer).
  - Emits masked `accountNumberMask` and strips raw account numbers in standard response envelopes.

---

## 3. Bank Beneficiary Update Security & Validation

### 3.1 Strict Ownership Check
Handled by `PUT /api/v1/customers/:id/bank-details`:
```typescript
if (req.user?.role === 'FARMER_CUSTOMER' && req.user.userId !== targetId) {
  return res.status(403).json({
    error: { code: 'FORBIDDEN', message: 'You are not authorized to update another customer\'s bank details' }
  });
}
```
If Farmer A attempts to update the bank details of Farmer B, the request is aborted with `403 Forbidden`.

### 3.2 Indian Financial System Code (IFSC) Regex Enforcement
All IFSC codes must adhere to Reserve Bank of India (RBI) standards:
- Pattern: `^[A-Z]{4}0[A-Z0-9]{6}$`
  - Exactly 4 uppercase letters representing the bank name (e.g. `SBIN`, `HDFC`, `ICIC`).
  - The 5th character must be literal digit `0` (reserved for future use).
  - The last 6 characters are alphanumeric branch identifiers.
- Invalid strings (e.g., lowercase `sbin0001234`, invalid digit positions `SBIN1001234`, wrong length `SBIN0123`) fail validation with `400 Bad Request`.

### 3.3 Account Number Format Validation
- Must consist solely of numeric digits (`/^\d{9,18}$/`).
- Minimum length: 9 digits. Maximum length: 18 digits.

---

## 4. Payment Gateway Quarantine & Zero Razorpay Exposure

### 4.1 Threat Model
Allowing payment gateway SDKs or credentials inside farmer mobile applications creates catastrophic liability:
- Risk of unauthorized debits or accidental merchant charges.
- Leakage of Dairy or Super Admin API keys.
- Complex compliance burdens under RBI merchant aggregator directives.

### 4.2 Quarantine Verification
1. **Zero Client Dependencies:** `apps/dfarm-customer-app/package.json` was inspected and verified to have **0 Razorpay dependencies** (no `react-native-razorpay`, no `@razorpay/*`).
2. **Zero Mobile Routes:** The backend provides **zero payment collection or payment link generation endpoints** accessible to role `FARMER_CUSTOMER` or `GUEST_FARMER`.
3. **Super Admin Isolation:** Razorpay integrations in DFarm are strictly quarantined to Super Admin AMC subscription billing (`POST /api/v1/super-admin/billing/razorpay/...`) and inaccessible to tenant or mobile users.

---

## 5. Automated Test Evidence

Verified via `node --test services/backend/tests/customer-app-production.test.js`:
- `Subtest 24`: `GET /api/v1/customers/me` returns properly masked bank account number (`XXXX-XXXX-5566`).
- `Subtest 25`: Updating bank details with valid IFSC and account number succeeds (HTTP 200).
- `Subtest 26`: Updating bank details with invalid IFSC format is rejected with `400 Bad Request`.
- `Subtest 27`: Updating bank details for another farmer is blocked with `403 Forbidden`.
- `Subtest 28`: Customer app dependencies and routes are 100% free of Razorpay client code.
