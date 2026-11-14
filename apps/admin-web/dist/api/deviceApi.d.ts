export interface DeviceInfo {
    id: string;
    organizationId: string;
    centerId: string;
    centerName?: string;
    centerCode?: string;
    deviceIdentifier: string;
    deviceType: 'COLLECTION_COUNTER_POS' | 'REGISTRATION_TABLET' | 'ANALYZER_BRIDGE' | 'PRINTER_HUB';
    status: 'ACTIVE' | 'PENDING_APPROVAL' | 'BLOCKED' | 'DECOMMISSIONED';
    lastSeenAt?: string | null;
    createdAt: string;
    maxOfflineHours: number;
    offlineAuthPolicyApproved: boolean;
    approvedMaxOfflineHours?: number;
    downstreamCursor?: number;
    clientAppVersion?: string;
    lastSyncedAt?: string;
}
export interface SyncConflictRecord {
    id: string;
    deviceId: string;
    deviceIdentifier?: string;
    deviceType?: string;
    centerName?: string;
    idempotencyKey: string;
    entityType: string;
    entityId: string;
    conflictReason: string;
    clientPayload: any;
    serverState: any;
    resolvedBy?: string | null;
    recordedAt: string;
}
export interface SyncEventRecord {
    id: string;
    eventSequence: number;
    centerId?: string;
    centerName?: string;
    entityType: string;
    entityId: string;
    action: string;
    payload: any;
    createdAt: string;
}
export declare const deviceApi: {
    listDevices: (params?: {
        centerId?: string;
    }) => Promise<DeviceInfo[]>;
    approveOfflinePolicy: (deviceId: string, maxOfflineHours?: number) => Promise<any>;
    revokeDevice: (deviceId: string, reason: string) => Promise<any>;
    getConflicts: () => Promise<SyncConflictRecord[]>;
    getEvents: () => Promise<SyncEventRecord[]>;
};
//# sourceMappingURL=deviceApi.d.ts.map