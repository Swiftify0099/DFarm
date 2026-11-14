# DFarm: Synchronization & Device Management REST API Specification

All sync endpoints are prefixed with `/api/v1` and require authenticated device authorization via HTTP Header:
`Authorization: Bearer <device_token>` (or `X-Device-Token: <device_token>` / `X-Device-ID: <device_id>`).

---

## 1. POST `/api/v1/devices/register`

Provisions a new hardware counter terminal or registration tablet, assigns it to a procurement center, and issues a cryptographically signed device JWT.

### Request Body
```json
{
  "deviceIdentifier": "POS-TERM-8316",
  "deviceType": "COUNTER_TERMINAL",
  "organizationId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
  "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
  "publicKey": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8...",
  "appVersion": "1.0.0",
  "model": "Samsung Galaxy Tab Active4 Pro",
  "serialNumber": "SN-A1B2C3D4"
}
```

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "deviceId": "578f11db-e889-4494-ad14-2e4725d94037",
    "deviceIdentifier": "POS-TERM-8316",
    "organizationId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
    "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
    "deviceType": "COUNTER_TERMINAL",
    "status": "ACTIVE",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "maxOfflineHours": 72,
    "registeredAt": "2026-11-14T03:22:11.416Z"
  }
}
```

---

## 2. POST `/api/v1/devices/revoke`

Administratively blocks a lost, stolen, or decommissioned device, invalidates its token hash, and triggers fail-closed security.

### Request Body
```json
{
  "deviceId": "578f11db-e889-4494-ad14-2e4725d94037",
  "deviceIdentifier": "POS-TERM-8316",
  "reason": "Hardware lost or decommissioned"
}
```

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "deviceId": "578f11db-e889-4494-ad14-2e4725d94037",
    "status": "BLOCKED",
    "reason": "Hardware lost or decommissioned",
    "revokedAt": "2026-11-14T03:22:11.853Z"
  }
}
```

---

## 3. GET `/api/v1/sync/status`

Retrieves the current authorization status, last sync timestamp, and configured offline window for the calling device.

### Headers
`Authorization: Bearer <device_token>`

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "deviceId": "578f11db-e889-4494-ad14-2e4725d94037",
    "deviceIdentifier": "POS-TERM-8316",
    "deviceType": "COUNTER_TERMINAL",
    "status": "ACTIVE",
    "maxOfflineHours": 72,
    "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
    "downstreamCursor": 45,
    "downstreamTombstoneCursor": 2,
    "lastSyncAt": "2026-11-14T03:22:11.853Z"
  }
}
```

---

## 4. POST `/api/v1/sync/push`

Uploads an atomic batch of edge collection events or offline customer registration drafts.

### Headers
`Authorization: Bearer <device_token>`

### Request Body
```json
{
  "deviceId": "578f11db-e889-4494-ad14-2e4725d94037",
  "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
  "events": [
    {
      "id": "e42392ef-d9f0-4540-aceb-8d80c85a2f50",
      "entityType": "MILK_COLLECTION",
      "entityId": "e42392ef-d9f0-4540-aceb-8d80c85a2f50",
      "action": "INSERT",
      "idempotencyKey": "IDEMP-COL-e42392ef-d9f0-4540-aceb-8d80c85a2f50",
      "createdAt": "2026-11-14T03:22:11.500Z",
      "payload": {
        "sessionId": "60624c81-09ba-4e4f-b6e8-ae81330588a1",
        "customerId": "canonical-cust-uuid",
        "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
        "businessDate": "2026-11-14",
        "shiftType": "MORNING",
        "milkCategory": "COW",
        "netWeight": 28.5,
        "fatPercentage": 4.2,
        "snfPercentage": 8.6,
        "appliedRatePerUnit": 39.0,
        "totalAmount": 1111.50,
        "identificationMethod": "FACE",
        "clientIntakeUuid": "60624c81-09ba-4e4f-b6e8-ae81330588a1"
      }
    }
  ]
}
```

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "success": true,
    "applied": 1,
    "conflicts": 0,
    "results": [
      {
        "eventId": "e42392ef-d9f0-4540-aceb-8d80c85a2f50",
        "status": "COMMITTED",
        "entityId": "e42392ef-d9f0-4540-aceb-8d80c85a2f50"
      }
    ],
    "processedAt": "2026-11-14T03:22:11.646Z"
  }
}
```

---

## 5. GET `/api/v1/sync/pull`

Downloads delta changesets for customers, rate chart grids, hardware-encrypted face templates, and soft-delete tombstones.

### Query Parameters
- `cursor`: Integer high-water mark of synced records (default `0`)
- `tombstoneCursor`: Integer high-water mark of tombstones (default `0`)
- `centerId`: (Optional) Center UUID filter

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "id": "canonical-cust-uuid",
        "farmerCode": "F-123456",
        "fullName": "Balu Shripati Patil",
        "mobilePhone": "+919822334455",
        "primaryCenterId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
        "status": "ACTIVE",
        "updatedAt": "2026-11-14T03:22:11.000Z"
      }
    ],
    "rateCards": [
      {
        "id": "rate-cell-uuid",
        "rateChartVersionId": "version-uuid",
        "fatPercentage": 4.0,
        "snfPercentage": 8.5,
        "ratePerUnit": 38.0
      }
    ],
    "faceTemplates": [
      {
        "id": "template-uuid",
        "customerId": "canonical-cust-uuid",
        "modelVersionId": "model-uuid",
        "modelName": "MobileFaceNet-V1",
        "modelVersion": "1.0.0",
        "cryptoNonce": "b64nonce...",
        "authTag": "b64tag...",
        "encryptedEmbedding": "b64embedding...",
        "status": "ACTIVE",
        "updatedAt": "2026-11-14T03:22:11.000Z"
      }
    ],
    "tombstones": [
      {
        "id": "tombstone-uuid",
        "entityType": "CUSTOMER",
        "entityId": "deleted-cust-uuid",
        "reason": "Farmer deceased",
        "revokedAt": "2026-11-14T03:22:11.000Z"
      }
    ],
    "currentCursor": 1,
    "nextCursor": 1,
    "currentTombstoneCursor": 1,
    "nextTombstoneCursor": 1,
    "maxOfflineHours": 72,
    "syncedAt": "2026-11-14T03:22:11.682Z",
    "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8"
  }
}
```

---

## 6. POST `/api/v1/sync/acknowledge`

Commits client cursor advancement on the server after the SQLite transaction has committed locally.

### Request Body
```json
{
  "deviceId": "578f11db-e889-4494-ad14-2e4725d94037",
  "downstreamCursor": 1,
  "downstreamTombstoneCursor": 1,
  "clientAppVersion": "1.0.0"
}
```

### Response (200 OK)
```json
{
  "success": true,
  "data": {
    "deviceId": "578f11db-e889-4494-ad14-2e4725d94037",
    "downstreamCursor": 1,
    "downstreamTombstoneCursor": 1,
    "acknowledgedAt": "2026-11-14T03:22:12.000Z"
  }
}
```

