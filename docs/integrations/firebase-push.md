# Firebase Cloud Messaging (FCM) Push Notification Integration

## 1. Overview

DFarm utilizes **Firebase Cloud Messaging (FCM)** via Google HTTP v1 API to deliver high-priority push notifications to registered customer mobile devices (Android and iOS).

---

## 2. Security Boundaries & Credential Isolation

- **Private Service Credentials Isolated on Backend**: FCM service account keys and client emails are **only** stored in backend environment variables.
- **Android APK Security Rule**: Firebase private service keys, client secrets, or service account JSON files are **NEVER** bundled into mobile APKs or web clients. Mobile devices only receive public project identifiers and ephemeral device tokens.

```bash
# Firebase Cloud Messaging Credentials
FCM_ENABLED=true
FCM_PROJECT_ID=dfarm-smart-dairy
FCM_CLIENT_EMAIL=firebase-adminsdk@dfarm-smart-dairy.iam.gserviceaccount.com
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----"
```

---

## 3. Device Token Lifecycle Management

```mermaid
sequenceDiagram
    autonumber
    actor Farmer as Customer Mobile App
    participant API as Customer Device Token API
    participant DB as PostgreSQL DB
    participant FCM as Firebase Cloud Messaging

    Farmer->>Farmer: On App Launch / FCM onNewToken()
    Farmer->>API: POST /api/v1/customers/:id/devices/tokens { deviceId, platform, fcmToken }
    API->>DB: UPSERT customer_device_tokens (isActive = TRUE)
    DB-->>API: Token Registered
    API-->>Farmer: 200 OK

    Note over API,FCM: Outbound Push Notification Triggered
    API->>FCM: POST /v1/projects/{id}/messages:send
    alt Token Valid
        FCM-->>API: 200 OK (name: projects/.../messages/0:1234)
    else Token Expired / Unregistered (HTTP 404 / UNREGISTERED)
        FCM-->>API: 404 UNREGISTERED
        API->>DB: UPDATE customer_device_tokens SET is_active = FALSE (FCM_UNREGISTERED)
    end

    Note over Farmer,API: Device Logout
    Farmer->>API: DELETE /api/v1/customers/:id/devices/tokens/:deviceId
    API->>DB: UPDATE customer_device_tokens SET is_active = FALSE (USER_LOGOUT)
    API-->>Farmer: 200 OK
```

### Automatic Invalid Token Cleanup
When Firebase returns `UNREGISTERED` or `INVALID_ARGUMENT`, `DeviceTokenService.deactivateToken()` immediately sets `is_active = FALSE` and records `deactivation_reason = 'FCM_UNREGISTERED'`. This guarantees stale tokens are excluded from future notification batches, preventing API quota waste.
