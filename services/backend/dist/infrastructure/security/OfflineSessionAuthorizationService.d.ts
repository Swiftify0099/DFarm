import type { OfflineSessionAuthorizationPayload, OfflineSessionAuthorizationDTO } from '@dfarm/shared-types';
export interface VerifyAuthorizationResult {
    isValid: boolean;
    payload?: OfflineSessionAuthorizationPayload;
    errorCode?: 'OFFLINE_AUTHORIZATION_MISSING' | 'OFFLINE_AUTHORIZATION_INVALID' | 'OFFLINE_AUTHORIZATION_EXPIRED' | 'OFFLINE_ORGANIZATION_MISMATCH' | 'OFFLINE_CENTER_MISMATCH' | 'OFFLINE_DEVICE_MISMATCH' | 'OFFLINE_DEVICE_AUTH_REQUIRED' | 'OFFLINE_SESSION_MISMATCH' | 'OFFLINE_BUSINESS_DATE_MISMATCH';
    errorMessage?: string;
}
export interface OfflineAuthorizationKeyOptions {
    activeKey?: string;
    activeKeyId?: string;
    previousKeys?: Record<string, string>;
    retiredKeys?: string[] | string;
}
export declare class OfflineSessionAuthorizationService {
    private readonly activeKey;
    private readonly activeKeyId;
    private readonly keyRing;
    private readonly retiredKeyIds;
    constructor(options?: string | OfflineAuthorizationKeyOptions);
    /**
     * Generates a cryptographically signed Offline Session Authorization Token & Lease.
     * Issued when an authorized operator opens or accesses an active shift session while online.
     */
    generateAuthorization(params: {
        organizationId: string;
        centerId: string;
        sessionId: string;
        sessionCode: string;
        businessDate: string;
        shift: 'MORNING' | 'EVENING';
        deviceIdentifier: string;
        operatorId: string;
        operatorName?: string;
        timezone?: string;
        validFrom?: string;
        validUntil?: string;
        maxReconciliationDays?: number;
    }): OfflineSessionAuthorizationDTO;
    /**
     * Cryptographically verifies the server-issued offline authorization token.
     * Performs timing-safe HMAC validation, key ID resolution, JSON parsing, and payload schema integrity checks.
     */
    verifyToken(token: string): VerifyAuthorizationResult;
    /**
     * Comprehensive validation of the authorization against the targeted session,
     * authenticated organization, collection center, device, and business date.
     */
    validateSessionScope(params: {
        token: string;
        organizationId: string;
        session: {
            id: string;
            sessionCode: string;
            organizationId: string;
            centerId: string;
            businessDate: string;
            deviceIdentifier: string;
            openedAt?: string;
            closedAt?: string | null;
        };
        authenticatedDeviceId?: string;
        deviceId?: string;
        businessDate?: string;
        collectionTimestamp?: string;
    }): VerifyAuthorizationResult;
}
export declare const offlineSessionAuthService: OfflineSessionAuthorizationService;
//# sourceMappingURL=OfflineSessionAuthorizationService.d.ts.map