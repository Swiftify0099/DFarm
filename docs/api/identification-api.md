# DFarm Identification REST API Specification

This document details the HTTP REST API endpoints powering the Three-Method Customer Identification system (Phase 08) in DFarm.

Base Path: `/api/v1/identification`

---

## 1. Authentication & Security Headers

All identification endpoints require a valid JWT Bearer token issued during `/api/v1/auth/login`.

```http
Authorization: Bearer <jwt_access_token>
Content-Type: application/json
```

Roles authorized to perform customer identification at intake counters:
- `OPERATOR`
- `SUPERVISOR`
- `CENTER_MANAGER`
- `DAIRY_OWNER`
- `SUPER_ADMIN`

*Note: Only `SUPERVISOR`, `CENTER_MANAGER`, `DAIRY_OWNER`, and `SUPER_ADMIN` may execute manual supervisor override requests (`/supervisor-verify`). Standard `OPERATOR` tokens attempting supervisor overrides receive `403 Forbidden`.*

---

## 2. Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/identification/session` | Initialize a new intake counter identification session |
| `GET` | `/api/v1/identification/session/:sessionId` | Retrieve current status and history of an active session |
| `POST` | `/api/v1/identification/face` | Method 1: Evaluate face recognition probe against local active templates |
| `POST` | `/api/v1/identification/rfid` | Method 2: Evaluate software RFID card tap input |
| `POST` | `/api/v1/identification/supervisor-verify` | Method 3: Supervisor manual identification override with mandatory audit |
| `GET` | `/api/v1/identification/audit` | Query append-only identification audit log records |

---

## 3. Detailed Endpoint Contracts

### 3.1 Start Identification Session

**`POST /api/v1/identification/session`**

Initializes a counter identification transaction, binding the transaction to a center and hardware terminal.

#### Request Body:
```json
{
  "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
  "deviceId": "DEV-COUNTER-01"
}
```

#### Response `201 Created`:
```json
{
  "success": true,
  "data": {
    "sessionId": "a7b31498-8924-42f1-b841-8e7c10b28491",
    "organizationId": "d0e19a84-1234-4567-890a-bcdef1234567",
    "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
    "deviceId": "DEV-COUNTER-01",
    "currentState": "WAITING_FOR_FACE",
    "resolvedCustomerUuid": null,
    "attempts": [],
    "createdAt": "2026-11-14T03:15:00.000Z",
    "updatedAt": "2026-11-14T03:15:00.000Z"
  }
}
```

---

### 3.2 Method 1: Face Recognition Identification

**`POST /api/v1/identification/face`**

Evaluates a live face camera probe vector against authorized active templates enrolled at the center.

#### Request Body:
```json
{
  "sessionId": "a7b31498-8924-42f1-b841-8e7c10b28491",
  "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
  "deviceId": "DEV-COUNTER-01",
  "qualityScore": 0.94,
  "probeEmbedding": [0.012, -0.045, 0.088, "... (128 or 512 dimensions)"]
}
```

#### Successful Match Response `200 OK`:
```json
{
  "success": true,
  "data": {
    "success": true,
    "sessionId": "a7b31498-8924-42f1-b841-8e7c10b28491",
    "currentState": "CUSTOMER_IDENTIFIED",
    "customerUuid": "e6a4b123-4567-8901-2345-678901234567",
    "method": "FACE",
    "auditLogId": "c4d5e6f7-1111-2222-3333-444455556666",
    "message": "Customer successfully identified via Face Recognition",
    "customer": {
      "id": "e6a4b123-4567-8901-2345-678901234567",
      "fullName": "Suresh Patil",
      "farmerCode": "FARM-101",
      "status": "ACTIVE",
      "permittedCategories": ["COW", "BUFFALO"]
    }
  }
}
```

#### Low Confidence / Unknown Fallback Response `200 OK`:
```json
{
  "success": true,
  "data": {
    "success": false,
    "sessionId": "a7b31498-8924-42f1-b841-8e7c10b28491",
    "currentState": "WAITING_FOR_RFID",
    "customerUuid": null,
    "method": "FACE",
    "auditLogId": "d5e6f7a8-2222-3333-4444-555566667777",
    "message": "Face not recognized with sufficient confidence (score below 0.80). Proceeding to RFID card verification.",
    "rejectionReason": "LOW_CONFIDENCE_OR_UNKNOWN"
  }
}
```

---

### 3.3 Method 2: Software RFID Verification

**`POST /api/v1/identification/rfid`**

Accepts normalized hexadecimal RFID UID string from counter software entry or future hardware adapter interface.

#### Request Body:
```json
{
  "sessionId": "a7b31498-8924-42f1-b841-8e7c10b28491",
  "cardUid": "04A1B2C303",
  "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
  "deviceId": "DEV-COUNTER-01"
}
```

