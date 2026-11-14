# DFarm Notification, Push & WhatsApp REST API Reference

## 1. Overview & Base URLs

Base Path: `/api/v1`

Authentication: Bearer JWT (`Authorization: Bearer <token>`)

---

## 2. Notification Outbox Endpoints

### 2.1 Enqueue Notification
```http
POST /api/v1/notifications/enqueue
```
**Roles Allowed**: `SUPER_ADMIN`, `DAIRY_OWNER`, `DAIRY_ADMIN`, `CENTER_MANAGER`, `ACCOUNTANT`, `SUPERVISOR`

#### Request Body
```json
{
  "customerId": "7daee1a3-5a54-43a2-8b43-c9c599f46294",
  "eventType": "MILK_COLLECTION_COMPLETED",
  "eventId": "evt_collection_12345",
  "idempotencyKey": "idem_collection_12345",
  "channels": ["WHATSAPP", "IN_APP"],
  "forceLanguage": "mr",
  "metadata": {
    "shift": "MORNING",
    "milkType": "COW",
    "quantity": 12.5,
    "fat": 4.2,
    "snf": 8.5,
    "ratePerUnit": 36.0,
    "totalAmount": 450.0,
    "receiptNumber": "REC-12345"
  }
}
```

#### Response (201 Created)
```json
{
  "success": true,
  "data": [
    {
      "id": "beedbf73-1c45-444d-b3bb-d2060b890b8a",
      "channel": "WHATSAPP",
      "status": "BLOCKED",
      "failureReason": "WhatsApp access token or phone number ID not configured in environment",
      "createdAt": "2026-11-14T07:40:51.728Z"
    },
    {
      "id": "a70fac66-1410-49a9-9a19-665cfcba4fd5",
      "channel": "IN_APP",
      "status": "DELIVERED",
      "createdAt": "2026-11-14T07:40:51.759Z"
    }
  ]
}
```

---

### 2.2 Trigger Retries for Pending Notifications
```http
POST /api/v1/notifications/retry-pending
```
**Roles Allowed**: `SUPER_ADMIN`, `DAIRY_OWNER`, `DAIRY_ADMIN`

#### Request Body (Optional)
```json
{
  "limit": 50
}
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "processed": 12,
    "succeeded": 10,
    "failed": 2
  }
}
```

---

### 2.3 List Notification Templates
```http
GET /api/v1/notifications/templates
```
**Roles Allowed**: Staff Roles

#### Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "tpl_wa_collection_mr",
      "eventType": "MILK_COLLECTION_COMPLETED",
      "channel": "WHATSAPP",
      "language": "mr",
      "titleTemplate": "दूध संकलन पावती - {{shift}}",
      "whatsappTemplateName": "dfarm_milk_collection_mr"
    }
  ]
}
```

---

## 3. Customer Mobile Endpoints (In-App Inbox & Preferences)

### 3.1 Get Customer In-App Notifications
```http
GET /api/v1/customers/:customerId/notifications?page=1&limit=20&isRead=false
```
**Authorization**: Customer self-token or Center Staff

#### Response (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": "a70fac66-1410-49a9-9a19-665cfcba4fd5",
      "eventType": "MILK_COLLECTION_COMPLETED",
      "channel": "IN_APP",
      "title": "दूध संकलन पावती - सकाळ",
      "body": "आपले 12.50 L गाय दूध स्वीकारले आहे...",
      "status": "DELIVERED",
      "readAt": null,
      "createdAt": "2026-11-14T07:40:51.759Z"
    }
  ],
  "meta": {
    "unreadCount": 3,
    "page": 1,
    "limit": 20
  }
}
```

---

### 3.2 Mark Notification as Read
```http
PATCH /api/v1/customers/:customerId/notifications/:notificationId/read
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "id": "a70fac66-1410-49a9-9a19-665cfcba4fd5",
    "status": "READ",
    "readAt": "2026-11-14T07:41:00.123Z"
  }
}
```

---

### 3.3 View Notification Receipt
```http
GET /api/v1/customers/:customerId/notifications/:notificationId/receipt
```

#### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "notificationId": "a70fac66-1410-49a9-9a19-665cfcba4fd5",
    "eventType": "MILK_COLLECTION_COMPLETED",
    "receiptDetails": {
      "receiptNumber": "REC-12345",
      "totalAmount": 450.0,
      "shift": "MORNING",
      "milkType": "COW",
      "quantity": 12.5,
      "fat": 4.2,
      "snf": 8.5
    }
  }
}
```

---

### 3.4 Manage Communication Preferences
```http
GET /api/v1/customers/:customerId/communication-preferences
PUT /api/v1/customers/:customerId/communication-preferences
```

#### PUT Body
```json
{
  "whatsappOptIn": true,
  "pushOptIn": true,
  "smsOptIn": false,
  "preferredLanguage": "mr"
}
```

---

### 3.5 Device Token Management (FCM)
```http
POST /api/v1/customers/:customerId/devices/tokens
POST /api/v1/customers/:customerId/devices/tokens/refresh
DELETE /api/v1/customers/:customerId/devices/tokens/:deviceId
```

#### Registration Body
```json
{
  "deviceId": "samsung-sm-g991b-uuid",
  "devicePlatform": "ANDROID",
  "fcmToken": "fcm_reg_token_abc123..."
}
```

---

## 4. Meta WhatsApp Webhook Endpoints

### 4.1 Challenge Verification
```http
GET /api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=dfarm_verify_token&hub.challenge=1158201244
```

### 4.2 Status Receipts & Delivery Callbacks
```http
POST /api/v1/webhooks/whatsapp
x-hub-signature-256: sha256=<hmac_sha256_hash>
Content-Type: application/json
```
Verifies HMAC signature, performs idempotency check against replay attacks, and updates message status to `DELIVERED`, `READ`, or `FAILED`.
