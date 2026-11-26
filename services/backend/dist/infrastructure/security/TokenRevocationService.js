import crypto from 'node:crypto';
import { db } from '../database/PostgresPool.js';
/**
 * Tracks revoked access and refresh tokens (by `jti` or token SHA-256 hash).
 * Uses in-memory cache + best-effort persistence when `revoked_tokens` table exists.
 */
export class TokenRevocationService {
    revokedKeys = new Map();
    hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
    pruneExpired() {
        const now = Date.now();
        for (const [k, expMs] of this.revokedKeys.entries()) {
            if (expMs > 0 && expMs < now) {
                this.revokedKeys.delete(k);
            }
        }
    }
    revoke(tokenOrId) {
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
    async revokeAsync(tokenOrId) {
        this.revoke(tokenOrId);
        const key = tokenOrId.jti || (tokenOrId.token ? this.hashToken(tokenOrId.token) : null);
        if (!key)
            return;
        try {
            const expiresIso = tokenOrId.expiresAtSeconds
                ? new Date(tokenOrId.expiresAtSeconds * 1000).toISOString()
                : new Date(Date.now() + 31 * 86400 * 1000).toISOString();
            await db.query(`INSERT INTO revoked_tokens (token_key, expires_at) VALUES ($1, $2) ON CONFLICT (token_key) DO NOTHING;`, [key, expiresIso]);
        }
        catch {
            // Optional table may not exist in all schemas; in-memory revocation remains active
        }
    }
    isRevokedSync(token, jti) {
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
    async isRevoked(token, jti) {
        if (this.isRevokedSync(token, jti)) {
            return true;
        }
        const clean = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
        const tokenHash = clean ? this.hashToken(clean) : null;
        const keys = [jti, tokenHash].filter((k) => Boolean(k));
        if (keys.length === 0)
            return false;
        try {
            const res = await db.query(`SELECT 1 FROM revoked_tokens WHERE token_key = ANY($1::text[]) AND expires_at > NOW() LIMIT 1;`, [keys]);
            return res.rows.length > 0;
        }
        catch {
            return false;
        }
    }
}
export const tokenRevocationService = new TokenRevocationService();
//# sourceMappingURL=TokenRevocationService.js.map