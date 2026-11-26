# DFarm — RESTART-01 Final Baseline Audit Report

**Audit Sequence:** `RESTART-01` (Baseline Audit & Master Issue Register)  
**Generated At:** `2026-11-26`  
**Repository:** `Swiftify0099/DFarm` (`fix/cloudflare-pages-production-deploy` @ `6fddf03cb35c343f38a7f4f1a46ac0cc9632c0c3`)  
**Workspace:** `c:\Users\panka\.gemini\antigravity\worktrees\DFarm\dfarm_customer_app_init`

---

## 1. Executive Summary

`RESTART-01` completed a comprehensive read-only baseline audit of the DFarm monorepo, reconciling all prior `FIX-01` through `FIX-02.3` and Prompt `06.2` / `07` implementation reports against actual source files, Git repository topology, database migrations, frontend/backend builds, and executed automated test suites.

### Key Baseline Conclusions
1. **Local Git & Remote History Drift Discovered (`DF-003`):** Contrary to `DFARM_FIX02_3_LOCAL_RELEASE_CANDIDATE_REPORT.md` (which captured `c84ab21` with uncommitted FIX changes and `1,807` staged `.temp/` deletions), two commits (`45aa5ae` and `6fddf03`) were pushed to `origin/fix/cloudflare-pages-production-deploy` on `2026-11-26`. While the local working tree is now clean and `.temp/` is no longer tracked (`git ls-files .temp` = `0`, `1,829` local `.temp/` files preserved untouched), **live GitHub remote history was never rewritten** (`.temp/` Chrome CDP commits & Google Maps key commits remain in `origin` history) and the offline rewritten mirror (`dfarm-audit-mirror.git` at `c84ab21`) is now stale.
2. **Critical Authentication & Authorization Bypass Still Live (`DF-001`, `DF-002`, `DF-004`..`DF-012`):** Although `FIX-01` hardened `presentation/routes/auth.routes.ts` (`/admin/otp/*`), `super-admin.routes.ts`, and `dairy-admin.routes.ts`, `app.ts` still mounts the legacy passwordless staff login router (`modules/auth/auth.routes.ts`) on `/api/v1/auth/login`, `/api/users/auth/login`, and `/api/auth/login`. Furthermore, `dairies.routes.ts` leaves dairy creation/suspension/reactivation/location endpoints unauthenticated, `middleware/authenticate.ts` falls back to trusting unverified JWT claims on DB failures, and `14+` presentation routers still rely on `optionalAuthenticate` and broken no-op `authorizePermission(...)(req, res, () => {})` callbacks.
3. **Database, Multi-Tenant & Financial Split-Brain Gaps (`DF-016`, `DF-017`, `DF-020`..`DF-023`):** `MigrationRunner.ts` stops at `040` (omitting `041`, `042`, `043`), `packages/database` stops at `037`, `031` is duplicated in `supabase/migrations/`, `PostgresShiftSessionRepository` scans all tenant DBs and creates fake entities when `organizationId` is omitted, `customers.routes.ts` queries central `db` for `dairy_centers` during registration, `RealtimeEventPublisher` polls central `db` while intake writes `tenantDb` outbox rows, and `UnionBankReconciliationService` opens transactions on central `pool` instead of resolved `tenantDbManager` pools.
4. **Empirical Test Reality (`DF-029`, `DF-030`):** While `npm run build:backend` passes cleanly and all `40/40` frontend tests (`collection`, `dairy-admin`, `super-admin`, `customer`) pass, backend offline execution shows `15` passing suites, **`11` genuine offline test/E2E failures** (caused by route bugs, `sync.routes.ts` route-shadowing, unmounted `deviceRouter`, and central vs tenant center queries), **`16` `ECONNREFUSED` failures**, **`18` skipped or >10s timed-out PG suites**, and **`4` unrun Chrome/PG E2E suites**.

---

## 2. Deliverable Artifacts Created (`RESTART-01`)

