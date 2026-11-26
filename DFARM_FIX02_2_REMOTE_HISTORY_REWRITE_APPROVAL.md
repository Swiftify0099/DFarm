# DFarm FIX-02.2 — Final Remote History Rewrite Approval Package

**Repository:** `Swiftify0099/DFarm` (`https://github.com/Swiftify0099/DFarm.git`)  
**Working Branch:** `fix/cloudflare-pages-production-deploy` (Remote/Base Commit `c84ab2160be5b26489761e527bf992d1b22036b9`)  
**Verification Date:** 2026-11-26  
**Final Classification:** **`READY FOR HUMAN REMOTE HISTORY-REWRITE APPROVAL`**

> **Approval Scope Notice:** `READY FOR HUMAN REMOTE HISTORY-REWRITE APPROVAL` means **only** that the Git history rewrite ref mapping, isolated rewritten mirror verification, remote freeze check, and explicit `--force-with-lease` commands are verified safe for human approval. **No remote push, force-push, credential change, local profile deletion, or deployment was executed.** Human prerequisites (Google Maps key rotation, Google OAuth session review, offline backup encryption) remain `PENDING HUMAN ACTION`, and **production deployment remains BLOCKED**.

---

## 1. Final Revalidated Ref Mapping (Phase 1)

Revalidation was performed read-only against the FIX-02.1 offline bundle and mirrors stored outside the repository:
- **Offline Backup Bundle:** `C:\Users\panka\.gemini\antigravity\brain\e6c389d6-c511-4413-9bab-098685347c70\scratch\dfarm-pre-rewrite-backup.bundle` (`117,155,617` bytes; `git bundle verify` = **okay**, records complete history across 18 refs: the 15 audited refs + `HEAD`, `main-worktree/HEAD`, `worktrees/dfarm_customer_mobile_app/HEAD`).
- **Original Mirror:** `C:\Users\panka\.gemini\antigravity\brain\e6c389d6-c511-4413-9bab-098685347c70\scratch\dfarm-orig-mirror.git`
- **Rewritten Audit Mirror:** `C:\Users\panka\.gemini\antigravity\brain\e6c389d6-c511-4413-9bab-098685347c70\scratch\dfarm-audit-mirror.git` (`git fsck --full --no-dangling` = **PASS**, exit 0).
- **Tags:** `0` tags in working repo, `dfarm-orig-mirror.git`, `dfarm-audit-mirror.git`, and live `origin` (`git tag -l` and `git ls-remote --tags origin` both empty — **no tag silently omitted**).
- **Application Source Preservation Check (Original Mirror minus `.temp/` vs Audit Mirror):**
  - `refs/heads/main`: `4,397` orig (`2,590` non-`.temp/`) vs `2,590` audit — **`0` missing, `0` extra** (top commits: `e732a56`, `11755e6`, `9a96c35`).
  - `refs/heads/fix/cloudflare-pages-production-deploy`: `4,538` orig (`2,731` non-`.temp/`) vs `2,731` audit — **`0` missing, `0` extra** (top commits: `6910e1d`, `4713c93`, `a002cca`).
  - `refs/heads/feature/cloudflare-pages-deployment`: `4,374` orig (`2,567` non-`.temp/`) vs `2,567` audit — **`0` missing, `0` extra**.
  - `refs/heads/dfarm_customer_app_init`: `4,127` orig (`2,322` non-`.temp/`) vs `2,322` audit — **`0` missing, `0` extra**.

### Complete 15-Ref Mapping Table

