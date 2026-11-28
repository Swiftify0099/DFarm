import { Response } from 'express';
import pg from 'pg';
export type DashboardEventType = 'COLLECTION_ACCEPTED' | 'COLLECTION_SYNCED' | 'COLLECTION_REJECTED' | 'COLLECTION_MANUAL_REVIEW' | 'SESSION_OPENED' | 'SESSION_CLOSED' | 'STATION_HEARTBEAT' | 'STATION_STATUS_CHANGED' | 'DEVICE_BLOCKED' | 'DEVICE_REVOKED';
export interface DashboardEvent {
    eventId: string;
    eventType: DashboardEventType;
    schemaVersion: number;
    organizationId: string;
    centerId?: string | null;
    entityId: string;
    aggregateVersion: number;
    occurredAt: string;
    publishedAt: string;
    payload: Record<string, any>;
}
export type OutboxErrorCategory = 'INVALID_MAPPING' | 'TRANSIENT_UNAVAILABLE' | 'EXECUTION_ERROR';
export interface TenantOutboxRunResult {
    organizationId: string;
    ok: boolean;
    pendingProcessed: number;
    crossInstanceDispatched: number;
    errorCategory?: OutboxErrorCategory;
    errorCode?: string;
    errorStatus?: string;
    errorMessage?: string;
}
export interface OutboxBatchRunSummary {
    startedAt: string;
    completedAt: string;
    tenantsAttempted: number;
    tenantsSucceeded: number;
    tenantsFailed: number;
    pendingProcessed: number;
    crossInstanceDispatched: number;
    controlPlaneDiscoveryFailed: boolean;
    controlPlaneError?: string;
    failures: TenantOutboxRunResult[];
}
export interface TenantOutboxPurgeResult {
    organizationId: string;
    ok: boolean;
    purgedCount: number;
    errorCategory?: OutboxErrorCategory;
    errorCode?: string;
    errorStatus?: string;
    errorMessage?: string;
}
export interface OutboxPurgeRunSummary {
    startedAt: string;
    completedAt: string;
    retentionDays: number;
    tenantsAttempted: number;
    tenantsSucceeded: number;
    tenantsFailed: number;
    totalPurged: number;
    controlPlaneDiscoveryFailed: boolean;
    controlPlaneError?: string;
    failures: TenantOutboxPurgeResult[];
}
export interface OutboxObservabilitySnapshot {
    totalBatchRuns: number;
    totalFailedTenantBatches: number;
    totalPersistenceFailures: number;
    totalPurgeFailures: number;
    lastBatchSummary: OutboxBatchRunSummary | null;
    lastPurgeSummary: OutboxPurgeRunSummary | null;
    lastFailureByTenant: Record<string, {
        operation: string;
        category: OutboxErrorCategory;
        code?: string;
        status?: string;
        message: string;
        occurredAt: string;
    }>;
}
/**
 * Tenant-scoped Transactional Outbox & SSE Realtime Event Publisher.
 *
 * Delivery guarantee:
 * - Implements safe **at-least-once delivery** per tenant database (`dashboard_events_outbox`)
 *   with stable `eventId` values and client-side consumer deduplication (`eventId` set).
 * - Worker ticks claim `PENDING` rows with `SELECT ... FOR UPDATE SKIP LOCKED` inside an active
 *   tenant PostgreSQL transaction bound to `app.current_organization_id`, dispatch to SSE clients,
 *   and mark `status = 'PUBLISHED', published_at = COALESCE(published_at, NOW())` on the same
 *   session/transaction before advancing memory ring buffers or updating `COMMIT`.
 * - Crashes or errors before `COMMIT` roll back cleanly, keeping committed rows `PENDING` for retry.
 */