| Deliverable File | Link | Coverage |
| :--- | :--- | :--- |
| Master Project Inventory | [DFARM_RESTART_01_MASTER_PROJECT_INVENTORY.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_MASTER_PROJECT_INVENTORY.md) | Phase 0 Git topology, 4 workspaces, 4 apps, backend layers, 44 migrations, CI/infra/secrets |
| Master Issue Register | [DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md) | `33` permanent issues (`DF-001`–`DF-033`), all 13 mandatory fields, FIX-01..02.3 & Prompt 6.2/7 reconciliation |
| Business Flow Coverage | [DFARM_RESTART_01_BUSINESS_FLOW_COVERAGE.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_BUSINESS_FLOW_COVERAGE.md) | End-to-end UI -> API -> Actor -> Use Case -> DB -> Transaction -> Events -> Gaps across all 6 business domains |
| Test Baseline Matrix | [DFARM_RESTART_01_TEST_BASELINE_MATRIX.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_TEST_BASELINE_MATRIX.md) | Full build & execution ledger across all `109` test/script files (`40` frontend, `3` DB package, `66` backend test/util files) |
| Fix Dependency Roadmap | [DFARM_RESTART_01_FIX_DEPENDENCY_ROADMAP.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_FIX_DEPENDENCY_ROADMAP.md) | Dependency graph and issue-mapped execution roadmap for `RESTART-02` through `RESTART-12` |
| Final Audit Report | [DFARM_RESTART_01_FINAL_AUDIT_REPORT.md](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_FINAL_AUDIT_REPORT.md) | Executive baseline verdict, issue counts, environment blockers, and next-step recommendation |

---

## 3. Master Issue Count Summary

| Priority | Count | Primary Concentration |
| :--- | :---: | :--- |
| **P0 (Critical)** | **15** | Passwordless staff login (`DF-001`), open dairy admin CRUD (`DF-002`), live GitHub secret/profile history (`DF-003`), `optionalAuthenticate` & no-op `authorizePermission` across customer/identity/collection/financial routes (`DF-004`, `DF-005`, `DF-006`, `DF-010`), sync route shadowing (`DF-007`), hardcoded AES key fallback (`DF-008`), JWT claim trust fallback (`DF-009`), tenant session/register split (`DF-016`, `DF-017`), migration drift (`DF-020`), SSE outbox split-brain (`DF-021`), Union Bank split-brain reconciliation (`DF-022`). |
| **P1 (High)** | **12** | Unrevoked token refresh (`DF-011`), unauthenticated/optional operational routes (`DF-012`), `.env`/client SMS/webhook secret hygiene (`DF-013`), dairy invitation enumeration/no-op (`DF-014`), bank update IDOR & non-prod seeding (`DF-015`), unmounted device/biometric routers (`DF-018`), hardcoded telemetry/analytics (`DF-019`), legacy ledger/bills/payments/reports bugs (`DF-023`), Union Bank debit default/502 gate (`DF-024`), Super Admin silent `mockBackend` fallback (`DF-026`), `11` failing offline E2E suites (`DF-029`), PG/Chrome blocked suite coverage (`DF-030`). |
| **P2 (Medium)** | **5** | `pg-mem` auto-DDL compatibility (`DF-025`), Super Admin Wrangler project name mismatch (`DF-027`), static CSP allowances (`DF-028`), sibling worktree hygiene (`DF-031`), unverified cloud dashboards/CI/secret rotations (`DF-032`). |
| **P3 (Low)** | **1** | Duplicate `src/modules/` vs `src/presentation/` cleanup and stale benchmark paths (`DF-033`). |
| **TOTAL** | **33** | `15 P0 + 12 P1 + 5 P2 + 1 P3` |

---

## 4. Environment & Verification Scope Disclosures

Because `RESTART-01` is strictly a read-only local baseline audit on the developer workstation:
- **PostgreSQL / Supabase:** Local PG ports `5432` and `54322` were closed (`False`). All live PostgreSQL, Supabase RLS, concurrent row-locking, and real DB migration tests remain unexecuted (`BLOCKED BY ENVIRONMENT` until a local/CI PG instance is started in `RESTART-05`/`RESTART-11`).
- **Headless Chrome / Browser E2E:** Browser E2E gates (`prompt425`, `prompt5-2-real-pg`, `prompt5-real-browser`, `prompt6-1-chrome`) remain unexecuted (`NOT RUN / BLOCKED BY ENVIRONMENT`).
- **External Platforms & Secret Scanning:** Remote Render environment variables, Cloudflare Pages project runtime configs, live GitHub Actions Gitleaks output, Union Bank corporate gateway credentials, and provider key rotations remain **NOT VERIFIED**.

---

## 5. Final Baseline Classification

**`PARTIAL — SPECIFIC MODULES OR ENVIRONMENTS NOT VERIFIED`**

*(Repository identity, safety constraints, clean build status, 40/40 frontend tests, partial offline backend execution, and full static security/architecture code audit are verified; live PostgreSQL/Supabase, real Chrome E2E gates, Union Bank production gateway, and cloud console runtime configurations could not be verified locally.)*

---

## 6. Recommended Immediate Action

Proceed sequentially to **`RESTART-02`** (Authentication, OTP, JWT, Middleware Fail-Closed Guards, CORS, Encryption & Secret Hygiene) targeting issues `DF-001`, `DF-002`, `DF-003` (local/rotation preparation), `DF-008`, `DF-009`, `DF-011`, `DF-013`, and `DF-014`.