| # | Audited Ref | Old SHA | Rewritten SHA (`dfarm-audit-mirror.git`) | Status |
|---:|---|---|---|---|
| 1 | `refs/heads/backup/pre-sdk58-checkpoint` | `2d861ef74fc5a25502d20d0b4dd60e2302bd35ac` | `2d861ef74fc5a25502d20d0b4dd60e2302bd35ac` | Unaffected (unchanged) |
| 2 | `refs/heads/dfarm_customer_app_init` | `e638850f196b758736237b9119a40ee977586a39` | `57883fa5f1321e3ba2b54252fe43e1d1d71a9890` | **Affected (rewritten)** |
| 3 | `refs/heads/dfarm_customer_mobile_app` | `6a3b890c619eced44c8f0b2242222737783aff7a` | `6a3b890c619eced44c8f0b2242222737783aff7a` | Unaffected (unchanged) |
| 4 | `refs/heads/feature/cloudflare-pages-deployment` | `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3` | `7a9c10be01f2348188a1638358eb591ec81307fc` | **Affected (rewritten)** |
| 5 | `refs/heads/fix/cloudflare-pages-production-deploy` | `c84ab2160be5b26489761e527bf992d1b22036b9` | `6910e1df9ebd6d77560a37c4214658f3d893519b` | **Affected (rewritten)** |
| 6 | `refs/heads/main` | `d62ba16eb4f8a65f158c089d42e3e78a5d984d50` | `e732a566760732f40e2cfbf111a4a81b2b3beb91` | **Affected (rewritten)** |
| 7 | `refs/heads/remediation/dfarm-master-2026-11-14` | `2d861ef74fc5a25502d20d0b4dd60e2302bd35ac` | `2d861ef74fc5a25502d20d0b4dd60e2302bd35ac` | Unaffected (unchanged) |
| 8 | `refs/heads/stabilization/dfarm-two-app-stability` | `6a3b890c619eced44c8f0b2242222737783aff7a` | `6a3b890c619eced44c8f0b2242222737783aff7a` | Unaffected (unchanged) |
| 9 | `refs/heads/swarm-offline-db-38accde7` | `57e594da59dfa867651b9a435d694abac124be09` | `57e594da59dfa867651b9a435d694abac124be09` | Unaffected (unchanged) |
| 10 | `refs/heads/upgrade/expo-sdk58-migration` | `6a3b890c619eced44c8f0b2242222737783aff7a` | `6a3b890c619eced44c8f0b2242222737783aff7a` | Unaffected (unchanged) |
| 11 | `refs/remotes/origin/dfarm_customer_app_init` | `e638850f196b758736237b9119a40ee977586a39` | `57883fa5f1321e3ba2b54252fe43e1d1d71a9890` | **Affected (rewritten)** |
| 12 | `refs/remotes/origin/feature/cloudflare-pages-deployment` | `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3` | `7a9c10be01f2348188a1638358eb591ec81307fc` | **Affected (rewritten)** |
| 13 | `refs/remotes/origin/fix/cloudflare-pages-production-deploy` | `c84ab2160be5b26489761e527bf992d1b22036b9` | `6910e1df9ebd6d77560a37c4214658f3d893519b` | **Affected (rewritten)** |
| 14 | `refs/remotes/origin/main` | `d62ba16eb4f8a65f158c089d42e3e78a5d984d50` | `e732a566760732f40e2cfbf111a4a81b2b3beb91` | **Affected (rewritten)** |
| 15 | `refs/remotes/origin/upgrade/expo-sdk58-migration` | `6a3b890c619eced44c8f0b2242222737783aff7a` | `6a3b890c619eced44c8f0b2242222737783aff7a` | Unaffected (stale local tracking ref; absent on live `origin`) |

---

## 2. Remote Ref Freeze Comparison (Phase 2)

Read-only inspection via `git ls-remote origin` and `git ls-remote --tags origin` confirmed that **no remote branch has moved** since FIX-02.1 and **0 tags** exist on `origin`.

| Remote ref | Previously audited old SHA | Current remote SHA | Expected new SHA | Safe to update |
|---|---|---|---|---|
| `HEAD` (symbolic -> `refs/heads/main`) | `d62ba16eb4f8a65f158c089d42e3e78a5d984d50` | `d62ba16eb4f8a65f158c089d42e3e78a5d984d50` | `e732a566760732f40e2cfbf111a4a81b2b3beb91` (follows `main`) | N/A (follows `refs/heads/main`) |
| `refs/heads/main` | `d62ba16eb4f8a65f158c089d42e3e78a5d984d50` | `d62ba16eb4f8a65f158c089d42e3e78a5d984d50` | `e732a566760732f40e2cfbf111a4a81b2b3beb91` | **YES** (Exact match) |
| `refs/heads/fix/cloudflare-pages-production-deploy` | `c84ab2160be5b26489761e527bf992d1b22036b9` | `c84ab2160be5b26489761e527bf992d1b22036b9` | `6910e1df9ebd6d77560a37c4214658f3d893519b` | **YES** (Exact match) |
| `refs/heads/feature/cloudflare-pages-deployment` | `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3` | `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3` | `7a9c10be01f2348188a1638358eb591ec81307fc` | **YES** (Exact match) |
| `refs/heads/dfarm_customer_app_init` | `e638850f196b758736237b9119a40ee977586a39` | `e638850f196b758736237b9119a40ee977586a39` | `57883fa5f1321e3ba2b54252fe43e1d1d71a9890` | **YES** (Exact match) |
| `refs/heads/upgrade/expo-sdk58-migration` | `6a3b890c619eced44c8f0b2242222737783aff7a` (local `refs/remotes/origin/...`) | *Absent on `origin`* | *Do not push* (unaffected anyway) | **NO** (Stale local ref; unaffected) |
| `refs/tags/*` | None (`0` tags) | None (`0` tags) | None (`0` tags) | N/A |

