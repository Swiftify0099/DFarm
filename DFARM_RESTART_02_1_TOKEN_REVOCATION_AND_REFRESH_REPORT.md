# DFarm — RESTART-02.1 Token Revocation & Atomic Refresh Report

**Phase:** `RESTART-02.1` (`DF-011` / `DF-009` / `DF-020`)  
**Date:** `2026-11-26`  
**Files:** [TokenRevocationService.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/security/TokenRevocationService.ts), [044_revoked_tokens_durable_revocation.sql](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/044_revoked_tokens_durable_revocation.sql), [PostgresPool.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/PostgresPool.ts), [MigrationRunner.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/infrastructure/database/MigrationRunner.ts), [packages/database/src/index.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/packages/database/src/index.ts), [CustomerAuthUseCases.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/application/use-cases/auth/CustomerAuthUseCases.ts), [auth.routes.ts](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/src/presentation/routes/auth.routes.ts)

---

## 1. Old vs. New Behavior

| Aspect | Prior State (`c67dbb94`) | Remediated State (`RESTART-02.1`) |
| :--- | :--- | :--- |
| Revocation lookup (`isRevoked`) | Returned `false` when DB query failed or `revoked_tokens` table did not exist (fail-open). | Fails closed: throws `503 AUTH_DB_UNAVAILABLE` without exposing SQL errors; warms local cache only from DB row's actual `expires_at`. |
| Revocation persistence (`revokeAsync`) | Swallowed DB insert errors (`catch {}`) and returned normally; `/auth/logout` returned `200 Logged out successfully`. | Persists to control-plane `revoked_tokens` first (using `jti` or SHA-256 token digest; zero raw JWT storage); throws `503 REVOCATION_DB_UNAVAILABLE` on DB error; `/auth/logout` returns `503 REVOCATION_DB_UNAVAILABLE` instead of fake `200`. |
| Refresh token consumption | Check-then-insert (`isRevoked()` then `revokeAsync()`) vulnerable to simultaneous refresh race conditions. | Uses `tryConsumeSingleUseToken()` performing a single atomic `INSERT INTO revoked_tokens (token_key, expires_at, reason) VALUES ($1, $2, 'REFRESH_ROTATED')` and catching duplicate-key constraint violations (`23505`). Strictly ONE concurrent caller succeeds; all concurrent siblings & replays fail `401 TOKEN_REVOKED`. |
| Expired record cleanup | None. | Bounded SQL cleanup (`pruneExpiredPersisted(batchSize)` deleting only `expires_at <= NOW()` ordered by `expires_at ASC`, plus `cleanup_revoked_tokens(INT)` PL/pgSQL proc in `044` with `FOR UPDATE SKIP LOCKED`) wired to a non-test `.unref()` hourly interval. |
| Schema & Migrations | No `revoked_tokens` migration existed (`001`–`043`); runtime table missing in fresh deployments. | Created idempotent [044_revoked_tokens_durable_revocation.sql](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/supabase/migrations/044_revoked_tokens_durable_revocation.sql), added `038`–`044` to `MigrationRunner.ts` & `@dfarm/database`, and added `044` to `PostgresPool.ts` in-memory test bootstrap (`testMigrationFiles`). |

---

## 2. Schema, Security & Cross-Instance Design

- **Table Schema (`044_revoked_tokens_durable_revocation.sql`):**
  - `token_key TEXT PRIMARY KEY` (stores JWT `jti` UUID or SHA-256 hex hash of token; raw JWTs are never persisted or logged).
  - `revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `expires_at TIMESTAMPTZ NOT NULL` (indexed via `idx_revoked_tokens_expires_at` for O(log n) lookup/retention cleanup).
  - `reason TEXT`
  - RLS enabled (`ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY`) with `deny_all_non_service` policy blocking non-service Postgres roles.
- **Cross-Instance & Fail-Closed Verification:** Verified in [restart021-auth-session-integrity.test.js](file:///c:/Users/panka/.gemini/antigravity/worktrees/DFarm/dfarm_customer_app_init/services/backend/tests/restart021-auth-session-integrity.test.js) subtests `1`–`3` (revocation via `instanceA` visible to separate `instanceB` without shared memory; expired entries pruned while unexpired rows remain; simulated DB errors return `503`; 3 simultaneous `/auth/refresh-token` calls yield strictly `1` HTTP `200` and `2` HTTP `401` rejections).
- **Physical Postgres Pending (`DF-030`):** Concurrency & migration execution tested against `pg-mem` offline because local PostgreSQL (`5432`/`54322`) is unavailable. Physical Postgres verification of `044` idempotency, RLS enforcement, and concurrent `23505` contention remains required in `RESTART-11`.
