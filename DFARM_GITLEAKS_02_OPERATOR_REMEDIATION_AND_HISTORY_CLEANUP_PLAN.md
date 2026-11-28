# DFarm — GITLEAKS-02 Operator Remediation & Git History Cleanup Plan (`DF-003`)

**Repository:** `Swiftify0099/DFarm`  
**Priority:** `P0`  
**Task:** `GITLEAKS-02` (`DF-003`)  
**Previous Gitleaks Run:** `46099475175` (`FAILURE — 16 historical findings`)  
**Verified Local Branch:** `fix/cloudflare-pages-production-deploy`  
**Verified Local HEAD SHA:** `82b3feb95db13820bdeaf64b041109b71c640799`  
**Verified Remote Branch (`origin/fix/cloudflare-pages-production-deploy`):** `82b3feb95db13820bdeaf64b041109b71c640799`  
**Local Historical Findings Verified (`gitleaks v8.21.2`):** `16` findings (`EXIT=1`, `52` commits scanned)  
**Current Tracked-Tree Findings (`--no-git`):** `0` findings (`EXIT=0`, `2,848` tracked files)  
**Final Classification:** **`PARTIAL — READINESS PLAN COMPLETE, OPERATOR ACTIONS STILL PENDING`**

> [!IMPORTANT]
> **Explicit Security & Non-Modification Statement:**
> - **No credentials were rotated, created, or revoked.**
> - **No production services or production databases were accessed or queried.**
> - **No `.temp/` or backup files were deleted or modified** (`1,827` files in local `.temp/chrome-cdp/` remain untouched and untracked).
> - **No Git history was rewritten** (`git-filter-repo`, `git filter-branch`, BFG, `rebase`, `reset --hard`, `clean`, `stash`, `checkout -- .` were **not** executed).
> - **No `git commit`, `git push`, or force-push was executed.**
> - **Zero raw secret values, secret hashes, cookie values, passwords, OAuth tokens, session tokens, or real invitation tokens are printed or stored in this document.**
> - **`DF-003` remains OPEN / PARTIAL** until all operator-controlled credential remediations and the explicitly approved Git history purge are completed and verified.

---

## 1. Verified Git Baseline & Gitleaks Summary

| Verification Item | Verified Observation |
|---|---|
| Local branch (`git branch --show-current`) | `fix/cloudflare-pages-production-deploy` |
| Local HEAD (`git rev-parse HEAD`) | `82b3feb95db13820bdeaf64b041109b71c640799` |
| Remote HEAD (`git ls-remote origin refs/heads/fix/cloudflare-pages-production-deploy`) | `82b3feb95db13820bdeaf64b041109b71c640799` (exact match) |
| Remote URL (`git remote -v`) | `https://github.com/Swiftify0099/DFarm.git` (`fetch` & `push`) |
| Pre-edit working tree (`git status --short`) | Clean (`nothing to commit, working tree clean`) |
| Original Gitleaks Run (`46099475175`) | `FAILURE — 16 historical findings` |
| Local `gitleaks v8.21.2` full-history scan (`--config .gitleaks.toml --verbose --redact=100`) | `52` commits scanned, **`16` findings** (`EXIT=1`) — exact match |
| Local `gitleaks v8.21.2` tracked `HEAD` scan (`--no-git --config .gitleaks.toml --redact=100`) | `2,848` tracked files, **`0` findings** (`EXIT=0`) |

### Breakdown of the `16` Historical Findings

| Category | Finding Count | Rule ID | Historical Commit(s) | Present in Tracked `HEAD`? | Remediation Prerequisite |
|---|---:|---|---|---:|---|
| 1. Historical Google Maps API Key | **2** | `gcp-api-key` | `110b899711ca68ca94cc75a256fc5f410f412431`, `c3b1a2491666082569d1bf806aec060d0cd626fc` | **No (`0` hits)** | GCP Console review, replacement key with HTTP referrer & API restrictions, Cloudflare Pages update, revoke old key, then purge history |
| 2. `.temp/chrome-cdp/` Browser Profile, Cache & Extensions | **11** | `generic-api-key` | `e638850f196b758736237b9119a40ee977586a39` *(plus `.temp/*.png` in `5cca96c4...`, merge `d3d21891...`)* | **No (`0` tracked)** | Google Account session/device/third-party access review, credential rotation if any were used in session, then purge `.temp/` from history |
| 3. `DF-SAN-2813` Historical Activation Token | **3** | `generic-api-key` | `74f2596c3ec1dc9479c7de53280f5cbd9d941d94` | **No (`0` hits)** | Verify `DF-SAN-2813` invitation state via authorized Super Admin interface, revoke/reissue if still valid, then purge token from history |
| **Total** | **16** | — | **`4` direct finding commits (`6` total history-purge commits)** | **`0` in `HEAD`** | **Separate credential rotation + Git history rewrite required** |

---

## 2. Category 1 — Historical Google Maps API Key Exposure (`2` Findings)

### 2.1 Historical Exposure Inventory (Values & Hashes Omitted)

| # | Rule ID | Commit SHA | Historical File Path | Line | Gitleaks Fingerprint |
|---:|---|---|---|---:|---|
| 1 | `gcp-api-key` | `110b899711ca68ca94cc75a256fc5f410f412431` | `apps/dfarm-super-admin/.env.example` | 23 | `110b899711ca68ca94cc75a256fc5f410f412431:apps/dfarm-super-admin/.env.example:gcp-api-key:23` |
| 2 | `gcp-api-key` | `c3b1a2491666082569d1bf806aec060d0cd626fc` | `docs/cleanup/EXTERNAL_INTEGRATION_VERIFICATION.md` | 47 | `c3b1a2491666082569d1bf806aec060d0cd626fc:docs/cleanup/EXTERNAL_INTEGRATION_VERIFICATION.md:gcp-api-key:47` |

- **Safe Local Equality Comparison:** In-memory comparison across both historical blobs confirmed that both findings expose the **exact same 39-character key** (`MAPS_SAME_KEY: True`, length `39`), without printing either value or any cryptographic hash.

### 2.2 Technical Distinction (`VITE_` Browser Variable)

