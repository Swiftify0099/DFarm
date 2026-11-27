import { DeviceAuthContext } from '../../middleware/authenticate.js';
export declare class SyncService {
    private static loadAuthorizedTenantDevice;
    private static validateAuthoritativeActor;
    /**
     * Push offline events strictly to the authenticated device's isolated tenant database
     */
    static pushEvents(deviceCtx: DeviceAuthContext, batchData: any): Promise<{
        success: boolean;
        applied: number;
        conflicts: number;
        results: any[];
        processedAt: string;
    }>;
    /**
     * Pull incremental changes strictly from the device's tenant database
     */
    static pullChanges(deviceCtx: DeviceAuthContext, cursor: number, tombstoneCursor: number): Promise<{
        customers: {
            id: any;
            farmerCode: any;
            fullName: any;
            mobilePhone: any;
            primaryCenterId: any;
            status: any;
            updatedAt: any;
        }[];
        rateCards: {
            id: any;
            rateChartVersionId: any;
            milkCategory: any;
            versionNumber: any;
            pricingUnit: any;
            fatPercentage: number;
            snfPercentage: number;
            ratePerUnit: number;
        }[];
        faceTemplates: {
            id: any;
            customerId: any;
            modelVersionId: any;
            modelName: string;
            modelVersion: string;
            cryptoNonce: any;
            authTag: any;
            encryptedEmbedding: any;
            status: any;
            updatedAt: any;
        }[];
        tombstones: {
            id: any;
            entityType: any;
            entityId: any;
            reason: any;
            revokedAt: any;
        }[];
        currentCursor: number;
        nextCursor: number;
        currentTombstoneCursor: number;
        nextTombstoneCursor: number;
        maxOfflineHours: any;
        offlineAuthPolicyApproved: boolean;
        offlinePolicyStatus: string;
        syncedAt: string;
        centerId: string;
    }>;
    /**
     * Acknowledge cursor advance strictly in the device's tenant database
     */
    static acknowledge(deviceCtx: DeviceAuthContext, downstreamCursor: number, downstreamTombstoneCursor: number, clientAppVersion?: string): Promise<{
        acknowledged: boolean;
        deviceId: string;
        downstreamCursor: number;
        downstreamTombstoneCursor: number;
        acknowledgedAt: string;
    }>;
    /**
     * Get device synchronization status strictly from the device's tenant database
     */
    static getStatus(deviceCtx: DeviceAuthContext): Promise<{
        deviceId: any;
        organizationId: any;
        centerId: any;
        deviceIdentifier: any;
        status: any;
        maxOfflineHours: number;
        lastSeenAt: any;
        lastSyncedAt: any;
        downstreamCursor: number;
        downstreamTombstoneCursor: number;
        health: string;
    }>;
}
//# sourceMappingURL=sync.service.d.ts.map