# Meta WhatsApp Business Cloud API Integration

## 1. Overview

DFarm integrates directly with the **Meta WhatsApp Business Cloud API** (Graph API v21.0) to provide automated, transactional WhatsApp notifications, receipts, and statements to registered dairy farmers.

---

## 2. Environment Configuration

The WhatsApp adapter strictly consumes environment variables validated via Zod schema (`services/backend/src/config/env.ts`):

```bash
# Meta WhatsApp Business Cloud API Configuration
WHATSAPP_ENABLED=true
WHATSAPP_PHONE_NUMBER_ID=109283746501928
WHATSAPP_BUSINESS_ACCOUNT_ID=982736450192837
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=dfarm_whatsapp_webhook_verify_secret_token
WHATSAPP_APP_SECRET=a1b2c3d4e5f60718293a4b5c6d7e8f90
```

### Unconfigured / Blocked Integration Policy
If `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` are missing, the system:
1. Logs diagnostic warning: `WhatsApp integration BLOCKED: Real credentials not configured in environment`.
2. Sets record status to `BLOCKED`.
3. Records log in `notification_delivery_logs`.
4. **Never fabricates fake external delivery**.

---

## 3. Approved Meta Message Templates

All outbound business-initiated WhatsApp messages use pre-approved Meta message templates:

| Template Name | Language | Purpose | Parameters / Variables |
| :--- | :--- | :--- | :--- |
| `dfarm_milk_collection_mr` | Marathi | Milk intake receipt | `customerName`, `shift`, `milkType`, `quantity`, `fat`, `snf`, `ratePerUnit`, `totalAmount`, `receiptNumber` |
| `dfarm_milk_collection_en` | English | Milk intake receipt | `customerName`, `shift`, `milkType`, `quantity`, `fat`, `snf`, `ratePerUnit`, `totalAmount`, `receiptNumber` |
| `dfarm_monthly_bill_mr` | Marathi | Monthly billing statement | `customerName`, `periodName`, `grossAmount`, `netPayable`, `billNumber` |
| `dfarm_monthly_bill_en` | English | Monthly billing statement | `customerName`, `periodName`, `grossAmount`, `netPayable`, `billNumber` |
| `dfarm_payment_settled_mr` | Marathi | Payout confirmation | `customerName`, `amount`, `paymentMethod`, `referenceNumber`, `bankAccountMask` |
| `dfarm_payment_settled_en` | English | Payout confirmation | `customerName`, `amount`, `paymentMethod`, `referenceNumber`, `bankAccountMask` |
| `dfarm_payment_failed_mr` | Marathi | Payout failure alert | `customerName`, `amount`, `referenceNumber`, `failureReason` |
| `dfarm_payment_failed_en` | English | Payout failure alert | `customerName`, `amount`, `referenceNumber`, `failureReason` |
| `dfarm_feed_purchase_mr` | Marathi | Cattle feed sales receipt | `customerName`, `productName`, `quantity`, `totalAmount`, `receiptNumber` |
| `dfarm_feed_purchase_en` | English | Cattle feed sales receipt | `customerName`, `productName`, `quantity`, `totalAmount`, `receiptNumber` |

---

## 4. Webhook Architecture & Security

### 4.1 Verification Handshake (GET `/api/v1/webhooks/whatsapp`)
Meta verifies webhooks by sending a GET request containing:
- `hub.mode`: Expected `'subscribe'`
- `hub.verify_token`: Must match `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `hub.challenge`: Plain text echo string

When valid, the server returns HTTP 200 with the plain-text challenge.

### 4.2 Status Updates & HMAC Verification (POST `/api/v1/webhooks/whatsapp`)
Every incoming status update from Meta is authenticated using HMAC-SHA256:
1. Meta sends signature in header: `x-hub-signature-256: sha256=<hex_digest>`.
2. The server computes HMAC-SHA256 using `req.rawBody` and `WHATSAPP_APP_SECRET`.
3. Signatures are verified using timing-safe buffer comparison (`crypto.timingSafeEqual`) to prevent side-channel timing attacks.
4. If missing or invalid, HTTP 400 Bad Request is returned immediately.

### 4.3 Webhook Replay Protection
To protect against network replays:
1. Unique composite key `wa_status_${wamid}_${status}` is generated.
2. Verified against `provider_event_records`.
3. If already processed, acknowledged idempotently with `{ duplicate: true }` without updating records again.
4. Otherwise, updates status in `whatsapp_messages` and `notification_records` (`DELIVERED`, `READ`, `FAILED`).
