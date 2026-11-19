# DFarm Roadmap Phase 08 — Operator & Supervisor Fallback Verification Report

**Document Reference:** `DFARM-ROADMAP-PHASE-08-OPERATOR-SUPERVISOR-FALLBACK`  
**Phase:** Roadmap Phase 08 — Collection App & Kiosk Operational Integration  
**Date:** November 18, 2026  
**Status:** VERIFIED & CERTIFIED  

---

## 1. Executive Summary

This report documents the fallback mechanisms and authorization controls governing customer identification at DFarm collection counters when automated biometric (YuNet/SFace) or RFID methods are unavailable, inconclusive, or in conflict.

In agricultural field environments, farmers may occasionally experience camera obstruction, facial injuries, unreadable cards, or card loss. DFarm provides an audited, permission-gated manual fallback workflow without compromising multi-tenant security or financial integrity.

---

## 2. Role-Based Permission Matrix for Counter Operations

The authoritative RBAC policy (enforced by `authorizePermission` in `services/backend/src/presentation/middleware/authorize.ts`) defines granular responsibilities:

| Capability / Action | COLLECTION_OPERATOR | SUPERVISOR | DAIRY_ADMIN | PRIMARY_DAIRY_ADMIN |
|---|:---:|:---:|:---:|:---:|
| `customers:identify_face` | Allowed | Allowed | Allowed | Allowed |
| `customers:identify_rfid` | Allowed | Allowed | Allowed | Allowed |
| `customers:read` (Directory Search) | Allowed (Kiosk Scope) | Allowed | Allowed | Allowed |
| `customers:manual_fallback` | Supervisor-Assisted | Allowed | Allowed | Allowed |
| `sessions:open` / `close` | Allowed | Allowed | Allowed | Allowed |
| `sessions:audit` | Denied | Allowed | Allowed | Allowed |
| `rate_charts:manage` | Denied | Denied | Read-Only | Allowed |
| `billing:manage` | Denied | Denied | Read-Only | Allowed |

---

## 3. Manual Fallback Workflow Execution

When automated identification fails:
1. **Trigger Condition:**
   - Face detector status is `UNKNOWN_PERSON`, `CAMERA_UNAVAILABLE`, or `MODEL_UNAVAILABLE`.
   - Card reader reports `UNASSIGNED_CARD` or card is lost/unscanned.
   - Contradictory conflict between Face and RFID (`hasIdentityConflict: true`).
2. **Operator Action:**
   - The operator opens `CustomerLookupModal.tsx` via the "Manual Search" button.
3. **Directory Resolution:**
   - Queries `GET /api/v1/customers?search=...&limit=20`.
   - Searches strictly within the caller's authorized Dairy (`organizationId`).
   - Cross-dairy lookups are rejected with HTTP 403 Forbidden.
4. **Eligibility Revalidation:**
   - The selected patron's status is inspected: `canDeliver` must be true.
   - Soft-deleted (`deleted_at IS NOT NULL`) or suspended farmers cannot be selected.
5. **Intake Provenance:**
   - When the transaction is saved, `identificationMethod` is durably set to `'MANUAL_SEARCH'`.
   - The transaction record explicitly notes the manual selection for Dairy Admin audit registers.

---

## 4. Security & Audit Boundaries

- **No Arbitrary Customer Insertion:** Operators cannot type arbitrary names or customer IDs. Selection must resolve to an approved row in the tenant's `customers` table.
- **Traceable Audit Record:** The resulting milk collection record carries `operator_id`, `device_id`, `session_id`, `created_at`, and `identification_method: 'MANUAL_SEARCH'`.
- **Zero Financial Bypass:** Manual identification does not bypass rate chart calculation or ledger balance updates. The backend independently calculates amounts based on active rate charts.

---

## 5. Automated Verification Evidence

- Verified in `apps/dfarm-collection-app/src/test/auth.test.ts`:
  - Operator role boundaries enforced.
  - Manual search returns only tenant-scoped customers.
- Verified in `services/backend/tests/collection-kiosk-production.test.js`:
  - **Test 3**: Cross-dairy customer lookup blocked with HTTP 403.
  - **Test 13**: Operator role cannot perform administrative mutations.
- Verified in `services/backend/tests/roadmap-phase-02-auth-rbac.test.js`:
  - **Test 1.6**: `COLLECTION_OPERATOR` has intake and session permissions, denied billing/rate management.
  - **Test 1.7**: `SUPERVISOR` has manual identification fallback permissions.
