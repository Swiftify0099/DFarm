# DFarm FIX-02 — Git History Rewrite & Remote Remediation Plan

**Repository:** `Swiftify0099/DFarm`  
**Status:** `READY FOR HUMAN HISTORY-REWRITE APPROVAL` (No remote force-push executed)  
**Target Tool:** `git-filter-repo` (preferred)

---

## 1. Why History Rewrite Is Mandatory

Removing `.temp/chrome-cdp/` (1,805 files, ~113.16 MiB) and `.temp/*.png` (2 files, ~193 KiB) from `HEAD` does not delete historical blobs from `Swiftify0099/DFarm`. Additionally, a real **Google Maps JavaScript API Key** (`AIzaSyCZ***` — redacted) was committed in historical blobs of `docs/cleanup/EXTERNAL_INTEGRATION_VERIFICATION.md` and `apps/dfarm-super-admin/.env.example`.

---

## 2. Exact Historical Commit & Ref Scope (All 15 Refs Inventoried)

### Commits Containing `.temp/`
- `e638850f196b758736237b9119a40ee977586a39` (`2026-11-19 19:31:59 +0530`) — introduced `.temp/chrome-cdp/**` (1,805 files)
- `5cca96c4a614e264fca777ec4153b0486a4d4f9a` (`2026-11-21 11:31:12 +0530`) — introduced `.temp/android_runtime_screen.png` & `.temp/emulator_screen.png` (2 files)
- `d3d21891292c578bb8ec77221b6768c2fc67356e` (`2026-11-21 11:50:59 +0530`) — Merge pull request #1 carrying `.temp/`

### Commits Containing Exposed Google Maps API Key (`AIzaSyCZ***`)
- `c3b1a2491666082569d1bf806aec060d0cd626fc` (`2026-11-17 08:07:34 +0530`) — `docs/cleanup/EXTERNAL_INTEGRATION_VERIFICATION.md`
- `110b899711ca68ca94cc75a256fc5f410f412431` (`2026-11-21 13:07:34 +0530`) — `apps/dfarm-super-admin/.env.example`

### Tags
- None (`git tag -l` is empty).

### Complete 15-Ref Mapping (Original Bundle vs Isolated Rewritten Audit Mirror)

> **Note:** Rewritten commit SHAs below come from the isolated `git filter-branch` audit verification run. When running `git-filter-repo` during the approved execution, verify the resulting rewritten SHAs before running `--force-with-lease`.

