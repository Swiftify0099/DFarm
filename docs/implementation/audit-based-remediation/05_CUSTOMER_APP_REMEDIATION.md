# DFARM — CUSTOMER APP REMEDIATION

**Document ID:** `05_CUSTOMER_APP_REMEDIATION`  
**Application:** `apps/dfarm-customer-app`  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-11-18  

---

## 1. Application Scope & Constraints

The DFarm Customer Mobile Application provides farmers with real-time transparency regarding their daily milk collection records, fat/SNF test results, rate calculations, subledger statements, and monthly payment settlements.

**Governance Constraints:**
- Strict UI Freeze: No visual layout changes, theme redesigns, or component replacements.
- Layer-Correct Fix: All issues resolved at networking, query hook, and API mapping levels.

---

## 2. Identified Inconsistencies & Remediation

### 2.1 Unbounded Query Hooks (Collections & Ledger)
- **Audit ID:** `DFARM-AUDIT-008`
- **Root Cause:** Hooks `useCollectionHistory` and `useLedgerHistory` invoked the backend endpoints `/api/v1/collection/history` and `/api/v1/ledger/transactions` without pagination parameters (`page`, `pageSize`, `limit`). Over multi-year farming relationships with daily morning/evening milk deposits (700+ transactions annually), this caused massive JSON payloads, sluggish rendering, and memory bloat on low-end mobile devices.
- **Remediation:** 
  1. Updated `apps/dfarm-customer-app/src/features/collection/useCollection.ts`:
     ```typescript
     export function useCollectionHistory(customerId?: string, params?: { page?: number; pageSize?: number }) {
       const queryParams = { page: 1, pageSize: 30, ...params };
       ...
     }
     ```
  2. Updated `apps/dfarm-customer-app/src/features/ledger/useLedger.ts`:
     ```typescript
     export function useLedgerHistory(customerId?: string, params?: { page?: number; pageSize?: number }) {
       const queryParams = { page: 1, pageSize: 30, ...params };
       ...
     }
     ```
  3. Preserved all UI components and table views while restricting default transfer sizes to 30 items per page with infinite scrolling / page increment support.

### 2.2 Balance Query Routing Alignment
- **Audit ID:** `DFARM-AUDIT-006`
- **Issue:** Farmer dashboard balance card depended on `/api/v1/ledger/accounts/:customerId`, which previously returned 404.
- **Remediation:** Verified that with backend route `/accounts/:customerId` in place, `useLedgerSummary` fetches and maps the live balance directly into the UI state without workarounds.

---

## 3. Automated Verification Evidence

Ran customer app regression suite:
```powershell
npm run test --workspace=apps/dfarm-customer-app
```
**Output:**
- 5 test suites passed
- 20 total tests passed (100% pass rate)
- Build verified via Vite / Rollup.
