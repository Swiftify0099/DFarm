# DFarm RFID Card Management REST API Specification

This document details the HTTP REST API endpoints powering RFID Card Assignment, Replacement, Blocking, Revocation, and Status tracking (Phase 08) in DFarm.

Base Path: `/api/v1`

---

## 1. Authorization Requirements

Card assignment, replacement, blocking, and revocation are restricted administrative lifecycle operations:

Allowed Roles:
- `REGISTRATION_OFFICER`
- `CENTER_MANAGER`
- `DAIRY_OWNER`
- `SUPER_ADMIN`

Standard counter `OPERATOR` roles attempting card assignment or replacement will receive `403 Forbidden`.

---

## 2. Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/customers/:customerId/rfid-assign` | Assign an unassigned RFID card to a registered customer |
| `POST` | `/api/v1/customers/:customerId/rfid-replace` | Replace an existing active card with a new card (single active card policy) |
| `GET` | `/api/v1/customers/:customerId/rfid-status` | Get customer active card, assignment details, and historical card replacements |
| `POST` | `/api/v1/rfid/:cardId/block` | Block an RFID card (temporary security hold) |
| `POST` | `/api/v1/rfid/:cardId/revoke` | Revoke an RFID card permanently (lost/damaged/retired) |

---

## 3. Detailed Endpoint Contracts

### 3.1 Initial RFID Card Assignment

**`POST /api/v1/customers/:customerId/rfid-assign`**

Assigns an RFID card to an eligible customer. Enforces the strict rule that a customer cannot have multiple active cards and a card cannot be assigned to multiple customers simultaneously.

#### Request Body:
```json
{
  "cardUid": "04A1B2C301",
  "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
  "cardType": "MIFARE_CLASSIC_1K"
}
```

#### UID Normalization:
The input UID is automatically cleaned and normalized to uppercase hexadecimal without spaces, colons, or dashes (e.g., `04:a1:b2:c3:01` $\rightarrow$ `04A1B2C301`).

#### Success Response `201 Created`:
```json
{
  "success": true,
  "data": {
    "assignmentId": "b1c2d3e4-1111-2222-3333-444455556666",
    "cardUid": "04A1B2C301",
    "customerId": "e6a4b123-4567-8901-2345-678901234567",
    "status": "ACTIVE"
  }
}
```

#### Conflict Errors:
- Customer already holds an active card:
  ```json
  {
    "success": false,
    "error": {
      "code": "CONFLICT",
      "message": "Customer already holds an active card (UID: 040E9EC508). Multiple active cards are prohibited. Use the replacement workflow instead."
    }
  }
  ```
- Card already assigned to another customer:
  ```json
  {
    "success": false,
    "error": {
      "code": "CONFLICT",
      "message": "RFID card 04A1B2C301 is already actively assigned to another customer"
    }
  }
  ```

---

### 3.2 RFID Card Replacement Workflow

**`POST /api/v1/customers/:customerId/rfid-replace`**

Atomic card replacement workflow. Deactivates and marks the previous card as `REVOKED`, creates a new assignment for the replacement card, records mandatory justification notes and reason category, and maintains complete assignment audit history.

#### Request Body:
```json
{
  "newCardUid": "04A1B2C399",
  "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8",
  "reasonCategory": "CARD_DAMAGED",
  "justificationNotes": "Physical antenna coil damaged during cattle handling; verified old card in person.",
  "cardType": "MIFARE_CLASSIC_1K"
}
```

#### Allowed Replacement Reason Categories:
- `CARD_DAMAGED`
- `CARD_LOST`
- `CARD_MALFUNCTIONING`
- `ADMINISTRATIVE_REISSUE`

#### Success Response `200 OK`:
```json
{
  "success": true,
  "data": {
    "newAssignmentId": "c2d3e4f5-2222-3333-4444-555566667777",
    "previousCardUid": "04A1B2C301",
    "newCardUid": "04A1B2C399",
    "customerId": "e6a4b123-4567-8901-2345-678901234567"
  }
}
```

---

### 3.3 Customer RFID Status & History

**`GET /api/v1/customers/:customerId/rfid-status`**

Queries customer active card status, card technology type, issue timestamp, and full historical card assignment records.

#### Success Response `200 OK`:
```json
{
  "success": true,
  "data": {
    "hasActiveCard": true,
    "activeCard": {
      "assignmentId": "c2d3e4f5-2222-3333-4444-555566667777",
      "cardId": "d3e4f5a6-3333-4444-5555-666677778888",
      "cardUid": "04A1B2C399",
      "cardType": "MIFARE_CLASSIC_1K",
      "cardStatus": "ACTIVE",
      "assignedAt": "2026-11-14T03:20:00.000Z",
      "assignedBy": "officer-uuid-1",
      "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8"
    },
    "history": [
      {
        "assignmentId": "b1c2d3e4-1111-2222-3333-444455556666",
        "cardUid": "04A1B2C301",
        "cardType": "MIFARE_CLASSIC_1K",
        "isActive": false,
        "assignedAt": "2026-10-01T05:00:00.000Z",
        "unassignedAt": "2026-11-14T03:20:00.000Z",
        "cardStatus": "REVOKED",
        "centerId": "319c2eab-6b4c-4d15-84a8-297662d0fce8"
      }
    ]
  }
}
```

---

### 3.4 Block RFID Card

**`POST /api/v1/rfid/:cardId/block`**

Temporarily suspends a card UID from being accepted during collection tap.

#### Request Body:
```json
{
  "reason": "Suspected unauthorized card usage reported by dairy security"
}
```

#### Success Response `200 OK`:
```json
{
  "success": true,
  "data": {
    "cardId": "d3e4f5a6-3333-4444-5555-666677778888",
    "status": "BLOCKED",
    "updatedAt": "2026-11-14T03:22:00.000Z"
  }
}
```

---

### 3.5 Revoke RFID Card

**`POST /api/v1/rfid/:cardId/revoke`**

Permanently retires a physical card and deactivates any active assignment associated with it.

#### Request Body:
```json
{
  "reason": "Card confirmed broken and destroyed"
}
```

#### Success Response `200 OK`:
```json
{
  "success": true,
  "data": {
    "cardId": "d3e4f5a6-3333-4444-5555-666677778888",
    "status": "REVOKED",
    "updatedAt": "2026-11-14T03:25:00.000Z"
  }
}
```