**Read-Only GitHub PR Refs Observed on `origin` (Cannot be force-pushed by user; require GitHub Support purge):**
- `refs/pull/1/head`: `5cca96c4a614e264fca777ec4153b0486a4d4f9a` (contains `.temp/` screens)
- `refs/pull/2/head`: `cbeb426c4b88032637275d535ec2e99c2d4364b8`
- `refs/pull/3/head`: `7fb85d497c8b0afe637a6e120d4898aa271a52cc`
- `refs/pull/4/head`: `66ee7d3b975e1c24ebe6e5955827a371923f0c93`
- `refs/pull/5/head`: `b2cdd08f8be9d9c02fbe1d4d81cf5971a4bbe0db`
- `refs/pull/6/head`: `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3`
- `refs/pull/7/head`: `3fff970b372dcae74ddafd2bc3e60614142762de`
- `refs/pull/8/head`: `53d23448b5cd835e22d32b420a74f509b889c608`

---

## 3. Secret Scan Coverage (Phase 1 Independent Verification)

An independent full-history Python scan (`verify_audit_mirror.py`) was executed directly against `dfarm-audit-mirror.git` (`git -C <audit_mirror>`):
- **Reachable Objects:** `6,383`
- **Reachable Blobs Scanned:** **`4,822` / `4,822`** (`171,267,374` bytes total, **`0` skipped**, no file size cap)
- **`.temp/` or `chrome-cdp` Paths:** **`0`**
- **Exposed Google Maps API Key (`AIzaSyCZ***`) or Non-Placeholder `AIza*` Keys:** **`0`**
- **Regex Findings Triage:**
  - `79` hits automatically filtered as known local/demo/placeholder strings (`supabase-demo`, `127.0.0.1`, `localhost`, `db.cluster.internal`, `AIzaSyYourActual*`, `placeholder_*`, `your-*`, `postgres.[ref]:[pass]`, etc.).
  - `29` remaining pattern matches individually decoded/verified across `16` blobs — **100% confirmed non-secret** (`supabase-demo` JWTs in `env.ts`/`env.js`/`backend-setup.md`, `[user]:[password]` and `dfarm_app` `db.dfarm.internal` doc examples, `FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."` doc placeholders, `process.env` / Zod `z.string()` references, and `'a'.repeat(...)` test fixtures).
- **Confirmed Real Secrets in Rewritten Mirror:** **`0`**.

---

## 4. Google Maps Credential Remediation Status (Phase 4)

No actual API key was read or printed during this audit.

| # | Remediation Step | Status | Operator Verification Evidence Required |
|---:|---|---|---|
| 1 | New Google Maps API key generated in GCP Console | **PENDING HUMAN ACTION** | Confirmation timestamp + masked last-4 suffix only |
| 2 | API restrictions configured (Maps JavaScript, Places, Geocoding only) | **PENDING HUMAN ACTION** | GCP API restriction screenshot/confirmation |
| 3 | HTTP referrer restrictions configured for actual production domains (`admin.dfarm.in/*`, `*.dfarm-super-admin.pages.dev/*`, etc.) | **PENDING HUMAN ACTION** | GCP HTTP referrer list confirmation |
| 4 | New key installed in required Cloudflare Pages environments (`dfarm-super-admin` production & preview) | **PENDING HUMAN ACTION** | Cloudflare Pages env var update confirmation |
| 5 | Application tested with the new key (location picker, autocomplete, reverse geocoding) | **PENDING HUMAN ACTION** | Live UI smoke test pass after key swap |
| 6 | Old exposed Google Maps API key (`AIzaSyCZ***`) revoked/deleted in GCP Console | **PENDING HUMAN ACTION** | GCP key deletion confirmation (mandatory **before** public push) |
| 7 | Old key usage and billing checked for suspicious/unauthorized activity | **PENDING HUMAN ACTION** | GCP Metrics & Billing anomaly check |

---

## 5. Google OAuth Session Review Status (Phase 5)

| # | Account Hygiene Action (Relevant Account Owners / `d.farm.expart@gmail.com` & Chrome Profile Accounts) | Status |
|---:|---|---|
| 1 | Review active devices and Google account sessions (`myaccount.google.com/device-activity`) | **PENDING HUMAN ACTION** |
| 2 | Identify any unexpected or unrecognized logins | **PENDING HUMAN ACTION** |
| 3 | Sign out / revoke suspicious or unfamiliar sessions | **PENDING HUMAN ACTION** |
| 4 | Review connected third-party application access (`myaccount.google.com/permissions`) and remove unneeded grants | **PENDING HUMAN ACTION** |
| 5 | Re-authenticate developer workstation applications where required (and rotate Gmail App Password / GCP / Supabase / Render / Cloudflare tokens if ever signed into `.temp/chrome-cdp/`) | **PENDING HUMAN ACTION** |

---

## 6. Backup Encryption Status (Phase 6)