#### Successful RFID Match Response `200 OK`:
```json
{
  "success": true,
  "data": {
    "success": true,
    "sessionId": "a7b31498-8924-42f1-b841-8e7c10b28491",
    "currentState": "CUSTOMER_IDENTIFIED",
    "customerUuid": "e6a4b123-4567-8901-2345-678901234567",
    "method": "RFID",
    "auditLogId": "e6f7a8b9-3333-4444-5555-666677778888",
    "message": "Customer successfully identified via RFID card tap",
    "customer": {
      "id": "e6a4b123-4567-8901-2345-678901234567",
      "fullName": "Suresh Patil",
      "farmerCode": "FARM-101",
      "status": "ACTIVE",
      "permittedCategories": ["COW", "BUFFALO"]
    }
  }
}
```

#### Card Blocked / Revoked / Unknown Fallback `200 OK`:
```json
{
  "success": true,
  "data": {
    "success": false,
    "sessionId": "a7b31498-8924-42f1-b841-8e7c10b28491",
    "currentState": "WAITING_FOR_SUPERVISOR",
    "customerUuid": null,
    "method": "RFID",
    "auditLogId": "f7a8b9c0-4444-5555-6666-777788889999",
    "message": "Rejected: RFID Card 04A1B2C303 is REVOKED",
    "rejectionReason": "CARD_REVOKED"
  }
}
```

---

### 3.4 Method 3: Supervisor Manual Verification

**`POST /api/v1/identification/supervisor-verify`**

Authorizes identity resolution when biometric and RFID identification cannot resolve the customer. Requires authenticated supervisor identity, validated center scope, and mandatory audit justification.

#### Request Body:
```json
{
  "sessionId": "a7b31498-8924-42f1-b841-8e7c10b28491",
  "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
  "deviceId": "DEV-COUNTER-01",
  "targetCustomerUuid": "e6a4b123-4567-8901-2345-678901234567",
  "reasonCategory": "LIGHTING_CAMERA_DEFECT",
  "justificationNotes": "Early morning lens glare; physical passbook #PB-401 verified directly with farmer.",
  "authenticatedVia": "PIN"
}
```

#### Allowed Reason Categories:
- `LIGHTING_CAMERA_DEFECT`
- `FACIAL_INJURY_TEMPORARY`
- `POOR_FACE_IMAGE_QUALITY`
- `CARD_DAMAGED`
- `CARD_FORGOTTEN`
- `CARD_MISPLACED_OR_LOST`
- `APPROVED_IDENTITY_CORRECTION`
- `OTHER` (mandatory detailed justification)

#### Response `200 OK`:
```json
{
  "success": true,
  "data": {
    "success": true,
    "sessionId": "a7b31498-8924-42f1-b841-8e7c10b28491",
    "currentState": "CUSTOMER_IDENTIFIED",
    "customerUuid": "e6a4b123-4567-8901-2345-678901234567",
    "method": "SUPERVISOR_MANUAL",
    "auditLogId": "a1b2c3d4-5555-6666-7777-888899990000",
    "message": "Customer successfully verified via Supervisor Manual Override",
    "customer": {
      "id": "e6a4b123-4567-8901-2345-678901234567",
      "fullName": "Suresh Patil",
      "farmerCode": "FARM-101",
      "status": "ACTIVE",
      "permittedCategories": ["COW", "BUFFALO"]
    }
  }
}
```

#### Impersonation / Unauthorized Error `403 Forbidden`:
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied: User is not an authorized supervisor for this center. Operator cannot verify identity."
  }
}
```

---

### 3.5 Query Identification Audit Logs

**`GET /api/v1/identification/audit?centerId=<centerId>&limit=20`**

Retrieves immutable identification audit events recorded at counter terminals.

#### Response `200 OK`:
```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-5555-6666-7777-888899990000",
      "organizationId": "d0e19a84-1234-4567-890a-bcdef1234567",
      "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
      "sessionId": "a7b31498-8924-42f1-b841-8e7c10b28491",
      "customerId": "e6a4b123-4567-8901-2345-678901234567",
      "farmerCode": "FARM-101",
      "customerName": "Suresh Patil",
      "identificationMethod": "SUPERVISOR_MANUAL",
      "verificationOutcome": "SUCCESS",
      "faceModelVersionId": null,
      "faceMatchScore": null,
      "rfidCardUidScanned": null,
      "supervisorId": "sup-user-uuid-1",
      "supervisorReasonCode": "LIGHTING_CAMERA_DEFECT",
      "deviceId": "DEV-COUNTER-01",
      "recordedAt": "2026-11-14T03:15:30.000Z"
    }
  ]
}
```

