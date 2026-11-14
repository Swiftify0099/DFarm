# DFarm Customer Mobile Application — Security Architecture & Policy

## 1. Threat Model & Security Posture
The customer mobile application runs in an untrusted client environment on diverse end-user Android and iOS hardware. Consequently:
- The mobile client is treated as an **untrusted interface**.
- All business logic, accounting invariants, rate calculations, and authorizations are strictly enforced on the backend.
- Customer accounts are strictly partitioned into a dedicated security domain.

---

## 2. Customer Identity & Session Management

### 2.1 Supabase Authentication Integration
- Customer authentication uses verified mobile OTP authentication managed by Supabase Auth.
- No dummy OTP codes or arbitrary customer registration is permitted during the login phase.
- Customer UUIDs are linked to Supabase Auth UUIDs through backend-controlled onboarding only.
- A customer cannot supply or switch to another Customer UUID.

### 2.2 Secure Hardware-Backed Token Storage
- Tokens are stored using `expo-secure-store`, utilizing Android KeyStore (AES-256 GCM) on Android and iOS Keychain (Secure Enclave) on Apple devices.
- Fallback storage in `AsyncStorage` is only activated in test harnesses or web sandboxes where hardware keystores are unavailable.
- Upon logout, both the `SecureStore` access token and all offline cached business data in `AsyncStorage` are permanently wiped.

---

## 3. Strict Customer Data Isolation
Every API endpoint exposed to or accessible by the mobile app is protected by the `requireCustomerOwnership` middleware.

```typescript
// Backend Enforcement Middleware
export function requireCustomerOwnership(extractCustomerId: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw new UnauthorizedError('Authentication required', 'UNAUTHORIZED');
    }
    const targetCustomerId = extractCustomerId(req);
    if (req.auth.actorType === 'CUSTOMER') {
      const allowedCustId = req.auth.customerProfile?.customerId || req.auth.userId;
      if (allowedCustId !== targetCustomerId) {
        throw new ForbiddenError(
          'Customer accounts may only access their own profile and records',
          'CUSTOMER_ISOLATION_VIOLATION'
        );
      }
    }
    next();
  };
}
```

### Verified Protections:
1. **Cross-Customer Profile Isolation**: Customer A cannot read Customer B's profile, KYC, or mobile details (Returns HTTP 403 `CUSTOMER_ISOLATION_VIOLATION`).
2. **Dashboard Isolation**: Customer A cannot view Customer B's KPI metrics or milk totals (Returns HTTP 403 `CUSTOMER_ISOLATION_VIOLATION`).
3. **Milk Intake Isolation**: Customer A cannot view Customer B's collection history or search filters (Returns HTTP 403 `CUSTOMER_ISOLATION_VIOLATION`).
4. **Thermal Receipt Isolation**: Customer A cannot view or print Customer B's 40-column thermal slips (Returns HTTP 403 `CUSTOMER_ISOLATION_VIOLATION`).
5. **Ledger Isolation**: Customer A cannot inspect Customer B's passbook or double-entry transactions (Returns HTTP 403 `CUSTOMER_ISOLATION_VIOLATION`).
6. **Notifications Isolation**: Customer A cannot view, mark read, or dismiss Customer B's notifications (Returns HTTP 403 `CUSTOMER_ISOLATION_VIOLATION`).
7. **Profile Edit Isolation**: Customer A cannot modify Customer B's preferences or settings (Returns HTTP 403 `CUSTOMER_ISOLATION_VIOLATION`).

---

## 4. Privacy & Data Protection (DPDP Act 2023 Compliance)

### 4.1 Masked Financial Information
- Bank account numbers are never transmitted in full to the mobile application.
- The backend sanitizes bank account numbers to the masked pattern:
  `XXXX-XXXX-${last4Digits}` (e.g., `XXXX-XXXX-9012`).
- Account holder names are masked when rendering public or shared receipts.

### 4.2 Zero Biometric Template Leakage
- Biometric facial vectors, 512-dimension face embeddings, and fingerprint templates stored in DFarm for offline intake identification are **strictly quarantined** in backend encrypted storage.
- Customer-facing endpoints are explicitly sanitized to ensure `facialVector`, `biometricTemplate`, and `fingerprintData` are stripped prior to serialization.
- The mobile app contains zero biometric extraction or storage code.

---

## 5. Network & Transport Security
- **TLS 1.3**: All communications between the mobile application and backend require HTTPS/TLS 1.3.
- **Request Tracing**: Every outbound request carries a unique UUID correlation header (`X-Request-Id`) logged across backend audit logs.
- **Session Expiry**: When a token expires (HTTP 401), the mobile client automatically redirects the user to `LoginScreen` and purges cached tokens.
- **Rate Limiting**: Customer endpoints are rate-limited to 100 requests per minute per IP to prevent automated scraping.
