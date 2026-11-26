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
export declare class TokenRevocationService {
    private readonly memCache;
    private retentionTimer;
    constructor();
    private hashToken;
    private resolveStorageKey;
    private pruneExpiredCache;
    /** Warms the in-memory performance cache only (never call before durable DB write succeeds). */
    cacheRevocation(tokenOrId: {
        token?: string;
        jti?: string;
        expiresAtSeconds?: number;
    }): void;
    revokeAsync(tokenOrId: {
        token?: string;
        jti?: string;
        expiresAtSeconds?: number;
        reason?: string;
    }): Promise<void>;
    /**
     * Atomically consumes a single-use refresh token across all backend instances.
     * Returns true strictly for the single caller that inserts the record;
     * returns false if the token was already revoked or consumed by a concurrent request.
     */
    tryConsumeSingleUseToken(tokenOrId: {
        token?: string;
        jti?: string;
        expiresAtSeconds?: number;
        reason?: string;
    }): Promise<boolean>;
    isRevokedSync(token: string, jti?: string): boolean;
    isRevoked(token: string, jti?: string): Promise<boolean>;
    /**
     * Bounded retention cleanup for expired revocation entries (`expires_at <= NOW()`).
     * Unexpired revocation entries are never removed.
     */
    pruneExpiredPersisted(batchSize?: number): Promise<number>;
}
export declare const tokenRevocationService: TokenRevocationService;
//# sourceMappingURL=TokenRevocationService.d.ts.map