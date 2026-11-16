# DFarm Super Admin — Mandatory Email Specification & Validation Architecture

## Overview

The onboarding of a new Dairy Tenant in DFarm requires a guaranteed, verified destination for administrative credentials and cryptographic activation tokens. This document defines the frontend and backend validation rules, schema transformations, and migration policies for the **Primary Admin / Business Email** field.

---

## 1. Field Definition & Presentation

In the Super Admin Guided Dairy Onboarding modal, Step 1 previously contained an optional field labeled `Business Email (Optional)`. This has been completely revised:

- **Field Label:** `Primary Admin / Business Email`
- **Required Indicator:** Prominent red asterisk (`*`) and HTML `required` attribute.
- **Helper Description:** *"The secure cryptographic activation link and invitation will be dispatched to this verified email."*
- **Step 2 Summary Callout:** An explicit summary card in Step 2 confirms:
  ```
  Activation email will be delivered to: admin@shreekrishna.coop
  ```
- **Single Source of Truth:** The email captured in Step 1 serves as the business contact email and the Primary Dairy Admin's verified activation destination. This avoids duplicate or conflicting email fields.

---

## 2. Frontend Validation Rules

Validation is executed using **Zod** within `CreateDairyModal.tsx` before allowing navigation to Step 2:

```typescript
businessEmail: z
  .string()
  .trim()
  .min(1, 'Primary Admin / Business Email is required for activation')
  .email('Please enter a valid email address (e.g. admin@dairy.org)')
  .transform((val) => val.trim().toLowerCase()),
```

### Key Frontend Enforcement Behaviors:
1. **Empty Submission Blocked:** Form progression is halted if the user leaves the email field blank.
2. **Whitespace Stripping:** Leading and trailing whitespace is automatically trimmed.
3. **Casing Normalization:** Email strings are normalized to lowercase to avoid duplicate casing collisions (e.g., `Admin@Dairy.Org` $\to$ `admin@dairy.org`).
4. **Format Validation:** Verified against standard RFC 5322 email patterns.
5. **Plus-Addressing Support:** Sub-addressing / plus-tags (e.g., `admin+nashik@dfarm.in`) are fully supported and preserved.
6. **No Dummy/Fabricated Emails:** Common placeholders such as `test@test.com` or `a@a.com` trigger client warnings or backend rejections.

---

## 3. Backend Validation Rules

Client-side validation is never solely relied upon. `services/backend/src/presentation/routes/dairies.routes.ts` enforces multi-layer verification upon `POST /api/v1/dairies`:

```typescript
const normalizedEmail = (businessEmail || '').trim().toLowerCase();

if (!normalizedEmail) {
  res.status(400).json({
    success: false,
    error: 'Primary Admin / Business Email is required to provision a dairy tenant and dispatch activation credentials.',
  });
  return;
}

const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
if (!emailRegex.test(normalizedEmail)) {
  res.status(400).json({
    success: false,
    error: 'Invalid business email format. Please provide a valid email address (e.g. admin@dairy.org).',
  });
  return;
}
```

### Conflict Detection & Identity Security:
- The system checks if `normalizedEmail` is already bound to an active Primary Dairy Admin in another organization.
- If duplicate active accounts are detected, the API returns HTTP 409 / 400 with a clean error message, preventing unauthorized tenant takeovers or identity collision.

---

## 4. Treatment of Legacy Records

Prior to this fix, legacy Dairies created in early development may have had a `null` or missing business email:

1. **Non-Destructive Approach:** Existing records in the database with `NULL` email values are **not** deleted, mutated, or corrupted with dummy data.
2. **Safe Migration:** Migration `029_dairy_admin_activation_tokens.sql` applies column defaults safely without breaking legacy records.
3. **On-Demand Update Rule:** If an administrator attempts to issue an invitation resend for a legacy Dairy lacking an email, the system safely prompts:
   ```
   "A valid email address is required before an activation invitation can be dispatched."
   ```
   The Dairy Detail page provides an update mechanism to specify the verified email prior to dispatch.
