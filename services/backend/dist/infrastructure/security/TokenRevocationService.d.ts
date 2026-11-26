/**
 * Tracks revoked access and refresh tokens (by `jti` or token SHA-256 hash).
 * Uses in-memory cache + best-effort persistence when `revoked_tokens` table exists.
 */
export declare class TokenRevocationService {
    private readonly revokedKeys;
    private hashToken;
    private pruneExpired;
    revoke(tokenOrId: {
        token?: string;
        jti?: string;
        expiresAtSeconds?: number;
    }): void;
    revokeAsync(tokenOrId: {
        token?: string;
        jti?: string;
        expiresAtSeconds?: number;
    }): Promise<void>;
    isRevokedSync(token: string, jti?: string): boolean;
    isRevoked(token: string, jti?: string): Promise<boolean>;
}
export declare const tokenRevocationService: TokenRevocationService;
//# sourceMappingURL=TokenRevocationService.d.ts.map