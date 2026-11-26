import crypto from 'node:crypto';
import { db } from '../database/PostgresPool.js';

/**
 * Tracks revoked access and refresh tokens (by `jti` or token SHA-256 hash).
 * Uses in-memory cache + best-effort persistence when `revoked_tokens` table exists.
 */
export class TokenRevocationService {
  private readonly revokedKeys = new Map<string, number>();

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [k, expMs] of this.revokedKeys.entries()) {
      if (expMs > 0 && expMs < now) {
        this.revokedKeys.delete(k);
      }
    }
  }

  public revoke(tokenOrId: { token?: string; jti?: string; expiresAtSeconds?: number }): void {
    this.pruneExpired();
    const expMs = tokenOrId.expiresAtSeconds ? tokenOrId.expiresAtSeconds * 1000 : Date.now() + 31 * 86400 * 1000;
    if (tokenOrId.jti) {
      this.revokedKeys.set(`jti:${tokenOrId.jti}`, expMs);
    }
    if (tokenOrId.token) {
      const clean = tokenOrId.token.startsWith('Bearer ') ? tokenOrId.token.slice(7).trim() : tokenOrId.token.trim();
      if (clean) {
        this.revokedKeys.set(`tok:${this.hashToken(clean)}`, expMs);
      }
    }
  }

  public async revokeAsync(tokenOrId: { token?: string; jti?: string; expiresAtSeconds?: number }): Promise<void> {
    this.revoke(tokenOrId);
    const key = tokenOrId.jti || (tokenOrId.token ? this.hashToken(tokenOrId.token) : null);
    if (!key) return;
    try {
      const expiresIso = tokenOrId.expiresAtSeconds
        ? new Date(tokenOrId.expiresAtSeconds * 1000).toISOString()
        : new Date(Date.now() + 31 * 86400 * 1000).toISOString();
      await db.query(
        `INSERT INTO revoked_tokens (token_key, expires_at) VALUES ($1, $2) ON CONFLICT (token_key) DO NOTHING;`,
        [key, expiresIso]
      );
    } catch {
      // Optional table may not exist in all schemas; in-memory revocation remains active
    }
  }

  public isRevokedSync(token: string, jti?: string): boolean {
    this.pruneExpired();
    if (jti && this.revokedKeys.has(`jti:${jti}`)) {
      return true;
    }
    const clean = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
    if (clean && this.revokedKeys.has(`tok:${this.hashToken(clean)}`)) {
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
      const res = await db.query(
        `SELECT 1 FROM revoked_tokens WHERE token_key = ANY($1::text[]) AND expires_at > NOW() LIMIT 1;`,
        [keys]
      );
      return res.rows.length > 0;
    } catch {
      return false;
    }
  }
}

export const tokenRevocationService = new TokenRevocationService();