- **Current Backup Location:** `C:\Users\panka\.gemini\antigravity\brain\e6c389d6-c511-4413-9bab-098685347c70\scratch\dfarm-pre-rewrite-backup.bundle` (`117,155,617` bytes) — **outside the repository**, untracked, and not uploaded.
- **Current Protection:** NTFS ACLs restricted (`PANKAJ-PC\panka:(F)`, `NT AUTHORITY\SYSTEM:(F)`, `BUILTIN\Administrators:(F)`), **NOT encrypted** (`cipher` reports `U`).
- **Host Capability Findings:** OS is `Microsoft Windows 11 Home Single Language` (no NTFS EFS support; `Get-BitLockerVolume` returned no active encrypted volume without elevation; `7z`, `gpg`, and `openssl` are not installed).
- **Backup Encryption Status:** **PENDING HUMAN ACTION** *(Restrictive NTFS ACLs do not constitute encryption; do not delete the only recoverable backup until remote history cleanup and verification are complete.)*

### Recommended Encrypted-Storage & Post-Encryption Verification Procedure

1. Install 7-Zip (or use an already-trusted BitLocker/VeraCrypt encrypted drive outside the repo):
   ```powershell
   winget install 7zip.7zip
   ```
2. Encrypt the bundle into an AES-256 archive with encrypted headers (`-mhe=on`) outside the repository:
   ```powershell
   $backupDir = "C:\Users\panka\.gemini\antigravity\brain\e6c389d6-c511-4413-9bab-098685347c70\scratch"
   & "C:\Program Files\7-Zip\7z.exe" a -t7z -mhe=on -mx=5 "$backupDir\dfarm-pre-rewrite-backup.bundle.7z" "$backupDir\dfarm-pre-rewrite-backup.bundle" -p
   ```
3. Verify the encrypted archive can be decrypted and verified cleanly **outside** the repository before removing the plaintext bundle:
   ```powershell
   $verifyDir = Join-Path $env:TEMP "dfarm-backup-verify"
   New-Item -ItemType Directory -Path $verifyDir -Force | Out-Null
   & "C:\Program Files\7-Zip\7z.exe" x "$backupDir\dfarm-pre-rewrite-backup.bundle.7z" "-o$verifyDir"
   git bundle verify "$verifyDir\dfarm-pre-rewrite-backup.bundle"
   Remove-Item $verifyDir -Recurse -Force
   ```
4. Only after `git bundle verify` succeeds on the decrypted copy, remove the plaintext bundle (`Remove-Item "$backupDir\dfarm-pre-rewrite-backup.bundle"`). Retain the encrypted archive until remote history cleanup and team re-cloning are verified, then delete it.

---

## 7. Local Chrome Profile Disposal Status & Working-Tree Staged Changes (Phase 7)

### Chrome Profile Directory Inspection
- **Target Directory:** `c:\Users\panka\.gemini\antigravity\worktrees\DFarm\dfarm_customer_app_init\.temp\chrome-cdp`
- **Current State on Disk:** Exists (`1,827` files, `120,494,644` bytes total).
- **Process / Lock Check:** Inspected `Win32_Process` command lines for `chrome`, `msedge`, `node`, `playwright`, `puppeteer`, `chromium`, and any process referencing `chrome-cdp` or `.temp`. **`0` external processes** hold or reference `.temp/chrome-cdp` or `.temp` (only unrelated user browser sessions such as personal Edge/Chrome profiles are running and were left untouched).
- **Disposal Status:** **PENDING HUMAN ACTION (Awaiting Explicit Operator Approval)** — Not deleted.
- **Note on "1,807 Staged Changes":** Inspection of `git diff --cached --name-status` in the working repository confirms that **all `1,807` staged changes are deletions (`D`) under `.temp/`** (`1,805` in `.temp/chrome-cdp/**` + `2` `.temp/*.png` screenshots; **`0` non-`.temp` files staged**). This is the expected result of `git rm -r --cached .temp` from FIX-02, removing `.temp/` from Git tracking (`git ls-files .temp` = `0`) while leaving `.gitignore` active. Because the remote history rewrite replaces commit SHAs, **do not push from this worktree directly before the rewrite**; after the remote rewrite completes, migrate/commit the legitimate working-tree edits (`services/backend/**`, `.gitignore`, `.gitleaks.toml`, `.github/workflows/secret-scan.yml`, docs, etc.) onto a clean clone/worktree of the rewritten branch without re-adding `.temp/`.

### Approved Disposal Procedure (Execute Only After Operator Confirmation)
1. Confirm no local data inside `.temp/chrome-cdp/` requires preservation.
2. Delete the local directory:
   ```powershell
   Remove-Item -LiteralPath "c:\Users\panka\.gemini\antigravity\worktrees\DFarm\dfarm_customer_app_init\.temp\chrome-cdp" -Recurse -Force
   ```
