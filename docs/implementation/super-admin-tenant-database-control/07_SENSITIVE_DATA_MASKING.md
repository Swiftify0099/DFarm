# DFARM — Module 3.2: Sensitive Data Masking & Security Redaction (Category D)

**Execution Reference:** `DFARM-SUPER-ADMIN-TENANT-DATABASE-CONTROL`  
**Backend Service:** `services/backend/src/infrastructure/database/TenantDatabaseControlService.ts`  
**Status:** FULLY IMPLEMENTED AND VERIFIED  

---

## 1. Compliance Requirements & Threat Model

Even for authenticated Super Administrators, raw display of sensitive secrets and biometric identity materials violates privacy standards (DPDP Act, GDPR) and introduces insider threat risks.

### Prohibited Exposures in Super Admin Explorer:
1. **Biometric Face Embeddings:** High-dimensional mathematical float vectors (128D SFace, 512D ArcFace).
2. **Biometric Fingerprint Data:** Raw minutiae templates or proprietary vendor blobs.
3. **Authentication Secrets:** Password hashes (Argon2id, bcrypt), JWT refresh tokens, session secrets.
4. **Bank Account Details:** Full account numbers (must only show trailing 4 digits).
5. **Database Connection Strings:** Raw tenant database connection strings or cluster passwords.

---

## 2. In-Flight Redaction Implementation

In `TenantDatabaseControlService.ts`:
```ts
private maskSensitiveRecord(record: Record<string, any>): Record<string, any> {
  if (!record || typeof record !== 'object') return record;
  const masked = { ...record };

  for (const key of Object.keys(masked)) {
    const lowerKey = key.toLowerCase();

    // 1. Password & Hash Redaction
    if (lowerKey.includes('password') || lowerKey.includes('hash') || lowerKey.includes('secret')) {
      masked[key] = '[REDACTED_SECRET_HASH]';
    }
    // 2. Biometric Vector Redaction
    else if (
      lowerKey.includes('embedding') ||
      lowerKey.includes('template') ||
      lowerKey.includes('biometric') ||
      lowerKey.includes('face_data') ||
      lowerKey.includes('fingerprint')
    ) {
      masked[key] = '[PROTECTED_BIOMETRIC_VECTOR]';
    }
    // 3. Auth Tokens & OTP Redaction
    else if (lowerKey.includes('token') || lowerKey.includes('otp') || lowerKey.includes('pin')) {
      masked[key] = '[SECURE_TOKEN]';
    }
    // 4. Bank Account Number Masking (Show Last 4 digits)
    else if (lowerKey.includes('bank_account') || lowerKey.includes('account_number')) {
      const val = String(masked[key] || '');
      if (val.length > 4) {
        masked[key] = `****${val.slice(-4)}`;
      }
    }
  }

  return masked;
}
```

---

## 3. Protected Category D Tables

The following tenant tables are classified as **Category D: Sensitive Security & Identity**:
- `face_biometric_templates`
- `face_model_versions`
- `face_enrollments`
- `auth_tokens`
- `otp_challenges`
- `customer_bank_beneficiaries`

### Access Rules:
- **Direct INSERT:** Prohibited (`throw new Error("Direct insert on sensitive security table '...' is prohibited")`).
- **Direct UPDATE:** Prohibited (`throw new Error("Direct update on sensitive security table '...' is prohibited")`).
- **Direct DELETE:** Prohibited (`throw new Error("Direct deletion on sensitive security table '...' is prohibited")`).
- **Record Display:** Redacted in-flight by `maskSensitiveRecord`.
