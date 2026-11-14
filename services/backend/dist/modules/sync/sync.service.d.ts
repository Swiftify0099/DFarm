export declare class SyncService {
    /**
     * Push offline events to central database
     */
    static pushEvents(batchData: any): Promise<{
        success: boolean;
        applied: number;
        conflicts: number;
        results: any[];
        processedAt: string;
    }>;
    /**
     * Pull incremental changes from central database
     */
    static pullChanges(deviceId: string, cursor: number, tombstoneCursor: number, centerId?: string): Promise<{
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
        centerId: any;
    }>;
    /**
     * Acknowledge cursor advance
     */
    static acknowledge(deviceId: string, downstreamCursor: number, downstreamTombstoneCursor: number, clientAppVersion?: string): Promise<{
        acknowledged: boolean;
        deviceId: string;
        downstreamCursor: number;
        downstreamTombstoneCursor: number;
        acknowledgedAt: string;
    }>;
    /**
     * Get device synchronization status
     */
    static getStatus(deviceId: string): Promise<{
        deviceId: any;
        deviceIdentifier: any;
        status: any;
        maxOfflineHours: any;
        lastSeenAt: any;
        lastSyncedAt: any;
        downstreamCursor: number;
        downstreamTombstoneCursor: number;
        health: string;
    }>;
}
//# sourceMappingURL=sync.service.d.ts.map