# DFarm — RESTART-02 Secret Rotation & Public Git History Checklist (`DF-003`, `DF-008`, `DF-013`)

**Audit Phase:** `RESTART-02`  
**Date:** `2026-11-26`  
**Branch / Baseline:** `fix/cloudflare-pages-production-deploy` (`6fddf03cb35c343f38a7f4f1a46ac0cc9632c0c3`)  
**Execution Policy:** Zero destructive git operations (`reset`, `clean`, `rebase`, `force-push`) and zero external secret rotations were performed locally by this automated agent. All local `.temp/` files (`1,829` files, including `.temp/chrome-cdp/`) remain untouched and untracked (`git ls-files .temp` = `0`).

---

## 1. Repository & Git History Drift Status (`DF-003`)

- **Tracked files under `.temp/` at `HEAD`:** `0` (`git ls-files .temp`)
- **Local ignored files under `.temp/`:** `1,829` (`.temp/chrome-cdp` preserved)
- **Prior rewrite baseline (`DFARM_FIX02_2_REMOTE_HISTORY_REWRITE_APPROVAL.md`):** Audited mirror stopped at `c84ab21`, after which `45aa5ae` and `6fddf03` were pushed directly to `origin/fix/cloudflare-pages-production-deploy`.
- **Exposed history still present on remote GitHub refs:**
  - `.temp/` Chrome CDP commits (`e638850`, `5cca96c`, `d3d2189`)
  - Historical Google Maps API key commits (`c3b1a24`, `110b899`)
- **Remote branches / refs observed at `origin`:**
  - `main`: `d62ba16`
  - `fix/cloudflare-pages-production-deploy`: `6fddf03`
  - `feature/cloudflare-pages-deployment`: `9cd42bc`
  - `dfarm_customer_app_init`: `e638850`
  - `refs/pull/1..8/head`

---

## 2. Code & Configuration Hardening Completed Locally

1. **Client SMS Secret Removal (`DF-013`):**
   - `apps/dfarm-customer-app/src/services/smsService.ts`: removed direct Dove SMS dispatch and hardcoded `'ba9dcdcdfcXX'` fallback; client fails closed and directs traffic to `/api/v1/auth/request-otp`.
   - `apps/dfarm-customer-app/src/app/(auth)/login.tsx`: removed client-side fallback call to `DirectDoveSmsService`.
   - `apps/dfarm-customer-app/.env.example`: removed `EXPO_PUBLIC_DOVE_SMS_KEY`.
2. **AES-256-GCM Master Key & Versioned Rotation (`DF-008`):**
   - `services/backend/src/infrastructure/security/Aes256GcmBiometricEncryptor.ts` and `services/backend/src/biometric/encryption.ts`: removed hardcoded `'0123456789abcdef...'` fallback; enforced 64-char hex / 32-byte / entropy validation (`validateKeyEntropyAndByteLength`); added `DATA_ENCRYPTION_PREVIOUS_KEYS_HEX` decryption-only support for seamless historical data reads during human-managed key rotation.
   - `services/backend/src/infrastructure/security/CredentialEncryption.ts` & `DoveOtpService.ts`: removed fallback to `JWT_SECRET` / hardcoded key defaults in production.
   - `render.yaml` & `services/backend/src/config/env.ts`: registered `DATA_ENCRYPTION_KEY_HEX` (`sync: false`), `JWT_ISSUER`, `JWT_AUDIENCE`, `DATA_ENCRYPTION_PREVIOUS_KEYS_HEX`, and fail-closed production checks for `DOVE_SMS_AUTHKEY` and WhatsApp secrets (`WHATSAPP_ENABLED=true`).
3. **Production Gateway Fail-Closed Behavior (`DF-013`):**
   - `services/backend/src/infrastructure/sms/DoveSmsService.ts`: rejects unconfigured / placeholder `DOVE_SMS_AUTHKEY` in production (`success: false`).
   - `services/backend/src/modules/notifications/webhooks/whatsapp-webhook.handler.ts`: rejects unconfigured / default `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` in production.

---

## 3. Human-Executed Secret Rotation & Render Cutover Procedure

### Step A: Generate & Configure Production Keys (Zero Downtime Encryption Rotation)
1. **Biometric & Sensitive Data Encryption Key (`DATA_ENCRYPTION_KEY_HEX`):**
   ```bash
   openssl rand -hex 32
   ```
   - On Render (`services/backend`), set `DATA_ENCRYPTION_KEY_HEX` to the new 64-character hex secret.
   - **ONLY if historical production database rows were previously encrypted with the old fallback key**, temporarily add `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef` (or the prior key) to `DATA_ENCRYPTION_PREVIOUS_KEYS_HEX`, re-encrypt historical rows offline via a batch script, then delete the old key from `DATA_ENCRYPTION_PREVIOUS_KEYS_HEX`.
   - Confirm `DATA_ENCRYPTION_KEY_HEX` is distinct from `JWT_SECRET`, `ADMIN_OTP_SECRET`, `TENANT_DB_ENCRYPTION_KEY`, and `OFFLINE_LEASE_SIGNING_KEY`.
2. **External Provider Keys & Platform Secrets to Rotate Immediately:**
   - [ ] **Google Maps API Key** (`VITE_GOOGLE_MAPS_API_KEY`): revoke old key in Google Cloud Console; generate new key restricted by HTTP referrer (`*.dfarm.in`, `*.pages.dev`) and Maps JavaScript / Places / Geocoding APIs only; update Cloudflare Pages env vars & local ignored `.env` files.
   - [ ] **Dove SMS Auth Key** (`DOVE_SMS_AUTHKEY`): revoke exposed `EXPO_PUBLIC_DOVE_SMS_KEY` / legacy `ba9dcdcdfcXX` pattern in Dove SMS portal; issue server-only `DOVE_SMS_AUTHKEY` in Render.
   - [ ] **JWT / OTP / Lease / Tenant DB Secrets**: rotate `JWT_SECRET`, `ADMIN_OTP_SECRET`, `TENANT_DB_ENCRYPTION_KEY`, and `OFFLINE_LEASE_SIGNING_KEY` (`openssl rand -hex 32`) on Render; trigger re-login/refresh across active clients.
   - [ ] **WhatsApp Secrets** (if `WHATSAPP_ENABLED=true`): set high-entropy `WHATSAPP_WEBHOOK_VERIFY_TOKEN` & rotated Meta App Secret (`WHATSAPP_APP_SECRET`).
   - [ ] **SMTP / Gmail Credentials / Supabase Service Role Key / Postgres Passwords**: verify rotation status in external consoles if ever exposed in shell history, CI logs, or developer machines.

### Step B: Public Git History Purge (`DF-003` — Operator Approval Required)
1. Merge/finalize local remediation branch commits cleanly first.
2. Clone a fresh `--mirror` backup outside the working tree (`git clone --mirror https://github.com/Swiftify0099/DFarm.git dfarm-purge-mirror.git`) and save an archival tag bundle before rewriting.
3. Run `git filter-repo` (or BFG) to strip all blobs under `.temp/` and replace/purge exposed credential strings across all commits/branches/tags.
4. Run Gitleaks across the full rewritten mirror (`gitleaks git --verbose`) and verify **0 findings**.
5. Coordinate team freeze, force-push rewritten refs (`git push --force --all && git push --force --tags`) with explicit repository owner approval, prune PR head caches via GitHub Support if exposed in closed PRs (`refs/pull/1..8/head`), and instruct all collaborators to re-clone.
