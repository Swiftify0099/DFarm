import crypto from 'node:crypto';
import { AppError } from '../../shared/errors/app-error.js';
import { logger } from '../../shared/logger/index.js';
import { db } from '../database/PostgresPool.js';

/**
 * Durable distributed token revocation registry.
 *
 * Security contract (RESTART-02.1 Phases 1 & 2):
 *  - `revokeAsync()` persists to the authoritative control-plane `revoked_tokens` table before
 *    warming the local process cache; DB write failures throw 503 `REVOCATION_DB_UNAVAILABLE`.
 *  - `isRevoked()` fails closed: DB outages throw 503 `AUTH_DB_UNAVAILABLE` (never `false`).
 *  - `tryConsumeSingleUseToken()` atomically consumes a refresh token via
 *    `INSERT ... ON CONFLICT (token_key) DO NOTHING RETURNING token_key` so concurrent
 *    refresh requests can never both succeed.
 *  - Raw JWTs are never stored or logged; only the JTI or SHA-256 hex digest is persisted.
 */
export class TokenRevocationService {
  private readonly memCache = new Map<string, number>();
  private retentionTimer: NodeJS.Timeout | null = null;

  constructor() {
    if (process.env['NODE_ENV'] !== 'test') {
      this.retentionTimer = setInterval(() => {
        this.pruneExpiredPersisted(500).catch(() => {});
      }, 3600000);
      if (this.retentionTimer.unref) {
        this.retentionTimer.unref();
      }
    }
  }

  private hashToken(raw: string): string {
    const clean = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim();
    return crypto.createHash('sha256').update(clean).digest('hex');
  }

  private resolveStorageKey(tokenOrId: { token?: string; jti?: string }): string | null {
    if (tokenOrId.jti && tokenOrId.jti.trim()) {
      return tokenOrId.jti.trim();
    }
    if (tokenOrId.token && tokenOrId.token.trim()) {
      return this.hashToken(tokenOrId.token);
    }
    return null;
  }

  private pruneExpiredCache(): void {
    const now = Date.now();
    for (const [k, expMs] of this.memCache.entries()) {
      if (expMs > 0 && expMs <= now) {
        this.memCache.delete(k);
      }
    }
  }

  /** Warms the in-memory performance cache only (never call before durable DB write succeeds). */
  public cacheRevocation(tokenOrId: { token?: string; jti?: string; expiresAtSeconds?: number }): void {
    this.pruneExpiredCache();
    const expMs = tokenOrId.expiresAtSeconds
      ? tokenOrId.expiresAtSeconds * 1000
      : Date.now() + 31 * 86400 * 1000;
    if (expMs <= Date.now()) return;

    if (tokenOrId.jti && tokenOrId.jti.trim()) {
      this.memCache.set(`jti:${tokenOrId.jti.trim()}`, expMs);
    }
    if (tokenOrId.token) {
      const clean = tokenOrId.token.startsWith('Bearer ') ? tokenOrId.token.slice(7).trim() : tokenOrId.token.trim();
      if (clean) {
        this.memCache.set(`tok:${this.hashToken(clean)}`, expMs);
      }
    }
  }

  public async revokeAsync(tokenOrId: {
    token?: string;
    jti?: string;
    expiresAtSeconds?: number;
    reason?: string;
  }): Promise<void> {
    const key = this.resolveStorageKey(tokenOrId);
    if (!key) return;

    const expiresIso = tokenOrId.expiresAtSeconds
      ? new Date(tokenOrId.expiresAtSeconds * 1000).toISOString()
      : new Date(Date.now() + 31 * 86400 * 1000).toISOString();
    const reason = tokenOrId.reason || 'LOGOUT_OR_REVOKE';

    try {
      await db.query(
        `INSERT INTO revoked_tokens (token_key, expires_at, reason)
         VALUES ($1, $2, $3)
         ON CONFLICT (token_key) DO UPDATE
         SET expires_at = CASE
           WHEN revoked_tokens.expires_at > EXCLUDED.expires_at THEN revoked_tokens.expires_at
           ELSE EXCLUDED.expires_at
         END;`,
        [key, expiresIso, reason]
      );
    } catch (dbErr: unknown) {
      logger.error(
        { err: dbErr instanceof Error ? dbErr.message : 'unknown' },
        '[TokenRevocationService] Failed to persist token revocation'
      );
      throw new AppError(
        'Token revocation persistence is temporarily unavailable',
        503,
        'REVOCATION_DB_UNAVAILABLE'
      );
    }

    this.cacheRevocation(tokenOrId);
  }

