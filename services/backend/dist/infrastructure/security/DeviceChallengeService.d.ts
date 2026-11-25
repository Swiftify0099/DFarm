export interface DeviceChallengeRecord {
    challenge: string;
    deviceIdentifier: string;
    organizationId: string;
    purpose?: string;
    createdAt: number;
    expiresAt: number;
    consumed: boolean;
    failedAttempts?: number;
}
export declare class DeviceChallengeService {
    private memChallenges;
    private static tableEnsured;
    constructor();
    private ensureTableExists;
    /**
     * Generates a short-lived (default 60s), single-use cryptographic challenge for a registered device.
     * Persisted in PostgreSQL to ensure distributed single-use protection across backend instances and restarts.
     * Returns a hybrid thenable Promise that exposes synchronous .challenge & .expiresAt for backward compatibility.
     */
    createChallenge(deviceIdentifier: string, organizationId: string, ttlMs?: number, purpose?: string): Promise<{
        challenge: string;
        expiresAt: number;
    }> & {
        challenge: string;
        expiresAt: number;
    };
    /**
     * Atomically verifies the challenge row, validates device/organization/purpose bindings,
     * checks bounded failed attempts, verifies the cryptographic HMAC proof,
     * and ONLY on a valid proof marks the challenge as consumed within a single PostgreSQL transaction.
     *
     * Security & Ordering guarantees:
     * 1. Begins database transaction and acquires a row lock (FOR UPDATE).
     * 2. Checks device_identifier, organization, and purpose bindings FIRST.
     *    If mismatched, the transaction rolls back immediately — an unauthorized device
     *    CANNOT consume or alter a legitimate device's challenge.
     * 3. Enforces bounded failed attempts: if failed_attempts reaches 3, the challenge is invalidated.
     * 4. The cryptographic proof is verified BEFORE marking consumed_at = NOW().
     * 5. If proof is invalid, failed_attempts is incremented and committed, but consumed_at remains NULL.
     * 6. Marks consumed_at = NOW() ONLY when cryptographic proof verification succeeds.
     */
    verifyAndConsumeProof(params: {
        challenge: string;
        deviceIdentifier: string;
        organizationId?: string;
        purpose?: string;
        candidateProof: string;
        proofKeyOrToken: string;
    }): Promise<{
        valid: boolean;
        reason?: string;
    }>;
    /**
     * Atomically verifies and consumes the challenge.
     * Uses atomic SQL conditional update (UPDATE ... WHERE consumed_at IS NULL AND expires_at > NOW())
     * to guarantee single-use consumption across concurrent requests and multiple backend instances.
     */
    consumeChallenge(challenge: string, deviceIdentifier: string, organizationId?: string, purpose?: string): Promise<{
        valid: boolean;
        reason?: string;
    }>;
    /**
     * Cryptographically derives the symmetric HMAC proof key from a provisioned raw deviceToken.
     * Derivation protocol: K_proof = SHA-256(deviceToken)
     * This matches devices.device_token_hash stored in the database.
     */
    static deriveProofKey(deviceToken: string): string;
    /**
     * Computes expected HMAC proof for challenge response.
     * Proof = HMAC-SHA256(K_proof, deviceIdentifier + ":" + challenge)
     * where K_proof is the derived key (or stored device_token_hash).
     */
    static computeProof(challenge: string, proofKeyOrToken: string, deviceIdentifier: string): string;
    /**
     * Timing-safe verification of challenge response proof
     */
    static verifyProof(challenge: string, proofKeyOrToken: string, deviceIdentifier: string, candidateProof: string): boolean;
    clear(): void;
}
export declare const deviceChallengeService: DeviceChallengeService;
//# sourceMappingURL=DeviceChallengeService.d.ts.map