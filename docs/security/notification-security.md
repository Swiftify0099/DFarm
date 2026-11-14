# DFarm Notification Engine Security & Data Privacy

## 1. Threat Model & Security Posture

The Notification Engine operates on sensitive customer data, including financial balances, milk collection measurements, bank account numbers, and communication tokens.

### Key Threats & Mitigations

| Threat | Risk | Mitigation |
| :--- | :--- | :--- |
| **Credential Exfiltration** | Leak of Meta tokens or Firebase private keys | Keys stored exclusively in backend `.env` / secret vaults. Never committed to source code or bundled into mobile APKs. |
| **Webhook Spoofing / Tampering** | Malicious injection of fake delivery receipts | Meta HMAC-SHA256 signature verification on raw request body using `crypto.timingSafeEqual`. |
| **Replay Attacks** | Replaying captured webhook payloads | Every incoming webhook event ID is recorded in `provider_event_records` with an atomic unique constraint. |
| **PII / Financial Data Leak** | Exposure of raw phone numbers or bank accounts in logs | Mandatory phone number masking (`+9198*****210`) and bank account masking (`XXXX-XXXX-1234`) across all log messages. |
| **Spam / Unsolicited Messaging** | Sending messages without consent | Strict consent enforcement against `whatsapp_customer_mappings` and `customer_consent_records` before every dispatch. |
| **Cross-Customer Data Snooping** | Farmer reading another customer's notifications | Center and Customer Ownership RLS policies + explicit controller token customer verification. |

---

## 2. Customer Consent & Opt-Out Enforcement

### Consent Hierarchy
Before any outbound notification is dispatched:
1. **In-App Notifications**: Internal operational ledger records, always allowed.
2. **WhatsApp Channel**:
   - `whatsapp_customer_mappings.is_opted_in` must be `TRUE`.
   - `customer_consent_records` must NOT have an active revocation for `COMMUNICATION_WHATSAPP`.
3. **Push Channel**:
   - Customer must have active device tokens in `customer_device_tokens`.
   - `customer_consent_records` must NOT have an active revocation for `COMMUNICATION_PUSH`.

### Opt-Out API
Customers can update their communication preferences at any time:
```http
PUT /api/v1/customers/:customerId/communication-preferences
Authorization: Bearer <customer_token>
Content-Type: application/json

{
  "whatsappOptIn": false,
  "pushOptIn": true,
  "preferredLanguage": "mr",
  "optOutReason": "Do not send WhatsApp alerts"
}
```
When opted out, all subsequent WhatsApp dispatches are automatically suppressed and logged with reason `Customer opted out of WhatsApp communication`.

---

## 3. Privacy & Data Masking Standards

1. **Phone Number Masking**:
   - Evaluated by `maskPhoneNumber(phone)`.
   - Formats: `+919876543210` $\rightarrow$ `+9198*****210`.
   - All server logs and third-party transmission logs use masked values.
2. **Bank Account Details**:
   - Never exposes full bank account number in notification text.
   - Bank accounts are masked as `XXXX-XXXX-1234` or `...1234`.
3. **Biometrics & Secrets**:
   - Notification payloads **never** contain biometric embeddings, facial templates, PINs, or raw cryptographic tokens.
