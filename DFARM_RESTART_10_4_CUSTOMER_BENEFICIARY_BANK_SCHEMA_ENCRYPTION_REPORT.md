# DFARM — RESTART-10.4 Customer Beneficiary Bank Schema, Encryption & Payout Mask Integrity Report

**Task:** `RESTART-10.4` (`DF-022` + `DF-024` Production Customer Bank Schema, Fail-Closed Encryption & Payout Mask Remediation)  
**Repository:** `Swiftify0099/DFarm`  
**Branch:** `fix/cloudflare-pages-production-deploy`  
**Verified Starting Remote HEAD (`origin/fix/cloudflare-pages-production-deploy`):** `af578d8624099c8ef020643de5c3d135b75a4a69` (`feat: add RESTART-10 PostgreSQL 17 Union Bank CI workflow and reports`)  
**Local Worktree HEAD:** `af578d8624099c8ef020643de5c3d135b75a4a69` *(preserving all uncommitted `RESTART-10.3` changes plus `RESTART-10.4` edits; zero commits or pushes executed)*  
**Classification:** **`OPEN / PARTIAL`** *(All production schema/service changes, migration `049`, offline unit/contract tests (`16/16`), catalog validation (`26/26`), and `12` isolated offline regression suites (`175/175`) pass locally; two-tenant PostgreSQL `17.12` execution (`Groups A–M`) awaits live PG17 CI execution because `com.docker.service` is stopped and `psql` is absent on this host. Live Union Bank API transmission remains externally blocked on corporate credentials and bank certification under `DF-024`.)*

---

## 1. Preserved RESTART-10.3 Baseline

Verified prior to edits and preserved intact throughout `RESTART-10.4`:
- Local `HEAD` matches remote `origin/fix/cloudflare-pages-production-deploy` (`af578d8624099c8ef020643de5c3d135b75a4a69`).
- Uncommitted `RESTART-10.3` files preserved:
  - [`services/backend/tests/restart10-union-bank-tenant-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart10-union-bank-tenant-isolation.test.js) *(extended additively with `Group M`)*
  - [`DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_01_MASTER_ISSUE_REGISTER.md)
  - [`DFARM_RESTART_10_UNION_BANK_TENANT_ISOLATION_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_10_UNION_BANK_TENANT_ISOLATION_REPORT.md)
  - [`DFARM_RESTART_10_2_CI_BOOTSTRAP_FIX_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_10_2_CI_BOOTSTRAP_FIX_REPORT.md)
  - [`DFARM_RESTART_10_3_PG17_TEST_FIXTURE_AND_GROUP_L_REPORT.md`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/DFARM_RESTART_10_3_PG17_TEST_FIXTURE_AND_GROUP_L_REPORT.md)
- Historical migrations `004`, `021`, `024`, `025`, `026`, `042`, and `048` were left completely untouched.

---

## 2. Additive Tenant Migration `049` & Catalog Summary

### 2.1 Migration [`049_customer_beneficiary_bank_encryption_and_mask.sql`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/049_customer_beneficiary_bank_encryption_and_mask.sql) (`TENANT_OPERATIONAL`)
1. **Widen encrypted storage capacity (`customers.bank_account_number`):** `ALTER TABLE public.customers ALTER COLUMN bank_account_number TYPE TEXT;` so AES-256-GCM envelopes (`iv:authTag:ciphertext`, `76–94+` chars for 9–18 digit Indian bank accounts) are stored without truncation, table drops, or data loss.
2. **Add customer-level mask (`customers.bank_account_mask`):** `ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS bank_account_mask VARCHAR(30);`.
3. **Safe legacy-numeric mask backfill:** Populates `'XXXX-XXXX-' || RIGHT(BTRIM(bank_account_number), 4)` **only** when `bank_account_mask` is null/blank and `BTRIM(bank_account_number)` strictly matches `'^[0-9]{9,18}$'` and does not match `'^0+$'`. Encrypted ciphertexts (`iv:authTag:ciphertext`) and ambiguous/non-numeric values are intentionally skipped (never tail-sliced, never logged).
4. **Fix `public.create_customer_payout(...)` SQL RPC:** Preserves the exact 12-argument signature, `pg_catalog, public` `SECURITY DEFINER` hardening, ledger row-locking (`INSERT ... ON CONFLICT DO NOTHING` + `FOR UPDATE`), overpayment protection, idempotency replay contract, `PENDING_APPROVAL` initial status, and audit logging from migrations `021`/`026` while replacing `RIGHT(v_customer.bank_account_number, 4)` with `v_mask := NULLIF(BTRIM(v_customer.bank_account_mask), '');` and returning superset legacy+extended masked fields (`bankAccountMask`, `createdAt`, `eligibleBalanceBefore`, `eligibleBalanceAfter`, `sourceTransactionType`).

