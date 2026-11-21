# DFARM — COLLECTION APP REMEDIATION

**Document ID:** `07_COLLECTION_APP_REMEDIATION`  
**Application:** `apps/dfarm-collection-app`  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-11-18  

---

## 1. Application Scope & Constraints

The Collection Application operates at village collection centers in both online and offline modes. It interfaces directly with weighing scales and ultrasonic milk analyzers, authenticates farmers via QR, Biometric, or Farmer Code, and records morning/evening shifts.

**Governance Constraints:**
- Strict UI Freeze: No UI restyling or layout changes.
- Hardware Integrity: Accurate state representation when hardware is disconnected.

---

## 2. Identified Inconsistencies & Remediation

### 2.1 HardwareContext Default Measurement State Leakage
- **Audit ID:** `DFARM-AUDIT-005`
- **Root Cause:** In `apps/dfarm-collection-app/src/context/HardwareContext.tsx`, `defaultMeasurements` was initialized with active dummy values (`fat: 4.5, snf: 8.5, weightLiters: 10.0, analyzerConnected: false, scaleConnected: false, readingsValid: false`). When an operator launched the screen with hardware disconnected, these non-zero values were briefly accessible in memory and risked accidental submission.
- **Remediation:** Reset initial state to strictly zeroed disconnected measurements:
```typescript
const defaultMeasurements: HardwareMeasurements = {
  fat: 0,
  snf: 0,
  clr: 0,
  temperature: 0,
  weightLiters: 0,
  analyzerConnected: false,
  scaleConnected: false,
  readingsValid: false,
  validationErrors: ['Scale not connected', 'Milk analyzer not connected'],
};
```

### 2.2 Triplicate Redundant Tenant Headers
- **Audit ID:** `DFARM-AUDIT-007`
- **Root Cause:** Similar to Dairy Admin, `apps/dfarm-collection-app/src/api/client.ts` was setting triplicate headers (`X-Dairy-Id`, `X-Dairy-Tenant-ID`, `x-dairy-id`).
- **Remediation:** Removed duplicate headers, preserving only canonical `X-Dairy-Id`.

### 2.3 Mock Backend Relocation Out of Production Tree
- **Audit ID:** `DFARM-AUDIT-010`
- **Root Cause:** `apps/dfarm-collection-app/src/api/mock-backend.ts` was in `src/api/`.
- **Remediation:** Moved to `apps/dfarm-collection-app/src/test/mocks/mock-backend.ts` and updated imports in all 5 test files (`CollectionScreen.test.tsx`, `FarmerContext.test.tsx`, `HardwareContext.test.tsx`, `OfflineSyncContext.test.tsx`, `ShiftContext.test.tsx`).

---

## 3. Automated Verification Evidence

Ran Collection App test suite:
```powershell
npm run test --workspace=apps/dfarm-collection-app
```
**Output:**
- 8 test suites passed
- 40 total tests passed (100% pass rate)
- Build verified cleanly under `npm run build`.
