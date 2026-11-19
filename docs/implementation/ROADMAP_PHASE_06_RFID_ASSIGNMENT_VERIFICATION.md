# DFARM — ROADMAP PHASE 06: RFID ASSIGNMENT VERIFICATION
**Document Reference:** `docs/implementation/ROADMAP_PHASE_06_RFID_ASSIGNMENT_VERIFICATION.md`  
**Execution Phase:** Roadmap Phase 06 — Dairy Admin Core Operations  
**Target Application:** `apps/dfarm-dairy-admin`  
**Backend Service:** `services/backend`  
**Database Architecture:** Tenant PostgreSQL Database (`dfarm_tenant_<code_hash>`)  
**Status:** VERIFIED & PRODUCTION READY  

---

## 1. Executive Summary

This report documents the verification of the DFarm RFID Card Inventory, Assignment, Replacement, Unassignment, and Lost-Card workflows within Dairy Admin Core Operations.

RFID cards serve as the primary rapid-intake physical identification mechanism at milk collection counters. This phase ensures that cards cannot be duplicated across active farmers, card replacement preserves historical audit records, and unassigned/lost cards immediately revoke kiosk counter authentication.

---

## 2. RFID Endpoints & Architecture

| Method | Endpoint | Description | Permissions Required |
|---|---|---|---|
| `GET` | `/api/v1/rfid` | List RFID cards in inventory with status and active assignment info | `customers:read` or `rfid:manage` |
| `POST` | `/api/v1/rfid/assign` | Assign card to customer; deactivates previous assignment if reissuing | `rfid:manage` |
| `POST` | `/api/v1/rfid/unassign` | Unassign card from customer; card returns to `UNASSIGNED` in inventory | `rfid:manage` |
| `POST` | `/api/v1/rfid/mark-lost` | Mark card as `LOST`; terminates active assignment and blocks future use | `rfid:manage` |
| `GET` | `/api/v1/rfid/lookup/:uid` | Collection App lookup endpoint to resolve customer from scanned card UID | Collection Kiosk Token or Public Internal |

---

## 3. Database Schema & Invariant Handling

### 3.1 Separation of Card Catalog and Customer Assignments
The tenant schema maintains two tables:
1. `rfid_cards`: Stores the physical cards (`id`, `organization_id`, `card_uid`, `status`, `created_at`).
2. `rfid_card_assignments`: Tracks assignment history (`id`, `rfid_card_id`, `customer_id`, `assigned_at`, `unassigned_at`, `is_active`, `notes`).

*Architectural Invariant:* The `customers` table does **not** maintain a static `rfid_card_uid` column. Active card UIDs are resolved via relational joins on `rfid_card_assignments WHERE is_active = TRUE`. This prevents synchronization discrepancies and permits comprehensive audit history.

### 3.2 Duplicate Active Assignment Prevention
When `POST /api/v1/rfid/assign` is invoked:
1. Checks if `rfid_cards.status` is `'ACTIVE'` or if an active record exists in `rfid_card_assignments`.
2. If the card is already actively assigned to *another* customer, the endpoint returns **HTTP 409 Conflict** with:
   `"Card UID ... is already actively assigned to another customer."`
3. If assigning a new card to a customer who already had an older card, the previous assignment record is updated with:
   `SET is_active = FALSE, unassigned_at = NOW(), notes = 'Replaced by card ...'`
4. The new assignment record is created with `is_active = TRUE`.

### 3.3 Card Unassignment & Lost Card Protocol
- **Unassign**: Sets `is_active = FALSE` on the assignment record and updates `rfid_cards.status = 'AVAILABLE'` (or `UNASSIGNED`).
- **Mark Lost**: Sets `is_active = FALSE` on the assignment record and sets `rfid_cards.status = 'LOST'`. Any kiosk scanning a card marked `LOST` receives HTTP 404 or an explicit message indicating the card has been reported lost.

---

## 4. Verification Test Evidence

All RFID scenarios were tested in `services/backend/tests/roadmap-phase-06-dairy-admin.test.js`:

| Test Assertion | Scenario / Input | Expected Result | Actual Result | Status |
|---|---|---|---|---|
| Card Inventory Listing | GET `/api/v1/rfid` | Returns card array for Dairy A with assignment statuses | Status 200, cards returned | PASS |
| Successful Card Assignment | POST `/rfid/assign` with customer ID & valid card UID | Card assigned, customer's active card updated | Status 200, assignment confirmed | PASS |
| Duplicate Assignment Block | POST `/rfid/assign` with card already assigned to Customer 1 targeting Customer 2 | Status 409 Conflict | Status 409 Conflict, duplicate prevented | PASS |
| Card Replacement | POST `/rfid/assign` with new card UID for customer with existing card | Old assignment deactivated, new card active | Old card deactivated, new card active | PASS |
| Card Unassignment | POST `/rfid/unassign` with card UID | Assignment deactivated, card free | Status 200, card unassigned | PASS |
| Mark Card Lost | POST `/rfid/mark-lost` with card UID | Status = `LOST`, assignment terminated | Status 200, status = `LOST` | PASS |
| Cross-Dairy RFID Isolation | Dairy Admin A attempts to list or assign RFID of Dairy B | Status 403 Forbidden | Status 403 Forbidden | PASS |
| Kiosk Lookup Integration | GET `/rfid/lookup/:uid` from Collection App | Returns customer details, status `APPROVED` | Status 200, farmer details returned | PASS |

---

## 5. Summary

RFID card management fulfills all hardware integration, multi-tenant boundary, and assignment uniqueness guarantees without exposing or modifying non-existent database columns.