3. Verify removal:
   ```powershell
   Test-Path "c:\Users\panka\.gemini\antigravity\worktrees\DFarm\dfarm_customer_app_init\.temp\chrome-cdp"  # Must return False
   ```
4. **Windows SSD Caveat:** Standard Windows deletion (`Remove-Item` / Recycle Bin) does **not** guarantee forensic erasure on SSD storage due to controller wear-leveling. Any credentials or sessions ever entered in that profile must be revoked/rotated externally.

---

## 8. Gitleaks & CI Verification Status (Phase 8)

Inspected `.gitleaks.toml`, `.github/workflows/secret-scan.yml`, and `DFARM_SECURITY_GUIDE.md`:

| Check | Status | Verified Details |
|---|---|---|
| `.gitleaks.toml` allowlist scope | **VERIFIED** | Extends `useDefault = true`. Contains **only 5 explicit placeholder regexes** (`supabase-demo`, `ba9dcdcdfcXX`, `AIzaSyYourActual...`, `placeholder_...`, `your-(project-ref\|password\|admin-password\|email@gmail.com\|app-password)`). **No path-based suppression** hides secrets in `.env.example` (confirmed all 5 `.env.example` files contain placeholders only). |
| `.github/workflows/secret-scan.yml` scan range & failure behavior | **VERIFIED** | Triggers on `push` (`main`, `fix/cloudflare-pages-production-deploy`, `feature/**`) and `pull_request` (`main`, `fix/cloudflare-pages-production-deploy`). Uses `actions/checkout@v4` with `fetch-depth: 0` (full history), runs `./gitleaks detect --source . --config .gitleaks.toml --verbose --redact` (redacts secrets in logs and exits non-zero on findings), and runs a tracked `.temp/`/`chrome-cdp`/`Cookies`/`Login Data` guard (`exit 1` on match). |
| Workflow permissions | **VERIFIED** | Minimal: `permissions: contents: read`. |
| Local `gitleaks` CLI execution | **NOT RUN** | `gitleaks` is not installed locally (`Get-Command gitleaks` -> `NOT INSTALLED`). Custom Python scan pass does not substitute for Gitleaks. |
| GitHub Actions live run status | **NOT RUN (0 runs)** | Verified via GitHub API (`https://api.github.com/repos/Swiftify0099/DFarm/actions/runs`): `total_count: 0` because `.github/workflows/secret-scan.yml` is currently an untracked local file not yet pushed to `origin`. |

---

## 9. Backend Regression Accountability (Phase 9)

Re-executed all 11 offline suites (`NODE_ENV=test`, `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:59999/dfarm_offline`, `CENTRAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:59999/dfarm_offline`) on both the current working tree (`190 pass / 24 fail` across the 11-suite runner; `8 + 10 + 5 = 23` TAP failures when each failing suite runs individually) and an isolated clean extraction of the pre-FIX-02 baseline commit `c84ab21`.
- **8 passing suites:** `clean-architecture.test.js` (`9/9 PASS`), `fix01-production-auth-otp-security.test.js` (`11/11 PASS`), `dairy-admin-production.test.js`, `super-admin-production.test.js`, `tenant-database-isolation.test.js`, `multi-dairy-membership.test.js`, `dairy-activation-workflow.test.js`, `dairy-location.test.js`.
- **3 failing suites (`23` total TAP failures = `14` leaf assertions + `6` group wrappers + `3` suite wrappers):**

### Detailed Accountability Matrix (All 14 Leaf Assertions + 9 Wrapper Failures)