| Ref | Old Commit SHA | Rewritten Commit SHA (Audit Mirror) | Affected Paths | Secret Removed | Verification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `refs/heads/backup/pre-sdk58-checkpoint` | `2d861ef74fc5a25502d20d0b4dd60e2302bd35ac` | `2d861ef74fc5a25502d20d0b4dd60e2302bd35ac` (unchanged) | None | N/A | `0` `.temp`, `0` key hits |
| `refs/heads/dfarm_customer_app_init` | `e638850f196b758736237b9119a40ee977586a39` | `57883fa5f1321e3ba2b54252fe43e1d1d71a9890` | `.temp/chrome-cdp/**` (1,805), `EXTERNAL_INTEGRATION_VERIFICATION.md` | Yes (`AIzaSyCZ***`) | `0` `.temp`, `0` key hits |
| `refs/heads/dfarm_customer_mobile_app` | `6a3b890c619eced44c8f0b2242222737783aff7a` | `6a3b890c619eced44c8f0b2242222737783aff7a` (unchanged) | None | N/A | `0` `.temp`, `0` key hits |
| `refs/heads/feature/cloudflare-pages-deployment` | `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3` | `7a9c10be01f2348188a1638358eb591ec81307fc` | `.temp/**` (1,807), `.env.example`, `EXTERNAL_INTEGRATION_VERIFICATION.md` | Yes (`AIzaSyCZ***`) | `0` `.temp`, `0` key hits |
| `refs/heads/fix/cloudflare-pages-production-deploy` | `c84ab2160be5b26489761e527bf992d1b22036b9` | `6910e1df9ebd6d77560a37c4214658f3d893519b` | `.temp/**` (1,807), `.env.example`, `EXTERNAL_INTEGRATION_VERIFICATION.md` | Yes (`AIzaSyCZ***`) | `0` `.temp`, `0` key hits |
| `refs/heads/main` | `d62ba16eb4f8a65f158c089d42e3e78a5d984d50` | `e732a566760732f40e2cfbf111a4a81b2b3beb91` | `.temp/**` (1,807), `.env.example`, `EXTERNAL_INTEGRATION_VERIFICATION.md` | Yes (`AIzaSyCZ***`) | `0` `.temp`, `0` key hits |
| `refs/heads/remediation/dfarm-master-2026-11-14` | `2d861ef74fc5a25502d20d0b4dd60e2302bd35ac` | `2d861ef74fc5a25502d20d0b4dd60e2302bd35ac` (unchanged) | None | N/A | `0` `.temp`, `0` key hits |
| `refs/heads/stabilization/dfarm-two-app-stability` | `6a3b890c619eced44c8f0b2242222737783aff7a` | `6a3b890c619eced44c8f0b2242222737783aff7a` (unchanged) | None | N/A | `0` `.temp`, `0` key hits |
| `refs/heads/swarm-offline-db-38accde7` | `57e594da59dfa867651b9a435d694abac124be09` | `57e594da59dfa867651b9a435d694abac124be09` (unchanged) | None | N/A | `0` `.temp`, `0` key hits |
| `refs/heads/upgrade/expo-sdk58-migration` | `6a3b890c619eced44c8f0b2242222737783aff7a` | `6a3b890c619eced44c8f0b2242222737783aff7a` (unchanged) | None | N/A | `0` `.temp`, `0` key hits |
| `refs/remotes/origin/dfarm_customer_app_init` | `e638850f196b758736237b9119a40ee977586a39` | `57883fa5f1321e3ba2b54252fe43e1d1d71a9890` | `.temp/chrome-cdp/**` (1,805), `EXTERNAL_INTEGRATION_VERIFICATION.md` | Yes (`AIzaSyCZ***`) | `0` `.temp`, `0` key hits |
| `refs/remotes/origin/feature/cloudflare-pages-deployment` | `9cd42bc9a43d55e8772af9edd121d8dbb64b05e3` | `7a9c10be01f2348188a1638358eb591ec81307fc` | `.temp/**` (1,807), `.env.example`, `EXTERNAL_INTEGRATION_VERIFICATION.md` | Yes (`AIzaSyCZ***`) | `0` `.temp`, `0` key hits |
| `refs/remotes/origin/fix/cloudflare-pages-production-deploy` | `c84ab2160be5b26489761e527bf992d1b22036b9` | `6910e1df9ebd6d77560a37c4214658f3d893519b` | `.temp/**` (1,807), `.env.example`, `EXTERNAL_INTEGRATION_VERIFICATION.md` | Yes (`AIzaSyCZ***`) | `0` `.temp`, `0` key hits |
| `refs/remotes/origin/main` | `d62ba16eb4f8a65f158c089d42e3e78a5d984d50` | `e732a566760732f40e2cfbf111a4a81b2b3beb91` | `.temp/**` (1,807), `.env.example`, `EXTERNAL_INTEGRATION_VERIFICATION.md` | Yes (`AIzaSyCZ***`) | `0` `.temp`, `0` key hits |
| `refs/remotes/origin/upgrade/expo-sdk58-migration` | `6a3b890c619eced44c8f0b2242222737783aff7a` | `6a3b890c619eced44c8f0b2242222737783aff7a` (unchanged) | None | N/A | `0` `.temp`, `0` key hits |

---

## 3. Prerequisites Before Executing Rewrite

1. **Rotate compromised credentials first** (Google Maps API key, plus verify/revoke active Google/OAuth and dashboard sessions).
2. **Freeze pushes** from all collaborators and CI jobs on `Swiftify0099/DFarm`.
3. **Commit or preserve current local work** (`fix/cloudflare-pages-production-deploy` uncommitted FIX-01.1 + FIX-02/02.1 changes) before switching/re-cloning.
4. **Install `git-filter-repo` and `gitleaks`** locally:
   ```bash
   python -m pip install --user git-filter-repo
   ```

---

## 4. Exact Offline Backup & History Rewrite Commands (Awaiting Human Approval)