### 2.2 Canonical Migration Catalog ([`catalog.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/catalog.ts))
Verified by `node scripts/migrate.js --validate-only` and `npm run db:validate`:
- **`totalEntries`:** `50` (`49` active `001`–`049` + `1` quarantined `031_quarantine`)
- **`CONTROL_PLANE` track:** `16` entries (`049` excluded)
- **`TENANT_OPERATIONAL` track:** `38` entries (includes `049_customer_beneficiary_bank_encryption_and_mask.sql`)
- **`diskSqlFilesChecked`:** `50` (`1-to-1` match, verified by [`migration-catalog.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/tests/migration-catalog.test.js) including new test `3b`)

---

## 3. Production Service & Helper Changes

| File | Summary of Production Fixes |
|---|---|
| [`beneficiary-bank-account.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/payments/beneficiary-bank-account.ts) | New shared beneficiary account security module: (1) `encryptBeneficiaryBankAccount()` rejects non-numeric/colon inputs and encrypts unconditionally via `CredentialEncryption.encrypt()`, failing closed (`500 BENEFICIARY_BANK_ENCRYPTION_FAILED`, no plaintext fallback); (2) `decryptStoredBankAccountFailClosed()` verifies strict `24:32:even-hex` envelope shape + AES-GCM decryption and throws `INVALID_ENCRYPTED_BANK_ACCOUNT` on tampering/corruption (never returning raw ciphertext); (3) legacy plaintext compatibility accepts strictly `^[0-9]{9,18}$` non-all-zero strings and counts detections via `createLegacyPlaintextTracker()` without logging account digits; (4) `validateBeneficiaryBankAccountForSettlement()` & `resolveBeneficiaryBankMask()` never slice ciphertext tails. |
| [`batch.service.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/payments/batch.service.ts) | Updated `updateBeneficiaryBankDetails()` to derive `prevMask` safely without logging digits, encrypt unconditionally via `encryptBeneficiaryBankAccount()` (removed `CREDENTIAL_ENCRYPTION_KEY` guard & plaintext fallback `catch`), store ciphertext + `bank_account_mask`, preserve `beneficiary_audit_logs` masked diffs, and return only `bankAccountNumberMask`. Updated `createBatch()` period path to exclude `hasMalformedCiphertext` beneficiaries and non-period path to select `c.bank_account_mask`, verify encrypted ciphertexts fail-closed, and persist `bank_account_mask` to both `customer_payouts` and `payment_batch_items`. |
| [`UnionBankReconciliationService.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/integrations/banking/union-bank/UnionBankReconciliationService.ts) | Changed `reconcileBatchWithBankData()` line `246` to `COALESCE(bi.bank_account_mask, cp.bank_account_mask, c.bank_account_mask) AS bank_account_mask` preserving `FOR UPDATE OF bi, cp`, strict tenant TX, `SAVEPOINT`s, conflict checks, and post-COMMIT notifications. |
| [`settlement-calculation.service.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/payments/settlement-calculation.service.ts) | Selects `c.bank_account_mask`, decrypts encrypted accounts via `validateBeneficiaryBankAccountForSettlement()` before validating 9–18 numeric digits + IFSC, displays `c.bank_account_mask` (never ciphertext tail digits), flags tampered/corrupted ciphertext with controlled `hasMalformedCiphertext: true` / `isBankValid: false` (excluding from batch submission), tracks legacy plaintext count without raw digits, and preserves PostgreSQL `NUMERIC`/paise math. |
| [`BankFileService.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/payments/serializers/BankFileService.ts) | Selects `c.bank_account_mask`, removes silent `catch` fallback on `CredentialEncryption.decrypt()`, fail-closed decrypts both `organizations.bank_debit_account_encrypted` and beneficiary `bank_account_number` via `decryptStoredBankAccountFailClosed()`, validates IFSC via `UnionBankValidator.validateIfsc()`, and counts legacy numeric reads without logging raw numbers. |
| [`UnionBankSubmissionService.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/integrations/banking/union-bank/UnionBankSubmissionService.ts) | Removed permissive `decryptAccountIfNeeded()` catch-fallback; enforced `decryptStoredBankAccountFailClosed()` + numeric/IFSC validation on both `resolveDairyAuthorizedDebitAccount()` and beneficiary batch items while keeping Phase 2 HTTP outside DB transactions, preserving dairy debit fail-closed checks, and keeping all logs masked. |
| [`tenant-payment-context.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/payments/tenant-payment-context.ts), [`UnionBankValidator.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/integrations/banking/union-bank/UnionBankValidator.ts), [`TenantDatabaseManager.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/TenantDatabaseManager.ts), [`customers.routes.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/customers.routes.ts), [`customer.service.ts`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/modules/customers/customer.service.ts) | Defense-in-depth hardening: `maskAccountNumber()` returns `'XXXX'` on colon-bearing ciphertext strings; `UnionBankValidator` rejects colon/alphabetic inputs before digit stripping; `pg-mem` test double includes `bank_account_mask`; `customers.routes.ts` (`GET /me`, `GET /:id`) and `customer.service.ts` use `resolveBeneficiaryBankMask()` instead of slicing ciphertext tails. |

---

## 4. Operator-Controlled Per-Tenant Legacy Data Migration Plan

> [!IMPORTANT]
> Historical beneficiary bank records are **not** automatically claimed to be encrypted across all tenants. Legacy numeric 9–18 digit plaintext records remain readable under the compatibility policy until an operator executes and verifies a per-tenant encryption pass.

1. **Pre-flight key & schema verification:**
   - Verify `TENANT_DB_ENCRYPTION_KEY` is explicitly configured in the target runtime environment (strong entropy, minimum 32 bytes, unique per environment) and test round-trip AES-256-GCM encryption/decryption prior to mutating data.
   - Apply migration `049` to every active operational tenant DB via `node scripts/migrate.js --track=tenant --dairy-id=<tenant-uuid>` (after control-plane `validate-only` check).
2. **Per-tenant classification audit (counts only — never print or export account numbers):**
   - For each tenant resolved strictly via `tenantDbManager.getStrictTenantDb(organizationId, { bypassCache: true, strictOperational: true })`, count rows by bucket:
     - Valid encrypted (`bank_account_number ~ '^[0-9a-fA-F]{24}:[0-9a-fA-F]{32}:([0-9a-fA-F]{2})+$'`)
     - Recognizable legacy numeric (`bank_account_number ~ '^[0-9]{9,18}$' AND bank_account_number !~ '^0+$'`)
     - Malformed/ambiguous (non-null `bank_account_number` matching neither pattern)
3. **Controlled per-tenant encryption batch:**
   - Inside a bounded per-tenant transaction (using `FOR UPDATE SKIP LOCKED` in small batches, e.g. 200 customers), validate each legacy numeric record strictly against `/^[0-9]{9,18}$/` (`!/^0+$/`), encrypt via `CredentialEncryption.encrypt(cleanAccount)`, compute `maskAccountNumber(cleanAccount)`, write `bank_account_number` and `bank_account_mask`, and record a sanitized migration summary log containing only `(organizationId, migratedCount, skippedMalformedCount)` with zero account digits.
   - Quarantined malformed/ambiguous records must **not** be auto-rewritten or exported; dairy admins must re-collect and verify them via `BatchService.updateBeneficiaryBankDetails()`.
4. **Post-migration tenant verification:**
   - Confirm `COUNT(*) = 0` for legacy plaintext 9–18 digit `customers.bank_account_number` rows on the target tenant and verify `bank_account_mask` is non-null across all encrypted customers.

---

## 5. Verification Results (Observed After Final Code & Test Edits)

| Command / Suite | Pass | Fail | Skip | Exit Code | Notes / Coverage |
|---|---:|---:|---:|---:|---|
| `npm run build -w @dfarm/database && npm run build:backend` | — | — | — | `0` | Clean `tsc` build across `shared-types`, `shared-validation`, `database`, `backend` |
| `npm run db:validate` | `26` | `0` | `0` | `0` | `migration-catalog.test.js` (`13/13` incl. `049`) + `schema-validation.test.js` (`13/13`) |
| `npm run db:test` *(offline default env)* | `35` | `0` | `0` *(+1 suite `# SKIP`)* | `0` | `database-runtime` (`9`), `migration-catalog` (`13`), `schema-validation` (`13`); `real-postgres-verification` `# SKIP` (no PG17 URL) |
| `node scripts/migrate.js --validate-only` | — | — | — | `0` | `totalEntries: 50, activeEntries: 49, quarantinedEntries: 1, controlPlaneCount: 16, tenantOperationalCount: 38, diskSqlFilesChecked: 50` |
| `node --test --test-reporter=tap services/backend/tests/restart10-union-bank-tenant-isolation-unit.test.js` | `16` | `0` | `0` | `0` | Tests `1–10` (existing DF-022/DF-024 invariants) + Tests `11–16` (`RESTART-10.4` A–N coverage: helper crypto/tamper/legacy policy, `updateBeneficiaryBankDetails` fail-closed/audit/tenant isolation, `SettlementCalculationService` + `createBatch`, `BankFileService`, `UnionBankSubmissionService`, `UnionBankReconciliationService` canonical mask, `049` SQL verification) |
| `node scripts/ci-run-offline-lifecycle-suite.js` (`restart037-pool-lifecycle.test.js`) | `22` | `0` | `0` | `0` | Pool & shutdown lifecycle checks |
| `12`-suite isolated offline regression batch (`NODE_ENV=test`, `127.0.0.1:59999/offline_test`) | `175` | `0` | `0` | `0` | `restart09-outbox-isolation-unit` (`8`), `restart03` (`18`), `restart032` (`17`), `restart04` (`5`), `restart05` (`10`), `restart051` (`9`), `clean-architecture` (`9`), `restart02` (`9`), `restart021` (`7`), `offline-sync-22-scenarios` (`23`), `collection-kiosk-production` (`24`), `dairy-admin-production` (`36`) |
| `node --check services/backend/tests/restart10-union-bank-tenant-isolation.test.js` | — | — | — | `0` | Clean ESM syntax check including new `Group M` |
| Fail-closed `REQUIRE_REAL_POSTGRES=1` check (`restart10-union-bank-tenant-isolation.test.js` & `scripts/ci-run-restart10-pg17.js` w/ unset `TEST_POSTGRES_URL`) | `0` | `1` / `FATAL` | `0` | `1` / `1` | Refuses `pg-mem` fallback when real PG17 is absent |
| Static grep audit (`c.bank_account_mask`, `CREDENTIAL_ENCRYPTION_KEY`) | — | — | — | `0` | All `4` remaining `c.bank_account_mask` references match migration `049` (`UnionBankReconciliationService.ts:246` `COALESCE(...)`, `batch.service.ts`, `BankFileService.ts`, `settlement-calculation.service.ts`); `0` `CREDENTIAL_ENCRYPTION_KEY` fallbacks |
| Live Two-Tenant PostgreSQL `17.12` Integration Gate (`Groups A–M` via [`restart10-union-bank-tenant-isolation.test.js`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart10-union-bank-tenant-isolation.test.js)) | — | — | — | **NOT RUN LOCALLY** | Local host environment check confirmed `com.docker.service` is `Stopped`, `psql` is absent, and TCP `127.0.0.1:5432` is closed. Real PG `17.12` execution of `Groups A–M` requires CI workflow [`.github/workflows/dfarm-restart10-postgres17.yml`](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/.github/workflows/dfarm-restart10-postgres17.yml) after commit/push. |

---

## 6. Remaining Open Status (`DF-022` & `DF-024`)

- **`DF-022` (`OPEN / PARTIAL`):** Production schema `049`, fail-closed encryption/decryption helpers, `create_customer_payout()` SQL fix, service remediations, and PG17 `Group M` tests are implemented and verified offline (`16/16` unit + `26/26` catalog + `175/175` regression), but `DF-022` stays **`OPEN / PARTIAL`** until the full two-tenant PG `17.12` gate (`Groups A–M`, `0` fail, `0` skip) passes on CI.
- **`DF-024` (`PARTIAL`):** Code-side fail-closed debit/beneficiary validation and masking remain enforced and verified offline; live Union Bank Host-to-Host transfers remain disabled awaiting genuine dairy corporate credentials and Union Bank certification (`502 UNION_BANK_GATEWAY_CERTIFICATION_REQUIRED`).