| # | Suite | Test / Subtest Name | Exact Failure Category | Uses Unsupported `pg-mem`? | Fails on Pre-FIX-02 Baseline (`c84ab21`)? | Requires Real PG / Supabase? | Genuine Application Regression? |
|---:|---|---|---|:---:|:---:|:---:|---|
| 1 | `biometric-engine.test.js` | `8. Unique enrollment constraints: persists enrollment and supersedes old active ones` | HTTP `404` (expected `201`) — `modules/biometrics/biometric.routes.ts` (`customerBiometricRouter`) is not mounted in `cleanApiRouter` | **No** | **Yes** | **No** (mocked repos) | Pre-existing unmounted legacy route gap (from `c84ab21`), **not FIX-02** |
| 2 | `biometric-engine.test.js` | `9. Inactive customer rejection: enrollment rejected for suspended customer` | HTTP `404` (expected `400`) — same unmounted router | **No** | **Yes** | **No** | Pre-existing unmounted legacy route gap, **not FIX-02** |
| 3 | `biometric-engine.test.js` | `10. Revoked consent rejection: enrollment blocked when consent is not active` | HTTP `404` (expected `403`) — same unmounted router | **No** | **Yes** | **No** | Pre-existing unmounted legacy route gap, **not FIX-02** |
| 4 | `biometric-engine.test.js` | `11. Deleted customer rejection: soft-deleted customer rejected immediately` | HTTP `404` (expected `400`) — same unmounted router | **No** | **Yes** | **No** | Pre-existing unmounted legacy route gap, **not FIX-02** |
| 5 | `biometric-engine.test.js` | `18. Backend REST APIs: face-status and face-revoke endpoints` | HTTP `404` (expected `200`) — same unmounted router | **No** | **Yes** | **No** | Pre-existing unmounted legacy route gap, **not FIX-02** |
| 6 | `biometric-engine.test.js` | `19. Model metadata API: authorized officers can list active face recognition models` | HTTP `404` (expected `200`) — `identityBiometricRouter` (`/face-models`) not mounted | **No** | **Yes** | **No** | Pre-existing unmounted legacy route gap, **not FIX-02** |
| 7 | `biometric-engine.test.js` | `20. Biometric confidentiality: endpoints NEVER return raw embeddings or photographs` | HTTP `404` (expected `401`) — unauthenticated `GET /face-status` hits Express 404 before auth | **No** | **Yes** | **No** | Pre-existing unmounted legacy route gap, **not FIX-02** |
| 8 | `biometric-engine.test.js` | *(Wrapper)* `DFarm Phase 07: Biometric Face Engine & Verification Suite (20 Scenarios)` | Suite rollup (`7 subtests failed`) | No | Yes | No | Rollup of #1–#7 |
| 9 | `collection-kiosk-production.test.js` | `3. Cross-dairy operator cannot view active session of another dairy` (`GROUP A`) | Assertion `false` — FIX-01.1 uncommitted `PostgresShiftSessionRepository.ts` added `AND s.organization_id = $3` to `findActiveSession`, so Dairy B gets `null`, causing `GetActiveShiftSessionUseCase` to auto-open a Dairy B session at `testCenterA` with identical deterministic `sessionCode` (`SH-20261126-M-KIOS`), returning `200` with `sessionCode === activeSessionCode` | **No** | **No** *(passed on `c84ab21`, where `c84ab21` instead failed #9, #10, #11)* | **No** | **Yes — genuine behavior/test mismatch in `GET /collections/sessions/active` auto-open from uncommitted FIX-01.1 work (unrelated to FIX-02)** |
| 10 | `collection-kiosk-production.test.js` | `12. Offline batch push endpoint synchronizes locally queued weighments with atomic ledger credit` (`GROUP D`) | Assertion `0 !== 1` (`res.body.data.succeeded === 0`) — `sync.routes.ts` `handleSyncBatch` omits `organizationId` when calling `syncUseCase.execute(...)`, failing with `"Authenticated organization ID is required for collection processing"` | **No** | **Yes** | **No** | **Yes — pre-existing application bug in `sync.routes.ts` (present in `c84ab21`, not FIX-02)** |
| 11 | `collection-kiosk-production.test.js` | `13. Re-syncing the same offline batch returns idempotent replay without duplicate accounting` (`GROUP D`) | Assertion `0 !== 1` — same `sync.routes.ts` missing `organizationId` bug | **No** | **Yes** | **No** | **Yes — pre-existing application bug in `sync.routes.ts` (present in `c84ab21`, not FIX-02)** |
| 12 | `collection-kiosk-production.test.js` | `14. Kiosk reconciles and closes shift session via POST /api/v1/collections/sessions/:id/close` (`GROUP E`) | Cascading assertion `totalLiters >= 30.0` false (`18L` online succeeded, `12L` offline sync in #10 failed) | **No** | **Yes** | **No** | Cascading from #10 (`sync.routes.ts` bug, not FIX-02) |
| 13 | `collection-kiosk-production.test.js` | `16. Double-entry subledger contains both online and offline MILK_CREDIT entries` (`GROUP F`) | Cascading assertion `< 2 MILK_CREDIT entries` (offline sync in #10 failed) | **No** | **Yes** | **No** | Cascading from #10 (`sync.routes.ts` bug, not FIX-02) |
| 14–18 | `collection-kiosk-production.test.js` | *(Wrappers)* `GROUP A`, `GROUP D`, `GROUP E`, `GROUP F`, and top suite wrapper (`5` TAP items) | Rollup failures (`1` + `2` + `1` + `1` + `4 subtests failed`) | No | Yes | No | Rollup of #9–#13 |
| 19 | `customer-app-production.test.js` | `12. Authenticating as approved customer returns FARMER_CUSTOMER session` (`GROUP D`) | SQL error `column "body" does not exist` — test fixture `INSERT INTO customer_notifications (..., title, body, is_read)` uses `body`, whereas migration `022_customer_notifications.sql` defines column `message` | **No** *(fails on real PG schema too)* | **Yes** | **No** | **No — stale test fixture SQL (pre-existing in `c84ab21`, not FIX-02)** |
| 20 | `customer-app-production.test.js` | `21. GET /feed/products returns active feed catalog for customer dairy` (`GROUP H`) | Missing seeded product `'FEED-50KG'` — test `seedDbs` hits `pg-mem` `NotSupported` AST error on `CREATE TABLE IF NOT EXISTS feed_categories (... DEFAULT gen_random_uuid() ...)` (swallowed by `try/catch`), and migration `014` uses `is_active` rather than test's `status` column | **Yes** *(AST error on `CREATE TABLE IF NOT EXISTS ... DEFAULT gen_random_uuid()`, plus `014` column mismatch)* | **Yes** | **Partially** *(real PG handles DDL, though test seed `status` column still mismatches `014`)* | **No — test fixture DDL/`pg-mem` AST + stale seed column (pre-existing in `c84ab21`, not FIX-02)** |
| 21–23 | `customer-app-production.test.js` | *(Wrappers)* `GROUP D`, `GROUP H`, and top suite wrapper (`3` TAP items) | Rollup failures (`1` + `1` + `2 subtests failed`) | See #19–#20 | Yes | See #19–#20 | Rollup of #19–#20 |

*(Note: When all 11 suites are passed in a single `node --test` invocation, Node also emits 1 additional file-level `not ok` line for `biometric-engine.test.js`, yielding `24` TAP `not ok` lines in the combined runner vs `8 + 10 + 5 = 23` across the 3 failing suites.)*

### Preserved FIX-01.1 Pending Real-Database & Production Gates (Separate from FIX-02)
1. `prompt425-browser-webcrypto-challenge-audit.test.js` against disposable real PostgreSQL — **NOT RUN**.
2. `customer-tenant-approval-e2e.test.js` against isolated local Supabase — **NOT RUN**.
3. Production admin & organization data contamination audit (69 orgs / 41 admins / Warna Milk code discrepancy / migration `041` tracking reconciliation) — **MANUAL AUDIT REQUIRED**.
4. Live Render environment, real SMS OTP delivery, and CORS verification — **NOT VERIFIED**.

---

## 10. Exact Branch-by-Branch Force-With-Lease Commands (Phase 3)

**Preconditions before running any push command below:**
1. Confirm the remote freeze still holds (`git ls-remote origin` matches the `Old Remote SHA` column).
2. Complete Phases 4–6 first (revoke old Google Maps key, review/revoke Google OAuth sessions, encrypt and verify the offline backup).
3. Run from the verified rewritten mirror (`C:\Users\panka\.gemini\antigravity\brain\e6c389d6-c511-4413-9bab-098685347c70\scratch\dfarm-audit-mirror.git`) — **OR** if re-running `git-filter-repo` fresh, replace each `<SOURCE_REWRITTEN_SHA>` with the newly generated SHA after passing the 4,822-blob scan. **Never** use `git push --mirror`, wildcard pushes, implicit leases, or unreviewed tag pushes. **Do not push any of the 7 unaffected refs.**

| Destination Remote Branch | Source Rewritten SHA (`dfarm-audit-mirror.git`) | Expected Current Remote SHA |
|---|---|---|
| `refs/heads/main` | `e732a566760732f40e2cfbf111a4a81b2b3beb91` | `d62ba16eb4f8a65f158c089d42e3e78a5d984d50` |
| `refs/heads/fix/cloudflare-pages-production-deploy` | `6910e1df9ebd6d77560a37c4214658f3d893519b` | `c84ab2160be5b26489761e527bf992d1b22036b9` |
| `refs/heads/feature/cloudflare-pages-deployment` | `7a9c10be01f2348188a1638358eb591ec81307fc` | `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3` |
| `refs/heads/dfarm_customer_app_init` | `57883fa5f1321e3ba2b54252fe43e1d1d71a9890` | `e638850f196b758736237b9119a40ee977586a39` |

```powershell
Set-Location "C:\Users\panka\.gemini\antigravity\brain\e6c389d6-c511-4413-9bab-098685347c70\scratch\dfarm-audit-mirror.git"

git push https://github.com/Swiftify0099/DFarm.git `
  --force-with-lease=refs/heads/main:d62ba16eb4f8a65f158c089d42e3e78a5d984d50 `
  e732a566760732f40e2cfbf111a4a81b2b3beb91:refs/heads/main

git push https://github.com/Swiftify0099/DFarm.git `
  --force-with-lease=refs/heads/fix/cloudflare-pages-production-deploy:c84ab2160be5b26489761e527bf992d1b22036b9 `
  6910e1df9ebd6d77560a37c4214658f3d893519b:refs/heads/fix/cloudflare-pages-production-deploy

git push https://github.com/Swiftify0099/DFarm.git `
  --force-with-lease=refs/heads/feature/cloudflare-pages-deployment:9cd42bc9a43d55e8772af9edd121d8dbb64b05e3 `
  7a9c10be01f2348188a1638358eb591ec81307fc:refs/heads/feature/cloudflare-pages-deployment

git push https://github.com/Swiftify0099/DFarm.git `
  --force-with-lease=refs/heads/dfarm_customer_app_init:e638850f196b758736237b9119a40ee977586a39 `
  57883fa5f1321e3ba2b54252fe43e1d1d71a9890:refs/heads/dfarm_customer_app_init
```

---

## 11. GitHub Support Cache Purge Requirements

Immediately after the 4 `--force-with-lease` pushes succeed, submit a cache-removal ticket at **https://support.github.com/contact** for `Swiftify0099/DFarm`:
1. Request removal of cached commit views, tree blobs, and PR diff caches for the purged commits:
   - `.temp/` commits: `e638850f196b758736237b9119a40ee977586a39`, `5cca96c4a614e264fca777ec4153b0486a4d4f9a`, `d3d21891292c578bb8ec77221b6768c2fc67356e`
   - Google Maps API key commits: `c3b1a2491666082569d1bf806aec060d0cd626fc`, `110b899711ca68ca94cc75a256fc5f410f412431`
2. Request purge/refresh of read-only pull request refs (`refs/pull/1/head` through `refs/pull/8/head`), especially `refs/pull/1/head` (`5cca96c4a614e264fca777ec4153b0486a4d4f9a`) and `refs/pull/6/head` (`9cd42bc9a43d55e8772af9edd121d8dbb64b05e3`).
3. Verify no public forks on GitHub continue to serve the old commits.

---

## 12. Collaborator Re-Clone Requirements

1. **Freeze all pushes** on `Swiftify0099/DFarm` until the 4 `--force-with-lease` pushes complete.
2. All collaborators and local worktrees (`C:/Users/panka/OneDrive/Desktop/DFarm`, `dfarm_customer_app_init`, `dfarm_customer_mobile_app`) must **NOT** `git pull` or `git merge` old local history onto the rewritten branches (doing so would re-inject the purged `.temp/` and exposed-key commits).
3. Save any uncommitted local patches (including FIX-01.1 + FIX-02/02.1/02.2 worktree changes, excluding `.temp/`), delete old local clones/worktrees, and **`git clone https://github.com/Swiftify0099/DFarm.git` fresh** before cherry-picking/applying and committing clean changes.
4. Once `DFARM_FIX02_2_REMOTE_HISTORY_REWRITE_APPROVAL.md` and `.github/workflows/secret-scan.yml` are pushed on a clean rewritten branch, verify the **Secret Scanning (Gitleaks)** GitHub Actions workflow passes on `origin`.

---

## 13. Remaining Deployment Blockers

1. **Human Security Actions (FIX-02 / FIX-02.2):**
   - Rotate Google Maps API key, apply API + HTTP referrer restrictions, update Cloudflare Pages env vars, and revoke old key `AIzaSyCZ***`.
   - Complete Google OAuth / account session review and rotate any provider tokens if `.temp/chrome-cdp/` ever authenticated them.
   - Encrypt `dfarm-pre-rewrite-backup.bundle` and verify decryption outside the repo.
   - Execute the 4 approved `--force-with-lease` pushes and submit the GitHub Support cache purge ticket.
   - Approve and verify deletion of local `.temp/chrome-cdp/`.
   - Push `.github/workflows/secret-scan.yml`, `.gitleaks.toml`, `.gitignore`, redacted files, and FIX-01.1/02 work from a fresh clone of rewritten history and confirm Gitleaks CI passes.
2. **Backend Regression & Code Hygiene Fixes:**
   - Resolve `sync.routes.ts` `handleSyncBatch` missing `organizationId` (`POST /api/v1/sync/push` / `/transactions`).
   - Resolve `GET /api/v1/collections/sessions/active` cross-dairy `testCenterA` auto-open `sessionCode` collision introduced in uncommitted FIX-01.1 changes.
   - Decide on mounting or deprecating legacy `modules/biometrics/biometric.routes.ts` and update stale `customer-app-production.test.js` seed columns (`message` vs `body`, `is_active` vs `status`).
3. **FIX-01.1 Real-Database & Production Verification Gates:**
   - Run `prompt425-browser-webcrypto-challenge-audit.test.js` against disposable real PostgreSQL.
   - Run `customer-tenant-approval-e2e.test.js` against isolated local Supabase.
   - Complete manual production admin & organization contamination audit and verify live Render environment, real SMS OTP delivery, and CORS.
