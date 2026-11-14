export declare enum SyncStatus {
    LOCAL_ONLY = "LOCAL_ONLY",
    PENDING_SYNC = "PENDING_SYNC",
    SYNCING = "SYNCING",
    SYNCED = "SYNCED",
    RETRY_REQUIRED = "RETRY_REQUIRED",
    CONFLICT = "CONFLICT",
    REVOKED = "REVOKED"
}
export declare enum SyncAction {
    INSERT = "INSERT",
    UPDATE = "UPDATE",
    DELETE = "DELETE",
    RESTORE = "RESTORE"
}
export declare enum SyncEntityType {
    CUSTOMER = "CUSTOMER",
    FACE_ENROLLMENT = "FACE_ENROLLMENT",
    RFID_CARD = "RFID_CARD",
    RATE_CHART = "RATE_CHART",
    MILK_COLLECTION = "MILK_COLLECTION",
    COLLECTION_SESSION = "COLLECTION_SESSION",
    CUSTOMER_REGISTRATION = "CUSTOMER_REGISTRATION",
    AUDIT_LOG = "AUDIT_LOG"
}
export declare enum DeviceType {
    REGISTRATION_TABLET = "REGISTRATION_TABLET",
    COUNTER_TERMINAL = "COUNTER_TERMINAL",
    MOBILE_COLLECTOR = "MOBILE_COLLECTOR"
}
export declare enum DeviceStatus {
    ACTIVE = "ACTIVE",
    BLOCKED = "BLOCKED",
    DECOMMISSIONED = "DECOMMISSIONED"
}
export declare enum ConflictReason {
    DUPLICATE_MOBILE = "DUPLICATE_MOBILE",
    STALE_VERSION = "STALE_VERSION",
    CUSTOMER_REVOKED = "CUSTOMER_REVOKED",
    CUSTOMER_INACTIVE_OR_REVOKED = "CUSTOMER_INACTIVE_OR_REVOKED",
    RATE_VERSION_MISMATCH = "RATE_VERSION_MISMATCH",
    CARD_ALREADY_ASSIGNED = "CARD_ALREADY_ASSIGNED",
    DEVICE_REVOKED = "DEVICE_REVOKED",
    CONSENT_REVOKED = "CONSENT_REVOKED"
}
export interface SyncEventItem {
    eventId: string;
    entityType: SyncEntityType | string;
    action: SyncAction | string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    clientTimestamp: string;
}
export interface SyncPushRequest {
    deviceId: string;
    batchId: string;
    events: SyncEventItem[];
}
export interface SyncEventResult {
    eventId: string;
    status: 'SUCCESS' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';
    serverId?: string;
    canonicalCustomerUuid?: string;
    reason?: string;
    message?: string;
}
export interface SyncPushResponse {
    batchId: string;
    processedCount: number;
    successCount: number;
    conflictCount: number;
    duplicateCount: number;
    results: SyncEventResult[];
    serverTimestamp: string;
}
export interface DownstreamSyncEvent {
    id: string;
    eventSequence: number;
    organizationId: string;
    centerId: string | null;
    entityType: string;
    entityId: string;
    action: string;
    payload: Record<string, unknown>;
    createdAt: string;
}
export interface DownstreamTombstone {
    id: string;
    tombstoneSequence: number;
    organizationId: string;
    centerId: string | null;
    entityType: string;
    entityId: string;
    reason: string;
    deletedAt: string;
}
export interface DownstreamFaceTemplate {
    id: string;
    customerId: string;
    modelVersionId: string;
    modelName: string;
    modelVersion: string;
    embeddingEncryptedHex: string;
    embeddingIvHex: string;
    qualityScore: number;
    status: string;
}
export interface DownstreamRateCell {
    id: string;
    rateChartVersionId: string;
    milkCategory: string;
    fatPercentage: number;
    snfPercentage: number;
    ratePerUnit: number;
}
export interface SyncPullResponse {
    events: DownstreamSyncEvent[];
    tombstones: DownstreamTombstone[];
    faceTemplates: DownstreamFaceTemplate[];
    rateCells: DownstreamRateCell[];
    nextCursor: number;
    nextTombstoneCursor: number;
    hasMore: boolean;
    serverTimestamp: string;
    maxOfflineAuthHours: number;
}
export interface SyncAcknowledgeRequest {
    downstreamCursor: number;
    downstreamTombstoneCursor?: number;
    clientAppVersion?: string;
}
export interface SyncAcknowledgeResponse {
    acknowledged: boolean;
    downstreamCursor: number;
    downstreamTombstoneCursor: number;
}
export interface SyncStatusResponse {
    deviceId: string;
    deviceIdentifier: string;
    status: DeviceStatus | string;
    lastUpstreamSyncAt: string | null;
    lastDownstreamSyncAt: string | null;
    downstreamCursor: number;
    serverCursor: number;
    serverTimestamp: string;
    maxOfflineAuthHours: number;
}
export interface DeviceRegisterRequest {
    organizationId: string;
    centerId: string;
    deviceIdentifier: string;
    deviceType: DeviceType | string;
    publicKey?: string;
    appVersion?: string;
}
export interface DeviceRegisterResponse {
    deviceId: string;
    deviceIdentifier: string;
    organizationId: string;
    centerId: string;
    deviceType: string;
    status: string;
    token: string;
    maxOfflineHours: number;
    registeredAt: string;
}
//# sourceMappingURL=sync.d.ts.map