`VITE_GOOGLE_MAPS_API_KEY` is bundled directly into client-side JavaScript by Vite (`import.meta.env.VITE_GOOGLE_MAPS_API_KEY` and `define` in [`apps/dfarm-super-admin/vite.config.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/vite.config.ts)). It is **not** a confidential server-side secret. Because any built frontend bundle exposes a `VITE_` Maps key to browser users, security depends on:
1. Never committing real keys into Git history or `.env.example`/documentation.
2. Enforcing strict **HTTP-referrer restrictions** and **API restrictions** in Google Cloud Console on any active replacement key.
3. Rotating and revoking the historically committed key because it was exposed unrestricted/publicly in Git history.

### 2.3 Current-Tree & Build Output Verification Evidence

1. **Current `.env.example` Templates:**
   - [`apps/dfarm-super-admin/.env.example`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/.env.example#L23) sets `VITE_GOOGLE_MAPS_API_KEY=AIzaSyYourActualGoogleMapsApiKeyPlaceholder` (obvious synthetic placeholder).
   - All four other tracked `.env.example` files ([`.env.example`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.env.example), [`apps/dfarm-collection-app/.env.example`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-collection-app/.env.example), [`apps/dfarm-customer-app/.env.example`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-customer-app/.env.example), [`apps/dfarm-dairy-admin/.env.example`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-dairy-admin/.env.example)) contain zero Google Maps keys and synthetic placeholders only.
2. **Tracked Source & Documentation:**
   - Byte-level scan of all `2,848` tracked files in `HEAD` found **`0` occurrences** of the historical 39-character key (`HISTORICAL_MAPS_IN_HEAD: 0`).
   - [`docs/cleanup/EXTERNAL_INTEGRATION_VERIFICATION.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docs/cleanup/EXTERNAL_INTEGRATION_VERIFICATION.md#L47) remains redacted (`[REDACTED — rotated/removed from docs; configure via local .env]`).
   - [`docs/super-admin/MAP_API_CONFIGURATION.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/docs/super-admin/MAP_API_CONFIGURATION.md#L59) uses explicit placeholder `AIzaSyYourActualSecretKeyHere_123456789` and `your_google_maps_api_key_here`.
   - `git grep -n "AIza"` across tracked files returns only explicit `AIzaSyYourActual...` placeholders, `.gitleaks.toml` allowlist regex, and masked audit prose (`AIzaSyCZ***`, `AIzaSyA2***`).
3. **Super Admin Frontend Configuration:**
   - [`DairyLocationPicker.tsx`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/src/features/dairies/DairyLocationPicker.tsx#L74-L77) reads `VITE_GOOGLE_MAPS_API_KEY` from `import.meta.env`, passes it to `@googlemaps/js-api-loader` (`setOptions({ key: apiKey })`), and falls back cleanly to manual coordinate/address entry when unset.
   - [`vite.config.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/vite.config.ts#L28-L36) loads `env.VITE_GOOGLE_MAPS_API_KEY || ''` via Vite `loadEnv`.
4. **Build Output Hygiene Note (Important Operational Observation):**
   - Tracked build output (`apps/dfarm-customer-app/dist/**`) contains **`0`** `AIza*` strings (`any_aiza_count=0`).
   - Local `apps/dfarm-super-admin/dist/` is **gitignored** (`0` tracked files in Git). However, because local untracked `.env` / `apps/dfarm-super-admin/.env` on this workstation still contains a local `VITE_GOOGLE_MAPS_API_KEY` value matching the historical key, running `vite build` locally injects that local `.env` value into untracked `apps/dfarm-super-admin/dist/assets/DairyLocationPicker-*.js`. The operator must **replace `VITE_GOOGLE_MAPS_API_KEY` in Cloudflare Pages and local `.env` and rebuild** after key rotation so no bundle containing the old key is ever deployed.

### 2.4 Operator Action Plan (Google Cloud Console & Cloudflare Pages)

The repository owner must perform these steps manually:

1. **Open Google Cloud Console** (`https://console.cloud.google.com/`).
2. **Identify the owning project** associated with the exposed `VITE_GOOGLE_MAPS_API_KEY`.
3. **Locate the affected Maps API key** under **APIs & Services → Credentials**.
4. **Review restrictions, usage, quotas, and billing logs:** inspect existing application/API restrictions, **Metrics / Quotas**, and **Billing** reports for any unauthorized traffic during the exposure window (`2026-11-17` onward).
5. **Create a restricted replacement API key** (if interactive mapping in `dfarm-super-admin` remains required).
6. **Apply HTTP-referrer (Websites) application restrictions** strictly for the actual DFarm Super Admin domains:
   - Production custom domain: `https://admin.dfarm.in/*`
   - Cloudflare Pages production/preview origins: `https://dfarm-super-admin.pages.dev/*` and `https://*.dfarm-super-admin.pages.dev/*`
   - *(Include staging or `http://localhost:5173/*` / `http://localhost:4173/*` only on a separate non-prod key or if explicitly authorized by the owner.)*
7. **Restrict the key strictly to required Maps APIs** used by `DairyLocationPicker.tsx`:
   - **Maps JavaScript API**
   - **Places API**
   - **Geocoding API**
8. **Update Cloudflare Pages environment variables** for `dfarm-super-admin` (**Settings → Environment variables** for Production and Preview: `VITE_GOOGLE_MAPS_API_KEY`), plus local gitignored `.env` files, and redeploy/rebuild.
9. **Verify production map functionality** on `dfarm-super-admin` (`DairyLocationPicker`: map tile rendering, Places address autocomplete, draggable pin drop, and reverse geocoding).
10. **Disable or revoke/delete the historical Maps API key** in Google Cloud Console once replacement functionality is verified (mandatory **before** public history rewrite/push).
11. **Record operator confirmation** (timestamp, owning GCP project name/ID, confirmation of restriction & revocation, billing review result) in the confirmation register **without recording the raw key value**.

---

## 3. Category 2 — Chrome CDP Browser Profile Exposure (`11` Findings)

### 3.1 Reachability & Historical Path Inventory (No Secret Values Extracted)

- **Reachability Confirmation:** Commit `e638850f196b758736237b9119a40ee977586a39` (`2026-11-19`) is **still reachable** from public GitHub refs:
  - Remote heads: `origin/dfarm_customer_app_init` (tip), `origin/feature/cloudflare-pages-deployment`, `origin/fix/cloudflare-pages-production-deploy`, `origin/main`
  - Local heads: `dfarm_customer_app_init`, `feature/cloudflare-pages-deployment`, `fix/cloudflare-pages-production-deploy`, `main`
  - Remote PR refs: `refs/pull/1/head` through `refs/pull/8/head`
- **Historical `.temp/` Scope Across Commits:**
  - `e638850f196b758736237b9119a40ee977586a39`: `1,805` files under `.temp/chrome-cdp/**`
  - `5cca96c4a614e264fca777ec4153b0486a4d4f9a`: `1,807` files (`1,805` under `.temp/chrome-cdp/**` + `.temp/android_runtime_screen.png`, `.temp/emulator_screen.png`)
  - `d3d21891292c578bb8ec77221b6768c2fc67356e`: merge commit preserving all `1,807` `.temp/` paths

#### All `11` Gitleaks Findings in `.temp/chrome-cdp/` (Commit `e638850f196b758736237b9119a40ee977586a39`)

| # | Historical Path | Line | Rule ID | Artifact Classification | Gitleaks Fingerprint |
|---:|---|---:|---|---|---|
| 1 | `.temp/chrome-cdp/Default/Cache/Cache_Data/f_000003` | 943 | `generic-api-key` | Chrome HTTP cache artifact (`Cache_Data`) | `e638850f196b758736237b9119a40ee977586a39:.temp/chrome-cdp/Default/Cache/Cache_Data/f_000003:generic-api-key:943` |
| 2 | `.temp/chrome-cdp/Default/Extensions/efaidnbmnnnibpcajpcglclefindmkaj/26.11.1.0_0/dist/chrome_content_scripts_utils_fte-utils_js.js` | 257 | `generic-api-key` | Chrome extension JS asset (`efaidnbmnnnibpcajpcglclefindmkaj` — Adobe Acrobat) | `e638850f196b758736237b9119a40ee977586a39:.temp/chrome-cdp/Default/Extensions/efaidnbmnnnibpcajpcglclefindmkaj/26.11.1.0_0/dist/chrome_content_scripts_utils_fte-utils_js.js:generic-api-key:257` |
| 3 | `.temp/chrome-cdp/Default/Extensions/efaidnbmnnnibpcajpcglclefindmkaj/26.11.1.0_0/dist/preferences-config.json` | 1483 | `generic-api-key` | Chrome extension JSON config (`efaidnbmnnnibpcajpcglclefindmkaj` — Adobe Acrobat) | `e638850f196b758736237b9119a40ee977586a39:.temp/chrome-cdp/Default/Extensions/efaidnbmnnnibpcajpcglclefindmkaj/26.11.1.0_0/dist/preferences-config.json:generic-api-key:1483` |
| 4 | `.temp/chrome-cdp/Default/Extensions/efaidnbmnnnibpcajpcglclefindmkaj/26.11.1.0_0/sw_modules/branch-module.js` | 18 | `generic-api-key` | Chrome extension service-worker module (`efaidnbmnnnibpcajpcglclefindmkaj` — Adobe Acrobat) | `e638850f196b758736237b9119a40ee977586a39:.temp/chrome-cdp/Default/Extensions/efaidnbmnnnibpcajpcglclefindmkaj/26.11.1.0_0/sw_modules/branch-module.js:generic-api-key:18` |
| 5 | `.temp/chrome-cdp/Default/Extensions/efaidnbmnnnibpcajpcglclefindmkaj/26.11.1.0_0/dist/PreferencePage.js` | 2 | `generic-api-key` | Chrome extension UI bundle (`efaidnbmnnnibpcajpcglclefindmkaj` — Adobe Acrobat) | `e638850f196b758736237b9119a40ee977586a39:.temp/chrome-cdp/Default/Extensions/efaidnbmnnnibpcajpcglclefindmkaj/26.11.1.0_0/dist/PreferencePage.js:generic-api-key:2` |
| 6 | `.temp/chrome-cdp/Default/Preferences` | 1 | `generic-api-key` | Chrome browser profile preferences (`Default/Preferences`) | `e638850f196b758736237b9119a40ee977586a39:.temp/chrome-cdp/Default/Preferences:generic-api-key:1` |
| 7 | `.temp/chrome-cdp/Default/Secure Preferences` *(hit #1)* | 1 | `generic-api-key` | Chrome browser secure preferences / extension & signin metadata (`Default/Secure Preferences`) | `e638850f196b758736237b9119a40ee977586a39:.temp/chrome-cdp/Default/Secure Preferences:generic-api-key:1` |
| 8 | `.temp/chrome-cdp/Default/Secure Preferences` *(hit #2)* | 1 | `generic-api-key` | Chrome browser secure preferences / extension & signin metadata (`Default/Secure Preferences`) | `e638850f196b758736237b9119a40ee977586a39:.temp/chrome-cdp/Default/Secure Preferences:generic-api-key:1` |
| 9 | `.temp/chrome-cdp/Default/Extensions/fheoggkfdfchfphceeifdbepaooicaho/8.2.0.1650_0/background.js` *(hit #1)* | 23 | `generic-api-key` | Chrome extension background script (`fheoggkfdfchfphceeifdbepaooicaho` — McAfee WebAdvisor) | `e638850f196b758736237b9119a40ee977586a39:.temp/chrome-cdp/Default/Extensions/fheoggkfdfchfphceeifdbepaooicaho/8.2.0.1650_0/background.js:generic-api-key:23` |
| 10 | `.temp/chrome-cdp/Default/Extensions/fheoggkfdfchfphceeifdbepaooicaho/8.2.0.1650_0/background.js` *(hit #2)* | 23 | `generic-api-key` | Chrome extension background script (`fheoggkfdfchfphceeifdbepaooicaho` — McAfee WebAdvisor) | `e638850f196b758736237b9119a40ee977586a39:.temp/chrome-cdp/Default/Extensions/fheoggkfdfchfphceeifdbepaooicaho/8.2.0.1650_0/background.js:generic-api-key:23` |
| 11 | `.temp/chrome-cdp/Default/Extensions/fheoggkfdfchfphceeifdbepaooicaho/8.2.0.1650_0/background.js` *(hit #3)* | 23 | `generic-api-key` | Chrome extension background script (`fheoggkfdfchfphceeifdbepaooicaho` — McAfee WebAdvisor) | `e638850f196b758736237b9119a40ee977586a39:.temp/chrome-cdp/Default/Extensions/fheoggkfdfchfphceeifdbepaooicaho/8.2.0.1650_0/background.js:generic-api-key:23` |

*Note on broader historical profile scope:* Beyond the 11 Gitleaks regex hits above, commit `e638850f` pushed `1,805` files under `.temp/chrome-cdp/` covering sensitive browser profile categories (browser cookies, session state, extension configuration, OAuth-related state, browser preferences, and cached authentication/profile data). All `1,805` paths must be purged together (`--path .temp/`).

### 3.2 Prevention & Tracking Checks

1. **`.gitignore` Verification:** Root [`.gitignore`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.gitignore#L138-L167) (Section 9) excludes `.temp/`, `**/.temp/`, `.temp/chrome-cdp/`, `chrome-cdp/`, `**/chrome-cdp/`, `chrome-profile/`, `.chrome-profile/`, `*chrome-user-data*/`, `.playwright/`, `playwright/.auth/`, and Chrome `Cookies*`, `Login Data*`, `Web Data*`, `History*`, `Local Storage/`, `Session Storage/`, `IndexedDB/`, `Sessions/`, `Sessions_Encrypted/`, `GCM Store/`, `Sync Data/`, `Secure Preferences`, and `Crashpad/`. Verified via `git check-ignore -v` matching `.gitignore:141:**/.temp/`.
2. **CI Tracked-Profile Guard:** [`.github/workflows/secret-scan.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/secret-scan.yml#L37-L43) fails the workflow (`exit 1`) if `git ls-files` matches `(^\.temp/|chrome-cdp|chrome-profile|Default/Network/Cookies|Default/Login Data)`.
3. **Current Tracked Files:** `git ls-files .temp/` = `0`; local CI-parity regex scan across all `2,848` tracked files = **`0` matches**.
4. **Local `.temp/` Preservation:** Local `.temp/chrome-cdp/` (`1,827` files on disk) remains untouched and untracked. Zero cookie, password, OAuth, or session values were inspected, exported, or copied.

### 3.3 Operator Action Plan (Browser & Account Session Review)

The repository owner / affected account holders must perform these manual steps:

1. **Review Google Account Device Activity:** Open `https://myaccount.google.com/device-activity` for every Google account used in or linked to the affected browser session (including `d.farm.expart@gmail.com` or developer accounts) and check all active/recent devices and sessions since `2026-11-19`.
2. **Review Third-Party App Access:** Open `https://myaccount.google.com/permissions` and audit OAuth grants and connected third-party apps; remove any unrecognized or unneeded access.
3. **Revoke Suspicious or Unrecognized Sessions:** Sign out and revoke any unfamiliar, stale, or shared Chrome/desktop sessions from Google Account security controls.
4. **Review Third-Party Credentials Used During Affected Sessions:** Rotate passwords, API tokens, or session keys for any third-party console or service accessed in `.temp/chrome-cdp/` (e.g., Supabase, Render, Cloudflare, GitHub, Gmail/SMTP app password, Dove SMS, Google Cloud).
5. **Review Organization-Specific Sessions (if relevant):** If any Google Workspace / organizational account was used, audit Workspace admin login audit logs and revoke organization-scoped session tokens as needed.
6. **Local Profile Disposal (Optional, Only After Operator Review):** Only after completing the external reviews above and confirming nothing needs preservation, manually delete local `.temp/chrome-cdp/` (bearing in mind standard Windows file deletion does not forensically wipe SSD wear-leveled blocks, which is why external revocation/rotation is mandatory).

---

## 4. Category 3 — `DF-SAN-2813` Historical Activation Token (`3` Findings)

### 4.1 Historical Exposure Inventory (No Token Value Printed)

| # | Rule ID | Commit SHA | Historical File Path | Line | Gitleaks Fingerprint |
|---:|---|---|---|---:|---|
| 1 | `generic-api-key` | `74f2596c3ec1dc9479c7de53280f5cbd9d941d94` | `apps/dfarm-super-admin/src/features/dairies/DairyActivationModal.tsx` | 85 | `74f2596c3ec1dc9479c7de53280f5cbd9d941d94:apps/dfarm-super-admin/src/features/dairies/DairyActivationModal.tsx:generic-api-key:85` |
| 2 | `generic-api-key` | `74f2596c3ec1dc9479c7de53280f5cbd9d941d94` | `apps/dfarm-super-admin/src/services/mockBackend.ts` | 1088 | `74f2596c3ec1dc9479c7de53280f5cbd9d941d94:apps/dfarm-super-admin/src/services/mockBackend.ts:generic-api-key:1088` |
| 3 | `generic-api-key` | `74f2596c3ec1dc9479c7de53280f5cbd9d941d94` | `apps/dfarm-super-admin/src/services/mockBackend.ts` | 1100 | `74f2596c3ec1dc9479c7de53280f5cbd9d941d94:apps/dfarm-super-admin/src/services/mockBackend.ts:generic-api-key:1100` |

- Safe in-memory comparison across all three historical lines in `74f2596c` confirmed they all referenced the **exact same 64-character hex string** (`TOKEN_ALL_EQUAL: True`, length `64`), associated with dairy code `DF-SAN-2813` / admin mobile `7507495615`.

### 4.2 Current-Tree & Backend Contract Verification Evidence

1. **Historical Token Absent in `HEAD`:** Byte-level scan of all `2,848` tracked files confirmed **`0` occurrences** of the historical 64-hex token (`HISTORICAL_TOKEN_IN_HEAD: 0`). [`DairyActivationModal.tsx`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/src/features/dairies/DairyActivationModal.tsx#L85) now clears state cleanly (`setRawToken('')`) on error.
2. **Active Mock Token Clearly Marked as Synthetic:** [`mockBackend.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/src/services/mockBackend.ts#L84-L85) defines:
   - `export const SYNTHETIC_DF_SAN_2813_MOCK_TOKEN = 'placeholder_df_san_2813_offline_mock_activation_token'`
   - Preceded by explicit comment: `// Synthetic offline-mock fallback token for DF-SAN-2813 (cannot authenticate to real backend DB)`
3. **Mock Token Cannot Be Accepted by Production Backend:**
   - In [`services/backend/src/presentation/routes/dairies.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/dairies.routes.ts#L53-L115), `findInvitation(rawToken)` requires a non-empty token, computes `sha256(token)`, and queries `dairy_admin_invitations WHERE token_hash = $1` (never falling back to `dairyCode`). [`InMemoryDairyStore.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/InMemoryDairyStore.ts) contains zero invitation tokens or `DF-SAN-2813` entries.
   - Real invitation tokens generated by the backend (`dairies.routes.ts`) are 256-bit `crypto.randomBytes(32).toString('hex')` strings; `'placeholder_df_san_2813_offline_mock_activation_token'` cannot match any persisted `token_hash` and is rejected (`404 INVALID_TOKEN` on `/invitations/validate`; `400` on `/invitations/otp/request` and `/invitations/activate`).
   - Neither `DairyActivationModal.tsx` nor `ActivationPage.tsx` embeds or transmits `SYNTHETIC_DF_SAN_2813_MOCK_TOKEN`. *(Note: Pre-existing `DF-026` offline client fallback in [`apps/dfarm-super-admin/src/api/client.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/src/api/client.ts#L483-L536) falls back locally to `mockBackend` in browser `localStorage` when the backend returns `404`/fails, which remains strictly local to the browser test/mock engine and is never accepted by the production backend.)*
4. **Activation Tests Use Synthetic Constant:**
   - [`apps/dfarm-super-admin/src/test/activationFlow.test.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/src/test/activationFlow.test.ts) uses `SYNTHETIC_DF_SAN_2813_MOCK_TOKEN` across its activation-flow assertions.
   - [`apps/dfarm-super-admin/src/test/dairyManagement.test.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/src/test/dairyManagement.test.ts#L207-L212) validates `SYNTHETIC_DF_SAN_2813_MOCK_TOKEN` for the `DF-SAN-2813` mock fallback scenario.
5. **Production Activation Contract Preserved:**
   - Production endpoints in [`dairies.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/dairies.routes.ts#L122-L480) (`GET /api/v1/dairies/invitations/validate`, `POST /api/v1/dairies/invitations/otp/request`, `POST /api/v1/dairies/invitations/activate`, `POST /api/v1/dairies/invitations/resend`) and frontend [`ActivationPage.tsx`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/apps/dfarm-super-admin/src/features/auth/ActivationPage.tsx) preserve the real SHA-256 `token_hash` + OTP verification contract (`dairy-activation-workflow.test.js` `13/13` PASS).

### 4.3 Operator Action Plan (`DF-SAN-2813` Invitation Verification)

The repository owner must verify the `DF-SAN-2813` dairy invitation through an **authorized Super Admin interface** or approved production governance workflow (without using the historical token and without automated DB queries from this task):

1. Sign in to the authorized Super Admin portal (`dfarm-super-admin`) with `SUPER_ADMIN` privileges and inspect dairy **`DF-SAN-2813`** (and any admin/invitation record associated with that dairy).
2. Determine the live invitation state:
   - Check invitation lifecycle status (`PENDING`, `DELIVERED`, `ACCEPTED` / `CONSUMED` in [`029_dairy_admin_activation_tokens.sql`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/029_dairy_admin_activation_tokens.sql#L25-L26) where `status` is `PENDING` | `DELIVERED` | `CONSUMED` | `EXPIRED` | `REVOKED` and `delivery_status` is `PENDING` | `ACCEPTED` | `DELIVERED` | `FAILED`).
3. **If the invitation is `PENDING` or `DELIVERED` (or if the historical token could still be valid):**
   - Immediately revoke the affected invitation and issue a fresh 256-bit invitation via the authorized Super Admin **Resend Invite** workflow (`POST /api/v1/dairies/invitations/resend`, which marks prior `PENDING` invitations `REVOKED` and generates a new 32-byte random token).
   - Verify the newly issued invitation works and the old invitation is `REVOKED` / rejected.
4. **If the invitation is already `ACCEPTED`/`CONSUMED`, `EXPIRED`, or `REVOKED` (or no matching invitation exists in production):**
   - Record the verified status and confirmation timestamp in the Operator Confirmation Register without storing any raw token.

---

## 5. Operator Confirmation Register

| Item | Required status |
|---|---|
| Google Maps key ownership identified | Pending operator |
| Historical Maps key reviewed | Pending operator |
| Replacement key configured | Pending operator |
| Historical Maps key revoked | Pending operator |
| Google Account sessions reviewed | Pending operator |
| Third-party access reviewed | Pending operator |
| DF-SAN-2813 invitation status verified | Pending operator |
| Old invitation revoked if necessary | Pending operator |
| New invitation verified if necessary | Pending operator |

*(No item may be marked complete without explicit operator-supplied evidence, and no raw credential may be entered into this register.)*

---

## 6. Git History Cleanup Readiness Audit

### 6.1 Complete Branch, Tag & Ref Inventory (Live Inspection)

#### Local Branches (`git branch -a`, `10` total)

| Local Branch | Current Commit SHA | Contains Affected History? | Cleanup Action |
|---|---|---|---|
| `fix/cloudflare-pages-production-deploy` *(checked out)* | `82b3feb95db13820bdeaf64b041109b71c640799` | **YES** (`c3b1a249`, `74f2596c`, `e638850f`, `5cca96c4`, `d3d21891`, `110b8997`) | **Rewrite & force-push** |
| `main` | `d62ba16eb4f8a65f158c089d42e3e78a5d984d50` | **YES** (`c3b1a249`, `74f2596c`, `e638850f`, `5cca96c4`, `d3d21891`, `110b8997`) | **Rewrite & force-push** |
| `feature/cloudflare-pages-deployment` | `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3` | **YES** (`c3b1a249`, `74f2596c`, `e638850f`, `5cca96c4`, `d3d21891`, `110b8997`) | **Rewrite & force-push** |
| `dfarm_customer_app_init` | `e638850f196b758736237b9119a40ee977586a39` | **YES** (`c3b1a249`, `74f2596c`, `e638850f`) | **Rewrite & force-push** |
| `backup/pre-sdk58-checkpoint` | `2d861ef74fc5a25502d20d0b4dd60e2302bd35ac` | No | Leave untouched |
| `remediation/dfarm-master-2026-11-14` | `2d861ef74fc5a25502d20d0b4dd60e2302bd35ac` | No | Leave untouched |
| `swarm-offline-db-38accde7` | `57e594da59dfa867651b9a435d694abac124be09` | No | Leave untouched |
| `dfarm_customer_mobile_app` | `6a3b890c619eced44c8f0b2242222737783aff7a` | No | Leave untouched |
| `stabilization/dfarm-two-app-stability` | `6a3b890c619eced44c8f0b2242222737783aff7a` | No | Leave untouched |
| `upgrade/expo-sdk58-migration` | `6a3b890c619eced44c8f0b2242222737783aff7a` | No | Leave untouched |

#### Remote Branches (`git ls-remote --heads origin`, `4` live remote branches — ALL `4` affected)

| Remote Branch (`origin`) | Live Remote SHA | Contains Affected History? |
|---|---|---|
| `refs/heads/fix/cloudflare-pages-production-deploy` | `82b3feb95db13820bdeaf64b041109b71c640799` | **YES** (`c3b1a249`, `74f2596c`, `e638850f`, `5cca96c4`, `d3d21891`, `110b8997`) |
| `refs/heads/main` | `d62ba16eb4f8a65f158c089d42e3e78a5d984d50` | **YES** (`c3b1a249`, `74f2596c`, `e638850f`, `5cca96c4`, `d3d21891`, `110b8997`) |
| `refs/heads/feature/cloudflare-pages-deployment` | `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3` | **YES** (`c3b1a249`, `74f2596c`, `e638850f`, `5cca96c4`, `d3d21891`, `110b8997`) |
| `refs/heads/dfarm_customer_app_init` | `e638850f196b758736237b9119a40ee977586a39` | **YES** (`c3b1a249`, `74f2596c`, `e638850f`) |

*(Note: Local tracking ref `refs/remotes/origin/upgrade/expo-sdk58-migration` at `6a3b890c619eced44c8f0b2242222737783aff7a` is stale and absent on live `origin`.)*

#### Tags (`git tag -l` & `git ls-remote --tags origin`)

- **`0` tags** locally and **`0` tags** on `origin`.

#### GitHub Pull Request Refs (`git ls-remote origin` — `8` Read-Only Refs, ALL `8` Affected)

Direct `git merge-base --is-ancestor` verification proved that **all 8 GitHub PR head refs** retain affected historical commits and cannot be removed via ordinary branch cleanup or `--force-with-lease`:

| PR Ref (`origin`) | PR Head SHA | Affected Ancestor Commits Verified |
|---|---|---|
| `refs/pull/1/head` | `5cca96c4a614e264fca777ec4153b0486a4d4f9a` | `74f2596c`, `c3b1a249`, `e638850f`, `5cca96c4` |
| `refs/pull/2/head` | `cbeb426c4b88032637275d535ec2e99c2d4364b8` | `74f2596c`, `c3b1a249`, `e638850f`, `5cca96c4` |
| `refs/pull/3/head` | `7fb85d497c8b0afe637a6e120d4898aa271a52cc` | `74f2596c`, `c3b1a249`, `e638850f`, `5cca96c4`, `110b8997` |
| `refs/pull/4/head` | `66ee7d3b975e1c24ebe6e5955827a371923f0c93` | `74f2596c`, `c3b1a249`, `e638850f`, `5cca96c4`, `110b8997` |
| `refs/pull/5/head` | `b2cdd08f8be9d9c02fbe1d4d81cf5971a4bbe0db` | `74f2596c`, `c3b1a249`, `e638850f`, `5cca96c4`, `d3d21891`, `110b8997` |
| `refs/pull/6/head` | `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3` | `74f2596c`, `c3b1a249`, `e638850f`, `5cca96c4`, `d3d21891`, `110b8997` |
| `refs/pull/7/head` | `3fff970b372dcae74ddafd2bc3e60614142762de` | `74f2596c`, `c3b1a249`, `e638850f`, `5cca96c4`, `d3d21891`, `110b8997` |
| `refs/pull/8/head` | `53d23448b5cd835e22d32b420a74f509b889c608` | `74f2596c`, `c3b1a249`, `e638850f`, `5cca96c4`, `d3d21891`, `110b8997` |

### 6.2 Existing Audit Mirror, Backups & Tooling Assessment

- **Separate Audit Mirror & Backup Availability:**
  - `C:\Users\panka\.gemini\antigravity\brain\e6c389d6-c511-4413-9bab-098685347c70\scratch\` holds an older `dfarm-audit-mirror.git`, `dfarm-orig-mirror.git`, and `dfarm-pre-rewrite-backup.bundle` (`117,155,617` bytes) from the earlier `FIX-02.2` run (`c84ab216` baseline).
  - **CRITICAL:** Both that audit mirror and backup bundle are **stale** (missing all commits after `c84ab216` up through `82b3feb9`, and the earlier `FIX-02.2` rewrite did **not** scrub the `74f2596c` `DF-SAN-2813` activation token). They must **not** be force-pushed to `origin`.
- **Tooling Readiness:**
  - `git-filter-repo` is **not currently installed** (`python -m git_filter_repo --version` failed with `No module named git_filter_repo`). The operator must install `git-filter-repo` (`python -m pip install --user git-filter-repo`) before executing the history rewrite.
  - This worktree is a full non-shallow clone (`git rev-parse --is-shallow-repository` = `false`, `56` commits on `HEAD`, `64` commits across `--all`).
- **Collaborator & Worktree Considerations:**
  - Three local worktrees exist on this host:
    1. `C:/Users/panka/OneDrive/Desktop/DFarm` (`stabilization/dfarm-two-app-stability`, `6a3b890`)
    2. `C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init` (`fix/cloudflare-pages-production-deploy`, `82b3feb`)
    3. `C:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_mobile_app` (`dfarm_customer_mobile_app`, `6a3b890`)
  - Any collaborator, CI runner, or local worktree holding clones of `main`, `fix/cloudflare-pages-production-deploy`, `feature/cloudflare-pages-deployment`, or `dfarm_customer_app_init` must **freeze pushes** during the rewrite and **re-clone fresh** afterward (never `git pull` or `git merge` old history).

### 6.3 Proposed Git History Cleanup Plan (`git-filter-repo` — DO NOT EXECUTE WITHOUT APPROVAL)

> [!CAUTION]
> **Two Distinct Security Requirements:**
> - **Credential rotation/revocation** makes previously exposed credentials unusable against live systems/accounts.
> - **Repository history rewrite** removes exposed blobs/strings from rewritten reachable Git history.
> Completing one does **not** replace the other. Credential rotation/revocation and `DF-SAN-2813` verification **must** occur before publishing rewritten history.

1. **Tool Required:** Yes — this cleanup **requires `git-filter-repo`** (combining `--invert-paths` for `.temp/` removal with `--replace-text` for scrubbing the exposed Google Maps key and historical `DF-SAN-2813` token across historical blobs).
2. **Paths & Strings to Remove / Sanitize:**
   - **Paths removed from all historical commits:** `.temp/` (eliminating all `1,805` `.temp/chrome-cdp/**` blobs including the `11` Gitleaks hits in `e638850f`, plus `.temp/*.png` in `5cca96c4` / `d3d21891`).
   - **Literals sanitized via local `--replace-text` mapping file (stored outside the repo, never committed, securely deleted after verification):**
     - Historical 39-character Google Maps key (from `110b8997` & `c3b1a249`) `==>` `AIzaSyYourActualGoogleMapsApiKeyPlaceholder`
     - Historical 64-character hex `DF-SAN-2813` activation token (from `74f2596c`) `==>` `placeholder_df_san_2813_offline_mock_activation_token`
3. **Important `.gitleaksignore` Post-Rewrite Consideration (Verified via Commit Ancestry):**
   - Commits `e638850f`, `e0428359`, and `c67dbb94` are descendants of `74f2596c` and `c3b1a249`. When `git-filter-repo` rewrites `74f2596c`/`c3b1a249`/`e638850f`, all descending commit SHAs **change**.
   - Consequently, `14` of the `25` entries in [`.gitleaksignore`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.gitleaksignore) (for `c67dbb94`, `e0428359`, and `e638850f`) will have old commit SHAs that no longer match the rewritten history, while the `11` entries for `57777593` and `6a3b890c` (ancestors of `74f2596c`) retain their SHAs unless also rewritten.
   - **Operator Choice at Execution Time:** Either (a) refresh those `14` `.gitleaksignore` fingerprints to the newly generated rewritten commit SHAs in a clean follow-up commit on the rewritten branch, **or** (b) include deterministic replacements for those `14` historical synthetic test/doc strings in `replace-secrets.txt` and remove their `.gitleaksignore` lines afterward (leaving `57777593`/`6a3b890c` or cleaning them consistently across `HEAD`). Verify `gitleaks detect` exits `0` before pushing.
4. **Backup & Recovery Steps (Outside Repository):**
   - Ensure local uncommitted/staged edits (including this plan) are committed or saved cleanly before rewriting.
   - Create a fresh bare mirror clone and encrypted offline bundle **outside** the repository:
     ```powershell
     mkdir "$HOME\dfarm-gitleaks02-cleanup" -Force
     Set-Location "$HOME\dfarm-gitleaks02-cleanup"
     git clone --mirror https://github.com/Swiftify0099/DFarm.git dfarm-fresh-mirror.git
     git -C dfarm-fresh-mirror.git bundle create dfarm-pre-rewrite-backup-20261128.bundle --all
     git bundle verify dfarm-pre-rewrite-backup-20261128.bundle
     ```
   - Encrypt `dfarm-pre-rewrite-backup-20261128.bundle` into an encrypted archive/volume (e.g., AES-256 7-Zip `-mhe=on` or BitLocker/VeraCrypt on Windows) before proceeding; retain only until post-rewrite verification is signed off, then securely purge.
5. **Isolated Rewrite Execution (Operator-Approved Only):**
   ```powershell
   # Populate replace-secrets.txt locally from git show (never print or commit)
   git -C dfarm-fresh-mirror.git filter-repo `
     --invert-paths `
     --path .temp/ `
     --replace-text "$HOME\dfarm-gitleaks02-cleanup\replace-secrets.txt" `
     --force
   ```
6. **Pre-Push Verification on Rewritten Mirror:**
   - Verify `git fsck --full --no-dangling`, `0` `.temp/` paths across `git rev-list --objects --all`, `0` hits for both historical secrets across `git log --all -S`, and run `gitleaks detect` on a local clone of the rewritten mirror.
7. **Remote Synchronization (Explicit Branch-Only `--force-with-lease` — NEVER `--mirror`):**
   - Verify no remote branch moved since this baseline, then push **only** the `4` affected remote branches with explicit expected-old-SHA leases (after owner approval):
     - `refs/heads/main`: expected old SHA `d62ba16eb4f8a65f158c089d42e3e78a5d984d50`
     - `refs/heads/fix/cloudflare-pages-production-deploy`: expected old SHA `82b3feb95db13820bdeaf64b041109b71c640799` *(or latest pre-rewrite pushed HEAD if new commits are pushed first)*
     - `refs/heads/feature/cloudflare-pages-deployment`: expected old SHA `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3`
     - `refs/heads/dfarm_customer_app_init`: expected old SHA `e638850f196b758736237b9119a40ee977586a39`
8. **GitHub PR Refs, Cache Purge & Collaborator Re-Clone:**
   - Because `refs/pull/1/head` through `refs/pull/8/head` are read-only GitHub PR refs and cannot be purged with `--force-with-lease`, submit a GitHub Support cache/PR-ref purge ticket (`https://support.github.com/contact`) for `Swiftify0099/DFarm` covering `refs/pull/1..8/head` and cached commit/blob views (`74f2596c`, `c3b1a249`, `e638850f`, `5cca96c4`, `d3d21891`, `110b8997`).
   - Do **not** claim GitHub caches or forks are purged until GitHub Support confirms completion.
   - Notify all collaborators and reset/re-clone all local worktrees fresh from the rewritten remote.

### 6.4 Required Owner Approvals Before Execution

1. Signed-off confirmation of all `9` items in the **Operator Confirmation Register** (Section 5).
2. Explicit repository owner authorization to **freeze pushes** across `Swiftify0099/DFarm`.
3. Explicit repository owner authorization to **execute `git-filter-repo` and `--force-with-lease` pushes** on the `4` affected branches.
4. Explicit operator action to submit the **GitHub Support PR-ref & cache purge request** (`refs/pull/1..8/head`).

---

## 7. Gitleaks Configuration & Scanner Verification (`v8.21.2`)

Verified directly against [`.gitleaks.toml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.gitleaks.toml), [`.gitleaksignore`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.gitleaksignore), and [`.github/workflows/secret-scan.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/secret-scan.yml):

- **Gitleaks Enabled in CI:** Yes (`Secret Scanning (Gitleaks)`, `v8.21.2`, runs on `push` to `main`, `fix/cloudflare-pages-production-deploy`, `feature/**` and `pull_request` to `main`, `fix/cloudflare-pages-production-deploy`).
- **Full-History Scanning Enabled:** Yes (`actions/checkout@v4` with `fetch-depth: 0`).
- **`.gitleaksignore` Fingerprint Scope:** Exactly **`25`** historical synthetic/placeholder fingerprints (`1` in `c67dbb94`, `9` in `e0428359`, `4` in `e638850f`, `1` in `6a3b890c`, `10` in `57777593`), all verified remediated in `HEAD`. Zero active credentials are in `.gitleaksignore`.
- **`.gitleaks.toml` Allowlist Scope:** `useDefault = true`, `5` explicit placeholder regexes in `[allowlist]`, and `9` narrow `[[rules.allowlists]]` blocks (`condition = "AND"` requiring exact path regex + exact non-secret line regex) covering the `13` verified false positives. Zero broad directory exclusions (`services/`, `packages/`, `apps/`, `.env.example`, etc.) exist.
- **Disposable Synthetic Canary Detection Results (Isolated Temp Copy, Cleaned Up Immediately):**
  - Generic API key canary (`CANARY_DISPOSABLE.env`): **DETECTED (`EXIT=1`, `leaks found: 1`)**
  - Exact 39-char `AIzaSy...` GCP key canary appended to copy of `apps/dfarm-super-admin/.env.example`: **DETECTED (`EXIT=1`, `leaks found: 1`)**
  - High-entropy `generic-api-key` canary appended to copy of allowlisted `Aes256GcmBiometricEncryptor.ts`: **DETECTED (`EXIT=1`, `leaks found: 1`)**
  - Synthetic RSA `private-key` PEM canary: **DETECTED (`EXIT=1`, `leaks found: 1`)**

---

## 8. Regression & Build Verification Evidence (`2026-11-28`)

All backend tests ran in strict offline isolation (`NODE_ENV=test`, closed dummy PG port `127.0.0.1:59999`, `SUPABASE_URL=http://127.0.0.1:59998`, synthetic Supabase test keys, `TENANT_POOL_CONNECTION_TIMEOUT_MS=500`). Zero production databases or migrations were accessed.

| Command / Suite | Scope | Result | Observed Details |
|---|---|---|---|
| `npm run build --workspace=apps/dfarm-super-admin` | `tsc -b && vite build` | **PASS (`EXIT=0`)** | `2663 modules transformed`; built in `5.06s` |
| `npm run test --workspace=apps/dfarm-super-admin` | Vitest (`10` files) | **PASS (`48/48`, `EXIT=0`)** | Includes `activationFlow.test.ts` (`4/4`) and `dairyManagement.test.ts` (`9/9`) |
| `npm run build:backend` | `shared-types`, `shared-validation`, `database`, `backend` (`tsc`) | **PASS (`EXIT=0`)** | Clean compilation across all 4 workspaces |
| `npm run db:validate` | `schema-validation.test.js` + `migration-catalog.test.js` | **PASS (`25/25`, `EXIT=0`)** | `12/12` catalog/quarantine/040 + `13/13` static SQL checks |
| `npm run db:test` | `packages/database` (`pg-mem` + static; Real PG suite `# SKIP`) | **PASS (`34` pass, `0` fail, `EXIT=0`)** | Real PG RLS suite skipped cleanly (`# SKIP`, no local PG17) |
| Offline backend activation & dairy management suites (`clean-architecture`, `dairy-activation-workflow`, `dairy-location`, `super-admin-production`) | Node test runner (`pg-mem` offline mode) | **PASS (`63/63`, `EXIT=0`)** | `clean-architecture` (`8/8` subtests), `dairy-activation-workflow` (`13/13`), `dairy-location` (`8/8`), `super-admin-production` (`26/26` across `7` sections) |

---

## 9. Exact Post-Remediation Validation Commands

Execute these validation commands **after** operator credential rotations, approved `git-filter-repo` history cleanup, force-push, and fresh re-clone:

```bash
# 1. Verify fresh rewritten clone has zero .temp/ objects and zero historical secrets
git rev-list --objects --all | grep -E '(^|/)\.temp(/|$)|chrome-cdp'
git log --all --oneline -- .temp/

# 2. Run full-history Gitleaks scan (must return 0 leaks and EXIT=0)
gitleaks detect --source . --config .gitleaks.toml --verbose --redact=100

# 3. Verify CI tracked browser-profile guard (must return empty)
git ls-files | grep -E '(^\.temp/|chrome-cdp|chrome-profile|Default/Network/Cookies|Default/Login Data)'

# 4. Run build & regression verification gates
npm run build --workspace=apps/dfarm-super-admin
npm run test --workspace=apps/dfarm-super-admin
npm run build:backend
npm run db:validate
npm run db:test
```

And confirm via GitHub Actions on the rewritten `fix/cloudflare-pages-production-deploy` / `main` branches:
- **Secret Scanning (Gitleaks)** workflow passes with **`0` findings**.

---

## 10. Remaining Risks & Open Blockers

1. **Unrotated External Exposure (`DF-003` — P0):** Until the operator completes GCP Console revocation/replacement for the historical Maps key, reviews Google Account sessions/third-party grants for `.temp/chrome-cdp/`, and confirms `DF-SAN-2813` invitation state, previously exposed credentials/sessions remain an external risk.
2. **Public Git History & GitHub PR Ref Exposure:** Commits `74f2596c`, `c3b1a249`, `e638850f`, `5cca96c4`, `d3d21891`, and `110b8997` remain reachable on all `4` remote branches and all `8` PR refs (`refs/pull/1..8/head`) until the owner-approved `git-filter-repo` rewrite, branch force-push, and GitHub Support PR-ref/cache purge complete.
3. **Local Untracked `.env` & `dist/` Rebuild Requirement:** Local untracked `.env` / `apps/dfarm-super-admin/.env` still holds an unrotated `VITE_GOOGLE_MAPS_API_KEY`; any local `vite build` bundles that key into untracked `apps/dfarm-super-admin/dist/`. Replace local `.env` and rebuild immediately upon key rotation.
4. **Post-Rewrite `.gitleaksignore` SHA Refresh:** Rewriting `74f2596c`/`c3b1a249`/`e638850f` changes commit SHAs of `e638850f`, `e0428359`, and `c67dbb94`, requiring either updated SHAs in `.gitleaksignore` or scrubbing those `14` historical synthetic fixtures during cleanup.
5. **Pre-Existing Super Admin `client.ts` Fallback (`DF-026`):** Untouched outside `GITLEAKS-02` scope; `apiClient` falls back locally to `mockBackend` on network/404 failure (browser-local only; cannot authenticate to production backend).