export declare class RealtimeEventPublisher {
    private static instance;
    private clients;
    private readonly tenantRingBuffers;
    private readonly tenantSyncCursors;
    private heartbeatInterval;
    private outboxWorkerInterval;
    private retentionCleanupInterval;
    private isProcessingOutbox;
    private isDestroyed;
    private destroyPromise;
    private readonly inFlightBackgroundWork;
    private totalBatchRuns;
    private totalFailedTenantBatches;
    private totalPersistenceFailures;
    private totalPurgeFailures;
    private lastBatchSummary;
    private lastPurgeSummary;
    private readonly lastFailureByTenant;
    private constructor();
    private trackBackgroundWork;
    getInFlightBackgroundWorkCount(): number;
    getObservabilitySnapshot(): OutboxObservabilitySnapshot;
    getLastOutboxBatchSummary(): OutboxBatchRunSummary | null;
    static getInstance(): RealtimeEventPublisher;
    private classifyOutboxError;
    private recordTenantFailure;
    private resolveStrictTenantDb;
    private discoverActiveTenantsBounded;
    private runWithBoundedConcurrency;
    private evictOldestTenantStatesIfNeeded;
    private getOrCreateTenantRingState;
    private appendToTenantRingBuffer;
    private getOrInitTenantSyncCursor;
    private markDispatchedLocally;
    private hasBeenDispatchedLocally;
    private hasConnectedClientsForTenant;
    private mapOutboxRowToEvent;
    /**
     * Registers an active SSE client stream.
     * Handles tenant filtering, optional center filtering, initial watermark, and cleanup on disconnect.
     */
    registerClient(params: {
        organizationId: string;
        centerId?: string | null;
        res: Response;
        lastEventId?: string;
    }): {
        clientId: string;
        unregister: () => void;
    };
    /**
     * Forcibly closes all active client SSE sockets (used for connection drop simulation & teardown)
     */
    disconnectAllClients(): void;
    /**
     * Publishes an event transactionally within a PostgreSQL transaction.
     * Inserts the outbox record inside the caller's active transaction client.
     * The Outbox Worker or post-commit broadcast picks it up for delivery.
     */
    publishWithTransaction(client: pg.PoolClient, eventData: {
        eventId?: string;
        eventType: DashboardEventType;
        organizationId: string;
        centerId?: string | null;
        entityId: string;
        payload: Record<string, any>;
        aggregateVersion?: number;
        occurredAt?: string;
    }): Promise<DashboardEvent>;
    /**
     * Broadcasts an event immediately to connected SSE subscribers.
     * Also persists/marks the outbox record PUBLISHED in the event's strict tenant DB for replay & cross-instance sync.
     */
    broadcast(event: DashboardEvent): void;
    /**
     * Internal helper to dispatch an event to local connected SSE subscribers.
     */
    protected dispatchToClients(event: DashboardEvent): void;
    /**
     * Processes PENDING outbox rows and cross-instance PUBLISHED sync for one specific tenant organization.
     * Executes strictly inside the resolved tenant PostgreSQL database with transaction-local RLS context.
     */
    processTenantOutboxBatch(organizationId: string): Promise<TenantOutboxRunResult>;
    private syncCrossInstancePublishedEvents;
    /**
     * Transactional Outbox Batch Worker with full observability summary.
     * Discovers active tenants from central mapping table using bounded pagination and processes
     * each tenant strictly in its own tenant PostgreSQL database with bounded concurrency.
     */
    processOutboxBatchDetailed(): Promise<OutboxBatchRunSummary>;
    /**
     * Backward-compatible batch worker entrypoint returning total PENDING events published across active tenants.
     */
    processOutboxBatch(): Promise<number>;
    /**
     * Helper to write a single formatted SSE frame:
     * id: <eventId>\n
     * event: <eventType>\n
     * data: <JSON>\n\n
     */
    private sendSseFrame;
    /**
     * Sends heartbeat keep-alive comment frames to all clients to prevent proxy timeouts.
     */
    private sendKeepAlivePing;
    /**
     * Replays missed events since Last-Event-ID for reconnecting clients.
     * Uses tenant-isolated in-memory ring buffer first, then falls back strictly to that tenant's
     * durable PostgreSQL outbox. Missing, invalid, or cross-tenant cursors emit RESYNC_REQUIRED.
     */
    private replayMissedEvents;
    /**
     * Persists a direct event to the target organization's strict tenant outbox database.
     * Uses ON CONFLICT (event_id) DO UPDATE preserving existing event identity/payload while transitioning PUBLISHED.
     * Fails loudly on invalid mapping or database errors so callers/telemetry observe every failure.
     */
    persistOutboxEvent(event: DashboardEvent): Promise<void>;
    /**
     * Strips sensitive farmer credentials, raw phone numbers, bank details, and secrets from payloads.
     */
    sanitizePayload(payload: Record<string, any>): Record<string, any>;
    /**
     * Tenant-scoped retention cleanup for old published outbox events for a single tenant.
     */
    purgeTenantOldOutboxEvents(organizationId: string, retentionDays?: number, batchSize?: number): Promise<TenantOutboxPurgeResult>;
    /**
     * Safe scheduled cleanup for old published outbox events across active tenants with full summary.
     * - Runs strictly per tenant database inside an explicit transaction with FOR UPDATE SKIP LOCKED.
     * - Never deletes PENDING or FAILED events, and isolates failures per tenant.
     */
    purgeOldOutboxEventsDetailed(retentionDays?: number, batchSize?: number): Promise<OutboxPurgeRunSummary>;
    /**
     * Backward-compatible cleanup entrypoint returning total purged events across active tenants.
     */
    purgeOldOutboxEvents(retentionDays?: number, batchSize?: number): Promise<number>;
    destroy(): Promise<void>;
}
export declare const realtimePublisher: RealtimeEventPublisher;
//# sourceMappingURL=RealtimeEventPublisher.d.ts.map