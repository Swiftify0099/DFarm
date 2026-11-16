# DFarm Super Admin — Real Email Delivery & Claymorphic HTML Template Specification

## Overview

The Primary Dairy Admin activation workflow relies on guaranteed, auditable email delivery. This document describes the SMTP email integration, the responsive Claymorphic HTML template architecture, environment configuration, and failure-handling procedures implemented in `services/backend/src/infrastructure/email/EmailService.ts`.

---

## 1. SMTP Provider Configuration

Email dispatch is executed natively via **Nodemailer** using standard TLS/STARTTLS SMTP protocol.

### Environment Variable Contract:
```bash
# SMTP Server Configuration
SMTP_HOST=smtp.gmail.com          # Or sendgrid.net, mailgun.org, aws-ses, etc.
SMTP_PORT=587                     # 587 (TLS/STARTTLS) or 465 (SSL)
SMTP_SECURE=false                 # true for 465, false for other ports
SMTP_USER=d.farm.expart@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="DFarm Platform <d.farm.expart@gmail.com>"

# Public Web URL for Deep-Links
PUBLIC_WEB_URL=https://dairy.dfarm.in
PUBLIC_ACTIVATION_URL=https://dairy.dfarm.in/activate
```

### Connection Pool & Transporter Lifecycle:
- `EmailService` initializes an active transporter upon application boot.
- If SMTP credentials are missing or unreachable, `EmailService` logs a clear diagnostic alert and fails gracefully without crashing the server or discarding newly provisioned tenants.

---

## 2. Claymorphic HTML Email Design System

The email dispatched to the Primary Dairy Admin features a responsive, modern **Claymorphic** visual aesthetic consistent with the DFarm Design System:

### Visual Elements:
1. **Claymorphic Canvas & Cards:**
   - Outer container in light warm clay `#F7F2EE`.
   - Inner elevated card in crisp white `#FFFFFF` with multi-layered soft drop shadows (`box-shadow: 0 12px 32px rgba(33,27,24,0.06), 0 2px 6px rgba(33,27,24,0.04)`).
   - Rounded borders (`border-radius: 20px`) and hairline clay borders (`#EBE3DE`).
2. **DFarm Brand Signature:**
   - Warm Amber / International Orange `#FF6A00` primary buttons and pill accents.
   - Dark Chocolate `#211B18` high-contrast typography for readability.
   - Secondary neutral `#817A75` for instructional and supporting text.
3. **Structured Tenant Metadata Table:**
   - Soft background panel (`#FAF6F3`) displaying:
     - **Dairy Organization:** e.g., *Shree Krishna Sahakari Dudh Sanstha*
     - **Dairy Code:** e.g., `DF-SAN-7082` (Monospace format)
     - **Primary Administrator:** *Santosh Patil*
     - **Registered Email:** *admin@dairy.org*
     - **Validity Period:** *48 Hours*
4. **Primary Call to Action:**
   - Large, finger-friendly button: `Activate Dairy Admin Account`.
   - Subtle outer glow shadow (`0 6px 18px rgba(255,106,0,0.35)`).
5. **Fallback Hyperlink:**
   - Plain-text URL block for email clients that disable interactive HTML buttons.
6. **Zero-Trust Security Footer:**
   - Explains that DFarm will never request passwords, OTPs, or face biometrics via email.
   - Instructions on what to do if the recipient did not request onboarding.

---

## 3. Delivery Tracking & Auditing

The system does not claim an email was delivered merely because an API request was fired. `EmailService.sendActivationInvitation()` captures rich delivery telemetry:

```typescript
export interface EmailSendResult {
  success: boolean;
  status: 'ACCEPTED' | 'DELIVERED' | 'FAILED';
  provider: string;
  messageId?: string;
  acceptedRecipients?: string[];
  rejectedRecipients?: string[];
  error?: string;
  timestamp: string;
}
```

### Captured Telemetry:
- **Provider Name:** `nodemailer-smtp`
- **Provider Message ID:** e.g., `<39b0f182-4c28-984e-3f62-2c678a9c8b74@dfarm.in>`
- **Accepted / Rejected Recipients:** Verified against SMTP server acceptance receipts.
- **Persistence:** Logged in the audit log and stored in `dairy_admin_invitations.delivery_status` and `delivery_message_id`.

---

## 4. Failure Modes & Provisioning Behavior

If the tenant database record is provisioned but SMTP delivery fails (e.g. invalid SMTP credentials, DNS failure, or recipient mailbox rejection):

1. **Non-Destructive Retention:** The newly created Dairy tenant and Primary Admin record are **preserved** in the database in `draft_onboarding` and `pending_verification` status.
2. **UI Transparency:** The Super Admin creation screen immediately reports:
   - Warning badge: `Email Delivery Failed`
   - Detailed failure diagnostic code (e.g., `EAI_FAIL`, `550 Mailbox not found`).
3. **Copy Link Fallback:** The Super Admin can still copy the Genuine Activation Link directly and send it through a secondary administrative channel.
4. **Resend Activation Action:** The Super Admin can click `Resend Activation Invitation` from the Dairy Detail page once network connectivity or email credentials are restored, without creating duplicate tenants.
