# DFARM — Remaining Issues, Technical Debt & Blockers

**Execution Reference:** `DFARM-COLLECTION-OPERATOR-AUTHORIZATION-FIX`  
**Document:** `11_REMAINING_ISSUES_AND_BLOCKERS.md`  
**Date:** 2026-11-20  
**Status:** ZERO BLOCKERS  

---

## 1. Current Operational Status

| Application / Component | Operational Status | Notes |
| :--- | :---: | :--- |
| **`apps/dfarm-collection-app`** | **ONLINE & OPERATIONAL** | Operators log in with real OTP, receive proper Dairy & Center context, and run shift intake. |
| **`apps/dfarm-dairy-admin`** | **ONLINE & OPERATIONAL** | Staff & Operator Access page now includes complete operator onboarding modal, role assignment, and status controls. |
| **`apps/dfarm-super-admin`** | **ONLINE & OPERATIONAL** | Tenant Database Manager console active with full table discovery, schema inspection, and controlled CRUD. |
| **`services/backend`** | **ONLINE & OPERATIONAL** | Robust RBAC validation, central-tenant synchronization, and zero compilation errors. |
| **`packages/database`** | **HEALTHY** | Physical cluster schemas and shared identity tables synchronized. |

---

## 2. Blockers

**ZERO CRITICAL BLOCKERS.**

The reported issue:
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Mobile number is not registered as an authorized operator."
  }
}
```
has been definitively resolved. The collection operator registration and login lifecycle functions seamlessly with full tenant isolation and zero authorization bypass.

---

## 3. Recommended Future Optimizations (Non-Blocking)

1. **SMS Gateway Webhook Monitoring:**
   - In live production with telco DLT templates, add delivery callback webhooks to monitor SMS delivery latency across tier-2/tier-3 rural areas.
2. **Kiosk Biometric Unlock:**
   - Integrate optional operator fingerprint/face-unlock at the kiosk for fast mid-shift terminal re-entry after idle timeout.
3. **Multi-Center Operator Roaming:**
   - For relief operators who rotate between village collection centers on different days, extend `user_center_assignments` to support scheduled center rotations.
