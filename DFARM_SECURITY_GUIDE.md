# DFarm Security Guide — Browser Automation, Secrets & Git Hygiene

## 1. Purpose
This guide establishes mandatory repository security practices for the `Swiftify0099/DFarm` monorepo following **FIX-02 / FIX-02.1**.

---

## 2. Sensitive Files That Must Never Be Committed

Never stage or commit any of the following to Git:
- **Browser profiles & CDP directories**: `.temp/`, `.temp/chrome-cdp/`, `chrome-cdp/`, `chrome-profile/`, `*chrome-user-data*/`
- **Browser session artifacts**: `Cookies`, `Login Data`, `Web Data`, `History`, `Local Storage`, `Session Storage`, `IndexedDB`, `Sessions/`, `Sessions_Encrypted/`, `GCM Store/`, `Sync Data/`, `Local State`, `Secure Preferences`
- **Environment files**: `.env`, `.env.local`, `.env.production`, `.env.*.local` (commit only `.env.example` with non-functional placeholders)
- **Cryptographic & cloud credentials**: `*.pem`, `*.key`, `*.p12`, `*.jks`, `*.keystore`, `id_rsa`, Firebase service account JSONs, Supabase `service_role` keys, PostgreSQL URIs with real passwords, Render/Cloudflare/Cloudinary/Dove SMS/Google Maps real API keys, SMTP app passwords
- **Database backups & Playwright auth state**: `*.dump`, `*.sql.bak`, `supabase/backup*.sql`, `.playwright/`, `playwright/.auth/`

---

## 3. Safe Chrome / CDP Automation Directory Location

When running Playwright, Puppeteer, or Chrome DevTools Protocol (`--user-data-dir`) tests or manual debugging:

1. **Always store browser profiles outside the Git repository** using the OS temporary directory:
   - **Node.js (recommended)**:
     ```js
     import os from 'node:os';
     import path from 'node:path';
     const userDataDir = path.join(os.tmpdir(), `dfarm-chrome-cdp-${Date.now()}`);
     ```
   - **Windows PowerShell**:
     ```powershell
     chrome.exe --remote-debugging-port=9222 --user-data-dir="$env:TEMP\dfarm-chrome-cdp"
     ```
   - **macOS / Linux**:
     ```bash
     google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/dfarm-chrome-cdp"
     ```
2. **Always clean up temporary profile directories** in a `finally` block after automated tests finish.
3. **Never authenticate personal or production accounts** (Google, GitHub, Render, Cloudflare, Supabase) inside a Chrome profile used for local repo testing.
4. **Local profile disposal caveat**: Standard Windows deletion (`Remove-Item` / Recycle Bin) does not guarantee forensic erasure on SSD storage due to wear-leveling; never store production secrets inside local test profiles.

---

## 4. `.gitignore` Protection Rules

The root `.gitignore` ignores `.env`, `.env.*` (`!.env.example`), cryptographic keys, `.temp/`, `**/.temp/`, Chrome profile directories, `.playwright/`, and scoped Chrome session/cookie/storage paths. Always inspect `git status --short` and `git diff --cached --name-only` before committing; never run blind `git add .`.

---

## 5. Secret Scanning Instructions

### Automated CI Scanning
The workflow `.github/workflows/secret-scan.yml` runs on pushes and pull requests to:
1. Execute `gitleaks detect --source . --config .gitleaks.toml --verbose --redact` across full Git history (`fetch-depth: 0`).
2. Fail the build if any `.temp/`, `chrome-cdp`, `chrome-profile`, `Cookies`, or `Login Data` path is tracked in Git.

### Allowlist Policy (`.gitleaks.toml`)
`.gitleaks.toml` must **never** suppress entire files (such as `.env.example`) by path, because real keys accidentally placed in `.env.example` must still trigger scanner failures. Only explicit non-secret demo/placeholder regexes (`supabase-demo`, `ba9dcdcdfcXX`, `placeholder_*`, `AIzaSyYourActual*`) are allowlisted.

### Local Gitleaks Installation & Execution
- **Windows (winget / scoop / binary):**
  ```powershell
  winget install Gitleaks.Gitleaks
  gitleaks detect --source . --config .gitleaks.toml --verbose --redact
  gitleaks protect --staged --config .gitleaks.toml --verbose --redact
  ```
- **macOS (Homebrew):**
  ```bash
  brew install gitleaks
  ```

---

## 6. Offline Backup & Incident Response Steps

1. **Assume compromise immediately** if a secret or browser profile was pushed to a public repository.
2. **Revoke & rotate credentials first** (Google/OAuth active sessions, Google Maps API keys, Supabase keys, Render/Cloudflare tokens, DB passwords, SMTP passwords, SMS keys).
3. **Remove from current branch tracking** (`git rm -r --cached <path>`) and add to `.gitignore`.
4. **Create an offline backup bundle** outside the repository (`git bundle create ../backup.bundle --all`), stored in an **encrypted, access-restricted directory** (e.g., BitLocker/VeraCrypt volume or encrypted archive on Windows Home where NTFS EFS is unavailable). Never copy the backup into the repo or attach it to GitHub. Retain only until post-rewrite verification and team re-cloning are complete, then securely purge.
5. **Rewrite reachable Git history** in an isolated mirror clone using `git-filter-repo` across all affected branches and tags (see `DFARM_FIX02_GIT_HISTORY_REWRITE_PLAN.md`).
6. **Force-push ONLY the affected branches** using explicit `--force-with-lease=<ref>:<old-sha>` (never `git push --mirror`), then contact GitHub Support to purge cached views/PR diffs and instruct collaborators to re-clone fresh.