Execute from a clean directory **OUTSIDE the public repository**:

### Step 1 — Create Encrypted/Restricted Offline Backup & Mirror Clone
```bash
mkdir -p ~/dfarm-fix02-remediation && cd ~/dfarm-fix02-remediation
git clone --mirror https://github.com/Swiftify0099/DFarm.git dfarm-mirror.git
git -C dfarm-mirror.git bundle create dfarm-pre-rewrite-backup.bundle --all
chmod 600 dfarm-pre-rewrite-backup.bundle
```

### Step 2 — Prepare Targeted Secret Replacement File
Create `~/dfarm-fix02-remediation/replace-secrets.txt` containing the exact exposed Google Maps key (read locally via `git show 35c530fcfdba` — never commit this file):
```text
<EXPOSED_GOOGLE_MAPS_API_KEY>==>AIzaSyYourActualGoogleMapsApiKeyPlaceholder
```

### Step 3 — Rewrite History with `git-filter-repo`
```bash
cd ~/dfarm-fix02-remediation/dfarm-mirror.git

git filter-repo \
  --invert-paths \
  --path .temp/ \
  --replace-text ../replace-secrets.txt \
  --force
```

### Step 4 — Verify Rewritten Mirror Before Pushing
```bash
git rev-list --objects --all | grep -E '(^|/)\.temp(/|$)|chrome-cdp' || echo "CLEAN: 0 .temp objects"
git log --all -S "<EXPOSED_GOOGLE_MAPS_API_KEY>" --oneline || echo "CLEAN: key absent"

git clone file://$(pwd) ../dfarm-rewritten-verify
gitleaks detect --source ../dfarm-rewritten-verify --config ../dfarm-rewritten-verify/.gitleaks.toml --verbose --redact
```

### Step 5 — Explicit Branch-Only Force-Push (NEVER Use `git push --mirror`)

Do **NOT** run `git push --mirror` (which could accidentally push/delete unintended refs). Push **only** the 4 affected remote branches using `--force-with-lease` pinned to their exact pre-rewrite SHAs:

```bash
cd ~/dfarm-fix02-remediation/dfarm-mirror.git
git remote add origin https://github.com/Swiftify0099/DFarm.git

git push origin --force-with-lease=refs/heads/main:d62ba16eb4f8a65f158c089d42e3e78a5d984d50 refs/heads/main:refs/heads/main
git push origin --force-with-lease=refs/heads/fix/cloudflare-pages-production-deploy:c84ab2160be5b26489761e527bf992d1b22036b9 refs/heads/fix/cloudflare-pages-production-deploy:refs/heads/fix/cloudflare-pages-production-deploy
git push origin --force-with-lease=refs/heads/feature/cloudflare-pages-deployment:9cd42bc9a43d55e8772af9edd121d8dbb64b05e3 refs/heads/feature/cloudflare-pages-deployment:refs/heads/feature/cloudflare-pages-deployment
git push origin --force-with-lease=refs/heads/dfarm_customer_app_init:e638850f196b758736237b9119a40ee977586a39 refs/heads/dfarm_customer_app_init:refs/heads/dfarm_customer_app_init
```

*(Note: After pushing the rewritten branches, push the pending FIX-01.1 / FIX-02 / FIX-02.1 commit onto `fix/cloudflare-pages-production-deploy` from a clean clone/rebased worktree.)*

---

## 5. GitHub Cache, Pull Request & Fork Cleanup Steps

1. Contact **GitHub Support** ([https://support.github.com/contact](https://support.github.com/contact)) referencing `Swiftify0099/DFarm` to purge cached commit views and PR refs (`refs/pull/*/head` for PRs #1, #5, #6, #7, #8) containing `e638850f196b758736237b9119a40ee977586a39`, `5cca96c4a614e264fca777ec4153b0486a4d4f9a`, `c3b1a2491666082569d1bf806aec060d0cd626fc`, `110b899711ca68ca94cc75a256fc5f410f412431`.
2. Verify no public forks retain old commits; instruct all collaborators to delete old clones and re-clone fresh.
3. Securely delete `replace-secrets.txt` and retain `dfarm-pre-rewrite-backup.bundle` only in restricted encrypted offline storage until post-rewrite verification is signed off, then securely purge it.
