# DFARM — MASTER REMEDIATION PLAN

**Document ID:** `00_MASTER_REMEDIATION_PLAN`  
**Execution Reference:** `DFARM-MASTER-AUDIT-BASED-ISSUE-FIXING`  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-11-18  

---

## 1. Executive Summary

This Master Remediation Plan defines the systematic, evidence-driven resolution of all architectural, database, backend, and frontend findings identified during the comprehensive **DFarm Database-to-UI Data Lineage Audit** (`docs/implementation/database-ui-data-lineage-audit/`).

All fixes adhere strictly to the following architectural invariants:
1. **Layer-Correct Root Cause Remediation:** No superficial frontend masking of backend or database errors.
2. **Physical Multi-Tenancy Invariant:** Zero fallback to shared schema or logical row-filtering; physical database isolation per tenant (`dfarm_central` vs `dfarm_tenant_<code_hash>`) is strictly preserved.
3. **Strict UI Freeze:** Zero modifications to visual layout, styling, UI components, or design systems until Roadmap Phase 12.
4. **Additive Schema Migrations Only:** Zero destructive migrations or in-place edits of previously applied migrations.

---

## 2. Issue Inventory & Classification Summary

| Issue ID | Classification | Layer | Remediation Summary | Status |
|---|---|---|---|---|
| `DFARM-AUDIT-001` | CONFIRMED DATABASE SCHEMA ISSUE | Database Infrastructure | Registered migrations `033`, `034`, `035` in manifest and runner; added status/lifecycle hardening | RESOLVED |
| `DFARM-AUDIT-002` | CONFIRMED DATABASE MIGRATION ISSUE | Database Migrations | Quarantined `031_remove_dairy_admin` with hardcoded phone to `scripts/maintenance/` | RESOLVED |
| `DFARM-AUDIT-003` | CONFIRMED FRONTEND TESTING ISSUE | Super Admin App | Stubbed fetch in activationFlow test; purged mockBackend state before each test | RESOLVED |
| `DFARM-AUDIT-004` | PENDING FIELD CALIBRATION | AI Biometrics Service | Preserved 0.720 cosine similarity threshold; documented field calibration requirements | PENDING_CALIBRATION |
| `DFARM-AUDIT-005` | CONFIRMED FRONTEND DATA INTEGRITY | Collection App Context | Reset HardwareContext default measurements to disconnected/zeroed state | RESOLVED |
| `DFARM-AUDIT-006` | CONFIRMED BACKEND ROUTING ISSUE | Backend API Routing | Removed duplicate mounts from `app.ts`; mounted `/accounts/:customerId` in ledger routes | RESOLVED |
| `DFARM-AUDIT-007` | CONFIRMED API CONTRACT ISSUE | Frontend Networking | Unified headers to canonical `X-Dairy-Id` in Dairy Admin and Collection App | RESOLVED |
| `DFARM-AUDIT-008` | CONFIRMED PERFORMANCE ISSUE | Customer Mobile App | Enforced default pagination `{ page: 1, pageSize: 30 }` on collection and ledger query hooks | RESOLVED |
| `DFARM-AUDIT-009` | CONFIRMED DATA INTEGRITY ISSUE | Tenant Financial Ledger | Hardened billing settlement query to exclude `RECONCILIATION_REQUIRED`; fixed DB priority in repository | RESOLVED |
| `DFARM-AUDIT-010` | CONFIRMED CODEBASE PURITY ISSUE | Frontend Architecture | Relocated `mock-server.ts` and `mock-backend.ts` out of `src/api` into `src/test/mocks` | RESOLVED |

---

## 3. Remediation Execution Phases

```
┌────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: Database Infrastructure Hardening                             │
│ - Register untracked migrations (033, 034, 035) in MIGRATION_MANIFEST  │
│ - Quarantine one-off script 031 from automated migration pipeline      │
│ - Apply additive migrations for customer lifecycle & status hardening  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ STAGE 2: Backend Routing & Financial Logic Consolidation               │
│ - Eliminate duplicate route mounting in app.ts                         │
│ - Add missing GET /api/v1/ledger/accounts/:customerId endpoint         │
│ - Ensure billing engine isolates RECONCILIATION_REQUIRED transactions   │
│ - Prioritize live PostgreSQL database in PostgresLedgerRepository     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ STAGE 3: Frontend Client Standardization & Performance                 │
│ - Standardize on canonical X-Dairy-Id header (drop redundant variants) │
│ - Bound customer mobile query hooks with default pagination limits     │
│ - Zero out initial HardwareContext default measurements                │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ STAGE 4: Code Purity & Test Isolation                                  │
│ - Relocate frontend mock servers into src/test/mocks/                  │
│ - Eliminate Super Admin unit test network leak to port 4000            │
│ - Run full monorepo regression suite & production build                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Verification and Governance Gates

Every remediation step was subjected to automated verification gates:
1. **Database Unit & Migration Suite:** `packages/database` (22/22 tests passed).
2. **Backend Architecture & Tenant Isolation Suite:** `services/backend/tests/clean-architecture.test.js` (9/9 tests passed).
3. **Financial Settlement Engine Suite:** `services/backend/tests/roadmap-phase-09-financial-calculation-settlement.test.js` (38/38 tests passed).
4. **App Frontend Unit Suites:**
   - Collection App: 40/40 tests passed.
   - Dairy Admin: 14/14 tests passed.
   - Customer App: 20/20 tests passed.
   - Super Admin: 34/34 tests passed.
5. **Full Monorepo Build:** 8/8 workspaces compiled cleanly (`tsc -b`, Vite, Rollup).