  /**
   * Atomically consumes a single-use refresh token across all backend instances.
   * Returns true strictly for the single caller that inserts the record;
   * returns false if the token was already revoked or consumed by a concurrent request.
   */
  public async tryConsumeSingleUseToken(tokenOrId: {
    token?: string;
    jti?: string;
    expiresAtSeconds?: number;
    reason?: string;
  }): Promise<boolean> {
    const key = this.resolveStorageKey(tokenOrId);
    if (!key) return false;

    const expiresIso = tokenOrId.expiresAtSeconds
      ? new Date(tokenOrId.expiresAtSeconds * 1000).toISOString()
      : new Date(Date.now() + 31 * 86400 * 1000).toISOString();
    const reason = tokenOrId.reason || 'REFRESH_ROTATED';

    try {
      await db.query(
        `INSERT INTO revoked_tokens (token_key, expires_at, reason)
         VALUES ($1, $2, $3);`,
        [key, expiresIso, reason]
      );

      this.cacheRevocation(tokenOrId);
      return true;
    } catch (dbErr: any) {
      const msg = String(dbErr?.message || '');
      const isDuplicate =
        dbErr?.code === '23505' ||
        msg.includes('duplicate key') ||
        msg.includes('unique constraint') ||
        msg.includes('PRIMARY KEY') ||
        msg.includes('already exists');

      if (isDuplicate) {
        this.cacheRevocation(tokenOrId);
        return false;
      }

      logger.error(
        { err: dbErr instanceof Error ? dbErr.message : 'unknown' },
        '[TokenRevocationService] Atomic refresh token consumption failed'
      );
      throw new AppError(
        'Token revocation database is temporarily unavailable',
        503,
        'AUTH_DB_UNAVAILABLE'
      );
    }
  }

  public isRevokedSync(token: string, jti?: string): boolean {
    this.pruneExpiredCache();
    if (jti && this.memCache.has(`jti:${jti}`)) {
      return true;
    }
    const clean = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    if (clean && this.memCache.has(`tok:${this.hashToken(clean)}`)) {
      return true;
    }
    return false;
  }

  public async isRevoked(token: string, jti?: string): Promise<boolean> {
    if (this.isRevokedSync(token, jti)) {
      return true;
    }

    const clean = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    const tokenHash = clean ? this.hashToken(clean) : null;
    const keys = [jti, tokenHash].filter((k): k is string => Boolean(k));
    if (keys.length === 0) return false;

    try {
      const sql = keys.length === 1
        ? `SELECT expires_at FROM revoked_tokens WHERE token_key = $1 AND expires_at > NOW() LIMIT 1;`
        : `SELECT expires_at FROM revoked_tokens WHERE token_key IN ($1, $2) AND expires_at > NOW() LIMIT 1;`;
      const res = await db.query(sql, keys.slice(0, 2));
      if (res.rows.length > 0) {
        const expiresAtMs = res.rows[0].expires_at ? new Date(res.rows[0].expires_at).getTime() : 0;
        const expiresAtSeconds = expiresAtMs > Date.now() ? Math.floor(expiresAtMs / 1000) : undefined;
        this.cacheRevocation({ jti, token: clean || undefined, expiresAtSeconds });
        return true;
      }
      return false;
    } catch (dbErr: unknown) {
      logger.error(
        { err: dbErr instanceof Error ? dbErr.message : 'unknown' },
        '[TokenRevocationService] Revocation check failed (failing closed)'
      );
      throw new AppError(
        'Authentication verification database is unavailable',
        503,
        'AUTH_DB_UNAVAILABLE'
      );
    }
  }

  /**
   * Bounded retention cleanup for expired revocation entries (`expires_at <= NOW()`).
   * Unexpired revocation entries are never removed.
   */
  public async pruneExpiredPersisted(batchSize = 500): Promise<number> {
    const safeBatchSize = Math.max(1, Math.min(5000, Math.floor(batchSize)));
    try {
      const res = await db.query(
        `DELETE FROM revoked_tokens
         WHERE token_key IN (
           SELECT token_key FROM revoked_tokens
           WHERE expires_at <= NOW()
           ORDER BY expires_at ASC
           LIMIT $1
         )
         RETURNING token_key;`,
        [safeBatchSize]
      );
      this.pruneExpiredCache();
      return res.rowCount ?? res.rows.length ?? 0;
    } catch (dbErr: unknown) {
      logger.warn(
        { err: dbErr instanceof Error ? dbErr.message : 'unknown' },
        '[TokenRevocationService] Expired revocation cleanup skipped'
      );
      return 0;
    }
  }
}

export const tokenRevocationService = new TokenRevocationService();
